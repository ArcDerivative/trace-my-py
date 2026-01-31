import { useState, useRef } from 'react'
import Editor from '@monaco-editor/react'

const TRACER_CODE = `
import sys
import json

trace_data = {}
var_assignments = {}  # var_name -> [(line, value, scope_chain), ...]
assignment_lines = {}  # var_name -> [line_numbers where assigned]
prev_vars = {}
frame_prev_line = {}

def is_user_var(name):
    if name.startswith('_'):
        return False
    if name in ('tracer', 'run_with_trace', 'trace_data', 'prev_vars', 'is_user_var', 'safe_repr', 'user_code', 'result', 'json', 'sys', 'get_scope_chain', 'is_function', 'var_assignments', 'capture_changes', 'frame_prev_line', 'assignment_lines'):
        return False
    return True

def is_function(val):
    return callable(val) and not isinstance(val, type)

def safe_repr(val):
    try:
        return repr(val)
    except:
        return '<unrepresentable>'

def get_scope_chain(frame):
    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == '<string>':
            name = f.f_code.co_name
            first_line = f.f_code.co_firstlineno
            if name == '<module>':
                chain.append(('global', 0))
            else:
                chain.append((name, first_line))
        f = f.f_back
    chain.reverse()
    return chain

def capture_changes(frame, line_no):
    global prev_vars
    
    current_vars = {}
    
    for k, v in frame.f_locals.items():
        if is_user_var(k) and not is_function(v):
            current_vars[k] = safe_repr(v)
    
    for k, v in frame.f_globals.items():
        if is_user_var(k) and not is_function(v):
            if k not in current_vars:
                current_vars[k] = safe_repr(v)
    
    for k, v_repr in current_vars.items():
        prev_repr = prev_vars.get(k)
        
        if prev_repr is None or prev_repr != v_repr:
            # Original trace_data format
            if k not in trace_data:
                trace_data[k] = []
            trace_data[k].append({'line': line_no, 'value': v_repr})
            
            # Track all assignments per variable
            scope_chain = get_scope_chain(frame)
            if k not in var_assignments:
                var_assignments[k] = []
                assignment_lines[k] = []
            var_assignments[k].append((line_no, v_repr, scope_chain))
            assignment_lines[k].append(line_no)
            
            prev_vars[k] = v_repr

def tracer(frame, event, arg):
    global frame_prev_line
    
    if frame.f_code.co_filename != '<string>':
        return tracer
    
    frame_id = id(frame)
    
    if event == 'line':
        if frame_id in frame_prev_line:
            capture_changes(frame, frame_prev_line[frame_id])
        frame_prev_line[frame_id] = frame.f_lineno
    
    elif event == 'return':
        if frame_id in frame_prev_line:
            capture_changes(frame, frame_prev_line[frame_id])
            del frame_prev_line[frame_id]
    
    return tracer

def run_with_trace(code):
    global trace_data, prev_vars, var_assignments, frame_prev_line, assignment_lines
    trace_data = {}
    var_assignments = {}
    assignment_lines = {}
    prev_vars = {}
    frame_prev_line = {}
    
    sys.settrace(tracer)
    try:
        exec(code, {'__name__': '__main__', '__builtins__': __builtins__})
    finally:
        sys.settrace(None)
    
    # Build assignment_map: for each line, include ALL values for that variable
    formatted_map = {}
    for var_name, assignments in var_assignments.items():
        # Get all (line, value) pairs for this variable
        all_values = [(line, val) for line, val, scope in assignments]
        
        for line_no, value, scope_chain in assignments:
            formatted_map[line_no] = [
                var_name,
                scope_chain,
                all_values  # ALL assignments to this variable
            ]
    
    return json.dumps({
        'trace_data': trace_data,
        'assignment_map': formatted_map
    })
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

      await pyodideRef.current.runPythonAsync(TRACER_CODE)
      
      const wrappedCode = `
user_code = ${JSON.stringify(userCode)}
result = run_with_trace(user_code)
result
`
      const jsonString = await pyodideRef.current.runPythonAsync(wrappedCode)
      const { trace_data: traceObj, assignment_map: assignMap } = JSON.parse(jsonString)
      setTraceData(traceObj)
      
      let traceOutput = '--- Program Output ---\n'
      traceOutput += printOutput || '(no output)\n'
      traceOutput += '\n--- Variable Trace ---\n'
      
      for (const [varName, assignments] of Object.entries(traceObj)) {
        traceOutput += `\n${varName}:\n`
        for (const a of assignments) {
          traceOutput += `  Line ${a.line}: ${a.value}\n`
        }
      }
      
      traceOutput += '\n--- Assignment Map ---\n'
      traceOutput += JSON.stringify(assignMap, null, 2)
      
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
    k = 2

foo()
x = x + 1
print(f"Final x = {x}")`}
              theme="vs-dark"
              onMount={handleEditorMount}
            />
          </div>
        </div>

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
