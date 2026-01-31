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
  const [variableName, setVariableName] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
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

    // Add error node if present
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

    const trace = allTraceData[variableName] || [];
    if (trace.length === 0 && !errorMessage) {
      diagramRef.current.innerHTML =
        '<p style="color:#666;text-align:center;padding:2rem;">Select a variable to view its trace</p>';
      return;
    }

    const diagramDef = generateMermaid(trace, variableName, errorMessage);
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
    setVariableName('');
    setErrorMessage(null);
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

  useEffect(() => {
    if (variableName) renderDiagram();
  }, [variableName, allTraceData, errorMessage]);

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
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
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
            <h3 className="panel-header">Variable Flow Diagram</h3>
            <div className="diagram-container" ref={diagramRef}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;







// // App.jsx
// import { useState, useRef } from 'react';
// import Editor from '@monaco-editor/react';
// import mermaid from 'mermaid';
// import './App.css';

// mermaid.initialize({ startOnLoad: false });

// function App() {
//   const [language, setLanguage] = useState('python');
//   const [output, setOutput] = useState('');
//   const [variableName, setVariableName] = useState('x');
//   const diagramRef = useRef(null);

//   const [running, setRunning] = useState(false);

//   const runCode = () => {
//     setOutput('Run clicked (stub)');
//   };

// const handleEditorMount = () => {};

//   const variableTrace = [
//     { line: 1, function: 'main', value: 0 },
//     { line: 2, function: 'main', value: 1 },
//     { line: 3, function: 'main', value: 3 },
//     { line: 4, function: 'main', value: 6 },
//     { line: 5, function: 'main', value: 10 }
//   ];

//   const generateMermaid = (trace) => {
//   let mermaidStr = 'graph TD\n'; // graph header

//   trace.forEach((v, i) => {
//     const nodeId = `L${v.line}`; // ONLY letters/numbers
//     const label = `${v.value} (line ${v.line})`; // label with parentheses is fine
//     mermaidStr += `${nodeId}["${label}"]\n`; // wrap label in quotes
//     const next = trace[i + 1];
//     if (next) {
//       mermaidStr += `${nodeId} --> L${next.line}\n`; // edge must use IDs only
//     }
//   });

//   return mermaidStr;
// };

//   const renderTestDiagram = () => {
//   if (!diagramRef.current) return;

//   const diagramDef = generateMermaid(variableTrace);

//   // Correctly render SVG
//   const id = `diagram-${Date.now()}`;

//   mermaid.render(id, diagramDef)
//     .then((obj) => {
//       diagramRef.current.innerHTML = obj.svg; // IMPORTANT: use obj.svg
//     })
//     .catch((err) => {
//       setOutput(`Mermaid render error: ${err}`);
//     });

//   setOutput('Test diagram rendered (fixed example case).');
// };

//   return (
//     <div className="app-container">
//       <h1>Tracer - Test Diagram</h1>
//       <div style={{ marginBottom: '1rem' }}>
//         <button onClick={renderTestDiagram} style={{ marginRight: '1rem' }}>
//           Render Test Diagram
//         </button>
//         <label>
//           Variable to trace:
//           <input
//             type="text"
//             value={variableName}
//             onChange={(e) => setVariableName(e.target.value)}
//             style={{ marginLeft: '0.3rem' }}
//           />
//         </label>
//       </div>

//       <div className="controls">
//         <button
//           onClick={runCode}
//           disabled={running}
//           className="run-button"
//         >
//           {running ? 'Running...' : 'Run'}
//         </button>

//         {/* Language selector */}
//         <div className="language-selector">
//           <label>Language:</label>
//           <select
//             value={language}
//             onChange={(e) => setLanguage(e.target.value)}
//           >
//             <option value="python">Python</option>
//           </select>
//         </div>
//       </div>


//       <div style={{ display: 'flex', gap: '1rem' }}>
//         {/* Editor */}
//         <div style={{ flex: 1 }}>
//           <Editor
//             height="100%"
//             language={language}
//             theme="vs-dark"
//             onMount={handleEditorMount}
//           />
//         </div>

//         {/* Output + Diagram */}
//         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//           <div style={{ background: '#1e1e1e', color: '#fff', padding: '1rem', minHeight: '50px' }}>
//             {output}
//           </div>
//           <div
//             ref={diagramRef}
//             style={{ border: '1px solid #333', padding: '1rem', minHeight: '300px', overflow: 'auto' }}
//           ></div>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default App;


