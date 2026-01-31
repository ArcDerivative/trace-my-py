import { useState, useRef } from 'react'
import Editor from '@monaco-editor/react'

function App() {
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const editorRef = useRef(null)
  const pyodideRef = useRef(null)

  const handleEditorMount = (editor) => {
    editorRef.current = editor
  }

  const runCode = async () => {
    setRunning(true)
    setOutput('')

    try {
      if (!pyodideRef.current) {
        setOutput('Loading Python...\n')
        const { loadPyodide } = await import('pyodide')
        pyodideRef.current = await loadPyodide()
      }

      const code = editorRef.current.getValue()

      pyodideRef.current.setStdout({ batched: (text) => setOutput(prev => prev + text + '\n') })
      pyodideRef.current.setStderr({ batched: (text) => setOutput(prev => prev + 'Error: ' + text + '\n') })

      await pyodideRef.current.runPythonAsync(code)
    } catch (err) {
      setOutput(prev => prev + 'Error: ' + err.message + '\n')
    }

    setRunning(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', padding: '1rem', boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 1rem 0', textAlign: 'center' }}>Python Tracer</h1>

      <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0, width: '100%' }}>
        {/* Editor panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <button
            onClick={runCode}
            disabled={running}
            style={{ padding: '0.5rem 1rem', marginBottom: '0.5rem', fontSize: '1rem', alignSelf: 'flex-start' }}
          >
            {running ? 'Running...' : 'Run'}
          </button>
          <div style={{ flex: 1, border: '1px solid #333' }}>
            <Editor
              height="100%"
              defaultLanguage="python"
              defaultValue={`# Write Python here\nfor i in range(5):\n    print(f"Hello {i}")`}
              theme="vs-dark"
              onMount={handleEditorMount}
            />
          </div>
        </div>

        {/* Output panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Output</h3>
          <pre style={{
            flex: 1,
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            margin: 0,
            overflow: 'auto',
            border: '1px solid #333',
            fontFamily: 'monospace'
          }}>
            {output || 'Click "Run" to see output'}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default App
