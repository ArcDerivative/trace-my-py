// App.jsx
import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import mermaid from 'mermaid';
import './App.css';

mermaid.initialize({ startOnLoad: false });

function App() {
  const [output, setOutput] = useState('');
  const [variableName, setVariableName] = useState('x');
  const diagramRef = useRef(null);

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
  mermaid
    .render('svgTestDiagram', diagramDef)
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
      <h1>Python Tracer - Test Diagram</h1>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={renderTestDiagram} style={{ marginRight: '1rem' }}>
          Render Test Diagram
        </button>
        <label>
          Variable to trace:
          <input
            type="text"
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
            style={{ marginLeft: '0.3rem' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* Editor */}
        <div style={{ flex: 1 }}>
          <Editor
            height="300px"
            defaultLanguage="python"
            defaultValue={`# Type anything here\nx = 0\nfor i in range(5):\n    x += i\nprint(x)`}
          />
        </div>

        {/* Output + Diagram */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#1e1e1e', color: '#fff', padding: '1rem', minHeight: '50px' }}>
            {output}
          </div>
          <div
            ref={diagramRef}
            style={{ border: '1px solid #333', padding: '1rem', minHeight: '300px', overflow: 'auto' }}
          ></div>
        </div>
      </div>
    </div>
  );
}

export default App;


