// App.jsx
import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import mermaid from 'mermaid';
import './App.css';

mermaid.initialize({ startOnLoad: false });

function App() {
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [variableName, setVariableName] = useState('x');
  const diagramRef = useRef(null);

  const [running, setRunning] = useState(false);

  const runCode = () => {
    setOutput('Run clicked (stub)');
  };

  const handleEditorMount = () => { };

  const variableTrace = [
    { line: 1, function: 'main', value: 0 },
    { line: 2, function: 'main', value: 1 },
    { line: 3, function: 'main', value: 3 },
    { line: 4, function: 'main', value: 6 },
    { line: 5, function: 'main', value: 10 }
  ];

  const generateMermaid = (trace) => {
    let mermaidStr = 'graph TD\n'; // graph header

    trace.forEach((v, i) => {
      const nodeId = `L${v.line}`; // ONLY letters/numbers
      const label = `${v.value} (line ${v.line})`; // label with parentheses is fine
      mermaidStr += `${nodeId}["${label}"]\n`; // wrap label in quotes
      const next = trace[i + 1];
      if (next) {
        mermaidStr += `${nodeId} --> L${next.line}\n`; // edge must use IDs only
      }
    });

    return mermaidStr;
  };

  const renderTestDiagram = () => {
    if (!diagramRef.current) return;

    const diagramDef = generateMermaid(variableTrace);

    // Correctly render SVG
    const id = `diagram-${Date.now()}`;

    mermaid.render(id, diagramDef)
      .then((obj) => {
        diagramRef.current.innerHTML = obj.svg; // IMPORTANT: use obj.svg
      })
      .catch((err) => {
        setOutput(`Mermaid render error: ${err}`);
      });

    setOutput('Test diagram rendered (fixed example case).');
  };

  return (
    <div className="app-container">
      <h1 className="app-title">Tracer - Test Diagram</h1>
      <div className="controls">
        <button onClick={renderTestDiagram} style={{ marginRight: '1rem' }}>
          Render Test Diagram
        </button>
        <label className="variable-input">
          Variable to trace:
          <input
            type="text"
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
          />
        </label>
      </div>

      <div className="controls">
        <button
          onClick={runCode}
          disabled={running}
          className="run-button"
        >
          {running ? 'Running...' : 'Run'}
        </button>

        <div className="language-selector">
          <label>Language:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="python">Python</option>
          </select>
        </div>
      </div>

      <div className="main-panel">
        {/* Editor */}
        <div className="editor-panel">
          <div className="editor-container">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
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


