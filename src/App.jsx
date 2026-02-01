import { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import mermaid from 'mermaid';
import { runAndTrace } from './tracer';
import './App.css';

mermaid.initialize({ 
  startOnLoad: false, 
  theme: 'dark',
  themeVariables: {
    background: '#1e293b',
    primaryColor: '#334155',
    primaryTextColor: '#f8fafc',
    lineColor: '#a78bfa'
  }
});

function App() {
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [allTraceData, setAllTraceData] = useState({});
  const [selectedVar, setSelectedVar] = useState(''); // dropdown selection
  const [hoveredVar, setHoveredVar] = useState(null); // hover selection (takes priority)
  const [errorMessage, setErrorMessage] = useState(null);
  const [running, setRunning] = useState(false);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const diagramRef = useRef(null);
  const diagramIdRef = useRef(0);
  const decorationsRef = useRef([]);
  const lineToVarMapRef = useRef({});

  // The active variable is hoveredVar if set, otherwise selectedVar
  const activeVar = hoveredVar || selectedVar;

  // Build map: line number -> scoped variable name
  const buildLineToVarMap = (traceData) => {
    const map = {};
    for (const [scopedVar, traces] of Object.entries(traceData)) {
      for (const trace of traces) {
        // Store first variable found on each line
        if (!map[trace.line]) {
          map[trace.line] = scopedVar;
        }
      }
    }
    return map;
  };

  // Update line-to-var map when trace data changes
  useEffect(() => {
    lineToVarMapRef.current = buildLineToVarMap(allTraceData);
  }, [allTraceData]);

  // Extract raw variable name from scoped name ("global::x" -> "x")
  const getRawVarName = (scopedVar) => {
    if (!scopedVar) return '';
    const parts = scopedVar.split('::');
    return parts[parts.length - 1];
  };

  // Clear all editor highlights
  const clearHighlights = () => {
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  };

  // Highlight a line and all occurrences of a variable
  const highlightVariable = (scopedVar, hoveredLine) => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    const rawVarName = getRawVarName(scopedVar);

    if (!rawVarName) {
      clearHighlights();
      return;
    }

    const newDecorations = [];

    // 1. Highlight the hovered line (whole line background)
    newDecorations.push({
      range: new monaco.Range(hoveredLine, 1, hoveredLine, 1),
      options: {
        isWholeLine: true,
        className: 'hovered-line-highlight'
      }
    });

    // 2. Find and highlight all occurrences of the variable
    const text = model.getValue();
    const lines = text.split('\n');
    const regex = new RegExp(`\\b${rawVarName}\\b`, 'g');

    lines.forEach((lineContent, index) => {
      const lineNum = index + 1;
      let match;
      // Reset regex for each line
      regex.lastIndex = 0;
      while ((match = regex.exec(lineContent)) !== null) {
        newDecorations.push({
          range: new monaco.Range(
            lineNum,
            match.index + 1,
            lineNum,
            match.index + 1 + rawVarName.length
          ),
          options: {
            inlineClassName: 'variable-highlight'
          }
        });
      }
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  };

  // Handle mouse hover on editor
  const handleLineHover = (lineNumber) => {
    const scopedVar = lineToVarMapRef.current[lineNumber];

    if (scopedVar) {
      setHoveredVar(scopedVar);
      highlightVariable(scopedVar, lineNumber);
    } else {
      clearHighlights();
      setHoveredVar(null);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track mouse movement
    editor.onMouseMove((e) => {
      if (e.target && e.target.position) {
        const lineNumber = e.target.position.lineNumber;
        handleLineHover(lineNumber);
      }
    });

    // Clear highlights when mouse leaves editor area
    editor.onMouseLeave(() => {
      clearHighlights();
      setHoveredVar(null);
    });
  };

  /* ---------------- Mermaid ---------------- */
  const mermaidSafe = (value) => {
    if (value == null) return 'null';
    return String(value)
      .replace(/"/g, "'")
      .replace(/[<>]/g, '')
      .replace(/\n/g, ' ')
      .slice(0, 80);
  };

  const generateMermaid = (trace, varName, error) => {
    let mermaidStr = 'graph TD\n';

    trace.forEach((v, i) => {
      const nodeId = `N${i}`;
      const functionName = v.function.charAt(0).toUpperCase() + v.function.slice(1);
      const label = `${functionName}<br/>${varName} = ${mermaidSafe(v.value)}<br/>line ${v.line}`;
      mermaidStr += `${nodeId}["${label}"]\n`;
      if (i < trace.length - 1) {
        mermaidStr += `${nodeId} --> N${i + 1}\n`;
      }
    });

    if (error) {
      const lastNode = trace.length > 0 ? `N${trace.length - 1}` : null;
      const errorNode = `ERR`;
      mermaidStr += `${errorNode}["❌ Error<br/>${mermaidSafe(error)}"]\n`;
      if (lastNode) {
        mermaidStr += `${lastNode} --> ${errorNode}\n`;
      }
    }

    return mermaidStr;
  };

  const renderDiagram = async () => {
    if (!diagramRef.current) return;

    const trace = allTraceData[activeVar] || [];
    if (trace.length === 0 && !errorMessage) {
      diagramRef.current.innerHTML =
        '<p style="color:#666;text-align:center;padding:2rem;">Hover over an assignment or select a variable</p>';
      return;
    }

    const diagramDef = generateMermaid(trace, activeVar, errorMessage);
    diagramIdRef.current += 1;

    try {
      const { svg } = await mermaid.render(
        `diagram-${diagramIdRef.current}`,
        diagramDef
      );
      diagramRef.current.innerHTML = svg;
    } catch (err) {
      diagramRef.current.innerHTML =
        `<pre style="color:red">Mermaid error:\n${err.message}</pre>`;
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setOutput('Running...\n');
    setAllTraceData({});
    setSelectedVar('');
    setHoveredVar(null);
    setErrorMessage(null);
    clearHighlights();
    if (diagramRef.current) diagramRef.current.innerHTML = '';

    try {
      const code = editorRef.current.getValue();
      const { output: progOutput, traceData, errorMessage } = await runAndTrace(code);

      setAllTraceData(traceData);
      setErrorMessage(errorMessage || null);
      setOutput(progOutput || '(no output)');
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    }

    setRunning(false);
  };

  // Re-render diagram when active variable changes
  useEffect(() => {
    if (activeVar) {
      renderDiagram();
    }
  }, [activeVar, allTraceData, errorMessage]);

  return (
    <div className="app-container">
      <h1 className="app-title">Variable Tracer</h1>

      {/* Controls */}
      <div className="controls">
        <select
          className="language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="python">Python</option>
        </select>

        <label className="variable-input">
          Variable to trace:
          <select
            value={selectedVar}
            onChange={(e) => setSelectedVar(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value="">-- select --</option>
            {Object.keys(allTraceData).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>

        <button
          className="run-button"
          onClick={handleRun}
          disabled={running}
        >
          {running ? 'Running...' : 'Run & Trace'}
        </button>
      </div>

      {/* Main layout */}
      <div className="main-panel">
        {/* Editor */}
        <div className="editor-panel">
          <h3 className="panel-header">Code Editor</h3>
          <div className="editor-container">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              defaultValue={`x = 0
for i in range(5):
    x += i
print(x)`}
              onMount={handleEditorMount}
            />
          </div>
        </div>

        {/* Output + Diagram */}
        <div className="output-diagram-panel">
          <div className="output-panel">
            <h3 className="panel-header">Console Output</h3>
            <pre className="output-pre">{output}</pre>
          </div>
          <div className="diagram-panel">
            <h3 className="panel-header">
              Variable Flow Diagram
              {activeVar && <span style={{ fontWeight: 'normal', marginLeft: '0.5rem' }}>({activeVar})</span>}
            </h3>
            <div className="diagram-container" ref={diagramRef}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
