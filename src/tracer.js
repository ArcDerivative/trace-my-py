const TRACER_CODE = `
import sys
import json
import traceback

trace_data = {}
prev_vars = {}
frame_prev_line = {}
error_message = None

def is_user_var(name):
    if name.startswith('_'):
        return False
    if name in (
        'tracer', 'run_with_trace', 'trace_data', 'prev_vars',
        'is_user_var', 'safe_repr', 'user_code', 'result',
        'json', 'sys', 'ast', 'traceback',
        'get_func_name', 'is_function',
        'capture_changes', 'frame_prev_line', 'error_message'
    ):
        return False
    return True

def is_function(val):
    return callable(val) and not isinstance(val, type)

def safe_repr(val):
    try:
        return repr(val)
    except:
        return '<unrepresentable>'

def get_func_name(frame):
    name = frame.f_code.co_name
    if name == '<module>':
        return 'global'
    return name

def capture_changes(frame, line_no):
    global prev_vars, trace_data
    
    try:
        func_name = get_func_name(frame)
        is_module_level = (func_name == 'global')
        
        local_names = set(frame.f_code.co_varnames) if not is_module_level else set()
        
        current_vars = {}
        var_scopes = {}
        
        for k, v in list(frame.f_locals.items()):
            if is_user_var(k) and not is_function(v):
                if not is_module_level and k in local_names:
                    scope = func_name
                else:
                    scope = 'global'
                scoped_key = scope + '::' + k
                current_vars[scoped_key] = safe_repr(v)
                var_scopes[scoped_key] = scope
        
        for k, v in list(frame.f_globals.items()):
            if is_user_var(k) and not is_function(v):
                scoped_key = 'global::' + k
                if scoped_key not in current_vars:
                    current_vars[scoped_key] = safe_repr(v)
                    var_scopes[scoped_key] = 'global'
        
        for scoped_key, v_repr in current_vars.items():
            prev_repr = prev_vars.get(scoped_key)
            
            if prev_repr is None or prev_repr != v_repr:
                scope = var_scopes[scoped_key]
                
                if scoped_key not in trace_data:
                    trace_data[scoped_key] = []
                trace_data[scoped_key].append({
                    'line': line_no,
                    'function': scope,
                    'value': v_repr
                })
                
                prev_vars[scoped_key] = v_repr
    except:
        pass

def tracer(frame, event, arg):
    global frame_prev_line
    
    try:
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
        
        elif event == 'exception':
            capture_changes(frame, frame.f_lineno)
    except:
        pass
    
    return tracer

def run_with_trace(code):
    global trace_data, prev_vars, frame_prev_line, error_message
    trace_data = {}
    prev_vars = {}
    frame_prev_line = {}
    error_message = None

    sys.settrace(tracer)
    try:
        exec(code, {'__name__': '__main__', '__builtins__': __builtins__})
    except Exception as e:
        error_message = traceback.format_exc().splitlines()[-1]
    finally:
        sys.settrace(None)
    
    return json.dumps({
        'traceData': trace_data,
        'errorMessage': error_message
    })
`;

let pyodideInstance = null;

const preprocessCode = (code) => {
  let processedCode = code;

  if (processedCode.includes('input(') && !processedCode.includes('import ast')) {
    processedCode = 'import ast\n' + processedCode;
  }

  processedCode = processedCode.replace(/\binput\s*\(\s*\)/g, 'ast.literal_eval(input())');

  return processedCode;
};

export async function runAndTrace(code) {
  let printOutput = '';

  const processedCode = preprocessCode(code);

  if (!pyodideInstance) {
    const { loadPyodide } = await import('pyodide');
    pyodideInstance = await loadPyodide();
  }

  pyodideInstance.setStdout({ batched: (text) => { printOutput += text + '\n'; } });
  pyodideInstance.setStderr({ batched: (text) => { printOutput += 'Error: ' + text + '\n'; } });

  await pyodideInstance.runPythonAsync(TRACER_CODE);

  const wrappedCode = `
user_code = ${JSON.stringify(processedCode)}
result = run_with_trace(user_code)
result
`;

  const jsonString = await pyodideInstance.runPythonAsync(wrappedCode);
  const parsed = JSON.parse(jsonString);

  // Include error message in output so it's visible in console panel
  let finalOutput = printOutput;
  if (parsed.errorMessage) {
    finalOutput = finalOutput + (finalOutput ? '\n' : '') + '❌ ' + parsed.errorMessage;
  }

  return {
    output: finalOutput,
    traceData: parsed.traceData,
    errorMessage: parsed.errorMessage
  };
}
