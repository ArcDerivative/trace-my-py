const TRACER_CODE = `
import sys
import json

trace_data = {}
prev_vars = {}
frame_prev_line = {}

def is_user_var(name):
    if name.startswith('_'):
        return False
    if name in ('tracer', 'run_with_trace', 'trace_data', 'prev_vars', 'is_user_var', 'safe_repr', 'user_code', 'result', 'json', 'sys', 'get_scope_chain', 'is_function', 'capture_changes', 'frame_prev_line'):
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
            scope_chain = get_scope_chain(frame)
            func_name = scope_chain[-1][0] if scope_chain else 'global'
            
            if k not in trace_data:
                trace_data[k] = []
            trace_data[k].append({
                'line': line_no,
                'function': func_name,
                'value': v_repr
            })
            
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
    global trace_data, prev_vars, frame_prev_line
    trace_data = {}
    prev_vars = {}
    frame_prev_line = {}
    
    sys.settrace(tracer)
    try:
        exec(code, {'__name__': '__main__', '__builtins__': __builtins__})
    finally:
        sys.settrace(None)
    
    return json.dumps(trace_data)
`

let pyodideInstance = null

export async function runAndTrace(code) {
  let printOutput = ''

  if (!pyodideInstance) {
    const { loadPyodide } = await import('pyodide')
    pyodideInstance = await loadPyodide()
  }

  pyodideInstance.setStdout({ batched: (text) => { printOutput += text + '\n' } })
  pyodideInstance.setStderr({ batched: (text) => { printOutput += 'Error: ' + text + '\n' } })

  await pyodideInstance.runPythonAsync(TRACER_CODE)

  const wrappedCode = `
user_code = ${JSON.stringify(code)}
result = run_with_trace(user_code)
result
`
  const jsonString = await pyodideInstance.runPythonAsync(wrappedCode)
  const traceData = JSON.parse(jsonString)

  return {
    output: printOutput,
    traceData: traceData
  }
}
