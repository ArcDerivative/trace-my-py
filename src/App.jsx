import { useState, useRef } from 'react'
import Editor from '@monaco-editor/react'

const TRACER_CODE = `
import sys
import json

trace_data = {}
prev_globals = {}

def is_user_var(name):
    if name.startswith('_'):
        return False
    if name in ('tracer', 'run_with_trace', 'trace_data', 'prev_globals', 'is_user_var', 'safe_repr', 'user_code', 'result', 'json', 'sys'):
        return False
    return True

def safe_repr(val):
    try:
        r = repr(val)
        # Keep it JSON-safe
        return r
    except:
        return '<unrepresentable>'

def tracer(frame, event, arg):
    global prev_globals
    
    if event == 'line':
        line_no = frame.f_lineno
        
        current_globals = {k: safe_repr(v) for k, v in frame.f_globals.items() if is_user_var(k)}
        
        for k, v in current_globals.items():
            if k not in prev_globals or prev_globals[k] != v:
                if k not in trace_data:
                    trace_data[k] = []
                trace_data[k].append({'line': line_no, 'value': v})
        
        prev_globals = dict(current_globals)
    
    return tracer

def run_with_trace(code):
    global trace_data, prev_globals
    trace_data = {}
    prev_globals = {}
    
    sys.settrace(tracer)
    try:
        exec(code, {'__name__': '__main__', '__builtins__': __builtins__})
    finally:
        sys.settrace(None)
    
    return json.dumps(trace_data)
`

function App() {
  const [output, setOutput] = useState('')
  const [traceData, setTraceData] = useState({})
  const [running, setRunning] = useState(false)
  const editorRef = useRef(null)
  const pyodideRef = useRef(null)

  const handleEditorMount = (editor) => {
    editorRef.current = editor
  }

  const runCode = async () => {
    setRunning(true)
    setOutput('')
    setTraceData({})

    try {
      if (!pyodideRef.current) {
        setOutput('Loading Python...\n')
        const { loadPyodide } = await import('pyodide')
        pyodideRef.current = await loadPyodide()
      }

      const userCode = editorRef.current.getValue()
      
      let printOutput = ''
      pyodideRef.current.setStdout({ batched: (text) => { printOutput += text + '\n' } })
      pyodideRef.current.setStderr({ batched: (text) => { printOutput += 'Error: ' + text + '\n' } })

      // Load the tracer
      await pyodideRef.current.runPythonAsync(TRACER_CODE)
      
      // Run user code with tracing - returns JSON string
      const wrappedCode = `
user_code = ${JSON.stringify(userCode)}
result = run_with_trace(user_code)
result
`
      const jsonString = await pyodideRef.current.runPythonAsync(wrappedCode)
      
      // Parse the JSON string
      const traceObj = JSON.parse(jsonString)
      setTraceData(traceObj)
      
      // Format output
      let traceOutput = '--- Program Output ---\n'
      traceOutput += printOutput || '(no output)\n'
      traceOutput += '\n--- Variable Trace ---\n'
      
      for (const [varName, assignments] of Object.entries(traceObj)) {
        traceOutput += `\n${varName}:\n`
        for (const a of assignments) {
          traceOutput += `  Line ${a.line}: ${a.value}\n`
        }
      }
      
      setOutput(traceOutput)

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
            {running ? 'Running...' : 'Run & Trace'}
          </button>
          <div style={{ flex: 1, border: '1px solid #333' }}>
            <Editor
              height="100%"
              defaultLanguage="python"
              defaultValue={`x = 1
y = 5

def foo():
    global x
    x = x + y

foo()
x = x + 1
print(f"Final x = {x}")`}
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
            padding: '1rem', 
            margin: 0,
            overflow: 'auto',
            border: '1px solid #333',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: '1.4'
          }}>
            {output || 'Click "Run & Trace" to execute and trace your code'}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default App
