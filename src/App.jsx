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
    lineColor: '#4a90d9'
  },
  flowchart: {
    curve: 'basis',
    nodeSpacing: 50,
    rankSpacing: 50
  }
});

const getDisplayName = (scopedVar) => {
  if (!scopedVar) return '';
  const parts = scopedVar.split('::');
  if (parts.length < 2) return scopedVar;
  const scope = parts[0];
  const varName = parts[1];
  if (scope === 'global') {
    return varName;
  }
  return `${varName} (${scope})`;
};

const getRawVarName = (scopedVar) => {
  if (!scopedVar) return '';
  const parts = scopedVar.split('::');
  return parts[parts.length - 1];
};

function App() {
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [allTraceData, setAllTraceData] = useState({});
  const [selectedVar, setSelectedVar] = useState('');
  const [hoveredVar, setHoveredVar] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const diagramRef = useRef(null);
  const diagramIdRef = useRef(0);
  const decorationsRef = useRef([]);
  const lineToVarMapRef = useRef({});

  const activeVar = hoveredVar || selectedVar;
  const hasTraceData = Object.keys(allTraceData).length > 0;
  const hasSyntaxError = hasRun && errorMessage && !hasTraceData;

  const buildLineToVarMap = (traceData) => {
    const map = {};
    for (const [scopedVar, traces] of Object.entries(traceData)) {
      for (const trace of traces) {
        if (!map[trace.line]) {
          map[trace.line] = scopedVar;
        }
      }
    }
    return map;
  };

  useEffect(() => {
    lineToVarMapRef.current = buildLineToVarMap(allTraceData);
  }, [allTraceData]);

  const clearHighlights = () => {
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  };

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

    newDecorations.push({
      range: new monaco.Range(hoveredLine, 1, hoveredLine, 1),
      options: {
        isWholeLine: true,
        className: 'hovered-line-highlight'
      }
    });

    const text = model.getValue();
    const lines = text.split('\n');
    const regex = new RegExp(`\\b${rawVarName}\\b`, 'g');

    lines.forEach((lineContent, index) => {
      const lineNum = index + 1;
      let match;
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

  const handleLineHover = (lineNumber) => {
    const scopedVar = lineToVarMapRef.current[lineNumber];

    if (scopedVar) {
      setHoveredVar(scopedVar);
      setSelectedVar(scopedVar); // Sync dropdown with hover
      highlightVariable(scopedVar, lineNumber);
    } else {
      clearHighlights();
      setHoveredVar(null);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onMouseMove((e) => {
      if (e.target && e.target.position) {
        const lineNumber = e.target.position.lineNumber;
        handleLineHover(lineNumber);
      }
    });

    editor.onMouseLeave(() => {
      clearHighlights();
      setHoveredVar(null);
    });
  };

  const mermaidSafe = (value) => {
    if (value == null) return 'null';
    return String(value)
      .replace(/"/g, "'")
      .replace(/[<>]/g, '')
      .replace(/\n/g, ' ')
      .slice(0, 80);
  };

  const generateMermaid = (trace, scopedVar, error) => {
    let mermaidStr = `%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#334155', 'primaryTextColor': '#f8fafc', 'lineColor': '#22d3ee' }}}%%
  graph TD
  `;
    const rawName = getRawVarName(scopedVar);

    trace.forEach((v, i) => {
      const nodeId = `N${i}`;
      const scopeLabel = v.function === 'global' ? '' : ` (${v.function})`;
      const label = `${rawName} = ${mermaidSafe(v.value)}${scopeLabel}<br/>line ${v.line}`;
      mermaidStr += `${nodeId}["${label}"]\n`;
      mermaidStr += `style ${nodeId} rx:10,ry:10\n`;
      if (i < trace.length - 1) {
        mermaidStr += `${nodeId} --> N${i + 1}\n`;
      }
    });

    if (error) {
      const lastNode = trace.length > 0 ? `N${trace.length - 1}` : null;
      const errorNode = `ERR`;
      mermaidStr += `${errorNode}["❌ Error<br/>${mermaidSafe(error)}"]\n`;
      mermaidStr += `style ${errorNode} rx:10,ry:10\n`;
      if (lastNode) {
        mermaidStr += `${lastNode} --> ${errorNode}\n`;
      }
    }

    return mermaidStr;
  };

  const renderDiagram = async () => {
    if (!diagramRef.current) return;

    // Not run yet
    if (!hasRun) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">code must be run :)</p>';
      return;
    }

    // Syntax error (no trace data)
    if (hasSyntaxError) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">code must be run without syntax errors :))</p>';
      return;
    }

    // No variable selected
    const trace = allTraceData[activeVar] || [];
    if (trace.length === 0 && !errorMessage) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">Hover over an assignment or select a variable</p>';
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
      
      // Round the corners of all rect elements
      const rects = diagramRef.current.querySelectorAll('rect.basic');
      rects.forEach((rect) => {
        rect.setAttribute('rx', '10');
        rect.setAttribute('ry', '10');
      });
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
    setHasRun(false);
    clearHighlights();
    if (diagramRef.current) diagramRef.current.innerHTML = '';

    try {
      const code = editorRef.current.getValue();
      const { output: progOutput, traceData, errorMessage } = await runAndTrace(code);

      setAllTraceData(traceData);
      setErrorMessage(errorMessage || null);
      setOutput(progOutput || '(no output)');
      setHasRun(true);
    } catch (err) {
      setOutput(`Error: ${err.message}`);
      setHasRun(true);
    }

    setRunning(false);
  };

  useEffect(() => {
    renderDiagram();
  }, [activeVar, allTraceData, errorMessage, hasRun]);

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
              <option key={v} value={v}>{getDisplayName(v)}</option>
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
              defaultValue={`counter = 0

def increment():
    global counter
    counter += 1
    step = 1
    return step

def add_local():
    x = 10
    x = x + 5
    return x

increment()
increment()
result = add_local()
print(f"counter = {counter}, result = {result}")`}
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
              Variable Flow
              {activeVar && <span style={{ fontWeight: 'normal', marginLeft: '0.5rem' }}>— {getDisplayName(activeVar)}</span>}
            </h3>
            <div className="diagram-container" ref={diagramRef}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
