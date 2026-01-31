import { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import mermaid from 'mermaid';
import { runAndTrace } from './tracer';
import './App.css';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

function App() {
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [allTraceData, setAllTraceData] = useState({});
  const [variableName, setVariableName] = useState('');
  const [running, setRunning] = useState(false);

  const editorRef = useRef(null);
  const diagramRef = useRef(null);
  const diagramIdRef = useRef(0);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  /* ---------------- Mermaid safety ---------------- */
  const mermaidSafe = (value) => {
    if (value == null) return 'null';
    return String(value)
      .replace(/"/g, "'")
      .replace(/[<>]/g, '')
      .replace(/\n/g, ' ')
      .slice(0, 80);
  };

  const generateMermaid = (trace, varName) => {
    let mermaidStr = 'graph TD\n';

    trace.forEach((v, i) => {
      const nodeId = `N${i}`;
      const label = `${varName} = ${v.value}<br/>line ${v.line} (${v.function})`;
      mermaidStr += `${nodeId}["${label}"]\n`;

      if (i < trace.length - 1) {
        mermaidStr += `${nodeId} --> N${i + 1}\n`;
      }
    });

    return mermaidStr;
  };

  const renderDiagram = async () => {
    if (!diagramRef.current) return;

    const trace = allTraceData[variableName];
    if (!trace || trace.length === 0) {
      diagramRef.current.innerHTML =
        '<p style="color:#666;text-align:center;padding:2rem;">Select a variable to view its trace</p>';
      return;
    }

    const diagramDef = generateMermaid(trace, variableName);
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

  /* ---------------- Run backend ---------------- */
  const handleRun = async () => {
    setRunning(true);
    setOutput('Running...\n');
    setAllTraceData({});
    setVariableName('');
    if (diagramRef.current) diagramRef.current.innerHTML = '';

    try {
      const code = editorRef.current.getValue();
      const { output: progOutput, traceData } = await runAndTrace(code);

      setAllTraceData(traceData);
      setOutput(progOutput || '(no output)');
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    }

    setRunning(false);
  };

  /* ---------------- Re-render diagram on variable change ---------------- */
  useEffect(() => {
    if (variableName) renderDiagram();
  }, [variableName]);

  return (
    <div className="app-container">
      <h1 className="app-title">Tracer</h1>

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
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value="">-- select --</option>
            {Object.keys(allTraceData).map(v => (
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
            <pre className="output-pre">{output}</pre>
          </div>
          <div className="diagram-panel">
            <div className="diagram-container" ref={diagramRef}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;