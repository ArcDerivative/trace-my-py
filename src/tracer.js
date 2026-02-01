const TRACER_CODE = `
import sys
import json
import traceback
import ast

trace_data = {}
prev_vars = {}
frame_prev_line = {}
error_message = None
scope_info = {'lineToScope': {}, 'scopeToLocals': {}, 'globalDeclarations': {}}

class ScopeAnalyzer(ast.NodeVisitor):
    def __init__(self, source_lines):
        self.source_lines = source_lines
        self.line_to_scope = {}
        self.scope_to_locals = {'global': set()}
        self.scope_ranges = {}  # scope_name -> (start_line, end_line)
        self.global_declarations = {}  # line -> list of var names
        
    def visit_FunctionDef(self, node):
        func_name = node.name
        parent_scope = 'global'  # simplified; doesn't handle nested functions perfectly
        
        # Add function name to parent scope
        self.scope_to_locals[parent_scope].add(func_name)
        
        # Initialize this function's scope
        self.scope_to_locals[func_name] = set()
        
        # Record the line range for this function
        start_line = node.lineno
        end_line = node.end_lineno if hasattr(node, 'end_lineno') else start_line
        self.scope_ranges[func_name] = (start_line, end_line)
        
        # Mark all lines in this function
        for line in range(start_line, end_line + 1):
            self.line_to_scope[line] = func_name
        
        # Collect local variables
        self.collect_locals(node, func_name)
        
        # Visit nested functions
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.FunctionDef):
                self.visit_FunctionDef(child)
    
    def collect_locals(self, func_node, scope_name):
        # Parameters
        for arg in func_node.args.args:
            self.scope_to_locals[scope_name].add(arg.arg)
        if func_node.args.vararg:
            self.scope_to_locals[scope_name].add(func_node.args.vararg.arg)
        if func_node.args.kwarg:
            self.scope_to_locals[scope_name].add(func_node.args.kwarg.arg)
        
        # Find global declarations first
        global_vars = set()
        for node in ast.walk(func_node):
            if isinstance(node, ast.Global):
                for name in node.names:
                    global_vars.add(name)
                # Record the global declaration line
                line = node.lineno
                if line not in self.global_declarations:
                    self.global_declarations[line] = []
                for name in node.names:
                    if name not in self.global_declarations[line]:
                        self.global_declarations[line].append(name)
        
        # Walk through and find assignments
        for node in ast.walk(func_node):
            # Skip nested function definitions
            if isinstance(node, ast.FunctionDef) and node is not func_node:
                continue
                
            var_name = None
            
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        var_name = target.id
            elif isinstance(node, ast.AugAssign):
                if isinstance(node.target, ast.Name):
                    var_name = node.target.id
            elif isinstance(node, ast.For):
                if isinstance(node.target, ast.Name):
                    var_name = node.target.id
            elif isinstance(node, ast.NamedExpr):
                if isinstance(node.target, ast.Name):
                    var_name = node.target.id
            
            if var_name and var_name not in global_vars:
                self.scope_to_locals[scope_name].add(var_name)
    
    def analyze(self, tree):
        total_lines = len(self.source_lines)
        
        # Default all lines to global
        for i in range(1, total_lines + 2):
            self.line_to_scope[i] = 'global'
        
        # Process global-level nodes
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.FunctionDef):
                self.visit_FunctionDef(node)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.scope_to_locals['global'].add(target.id)
            elif isinstance(node, ast.AugAssign):
                if isinstance(node.target, ast.Name):
                    self.scope_to_locals['global'].add(node.target.id)
            elif isinstance(node, ast.For):
                if isinstance(node.target, ast.Name):
                    self.scope_to_locals['global'].add(node.target.id)
        
        return {
            'lineToScope': {str(k): v for k, v in self.line_to_scope.items()},
            'scopeToLocals': {k: list(v) for k, v in self.scope_to_locals.items()},
            'globalDeclarations': {str(k): v for k, v in self.global_declarations.items()}
        }

def analyze_scopes(code):
    try:
        tree = ast.parse(code)
        source_lines = code.split('\\n')
        analyzer = ScopeAnalyzer(source_lines)
        return analyzer.analyze(tree)
    except Exception as e:
        return {'lineToScope': {}, 'scopeToLocals': {}, 'globalDeclarations': {}, 'error': str(e)}

def is_user_var(name):
    if name.startswith('_'):
        return False
    if name in (
        'tracer', 'run_with_trace', 'trace_data', 'prev_vars',
        'is_user_var', 'safe_repr', 'user_code', '__tracer_result__',
        'json', 'sys', 'ast', 'traceback',
        'get_func_name', 'is_function',
        'capture_changes', 'frame_prev_line', 'error_message',
        'scope_info', 'analyze_scopes', 'ScopeAnalyzer'
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
                    'assignedIn': func_name,
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
    global trace_data, prev_vars, frame_prev_line, error_message, scope_info
    trace_data = {}
    prev_vars = {}
    frame_prev_line = {}
    error_message = None
    
    # Analyze scopes before running
    scope_info = analyze_scopes(code)

    sys.settrace(tracer)
    try:
        exec(code, {'__name__': '__main__', '__builtins__': __builtins__})
    except Exception as e:
        error_message = traceback.format_exc().splitlines()[-1]
    finally:
        sys.settrace(None)
    
    return json.dumps({
        'traceData': trace_data,
        'errorMessage': error_message,
        'scopeInfo': scope_info
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
__tracer_result__ = run_with_trace(user_code)
__tracer_result__
`;

  const jsonString = await pyodideInstance.runPythonAsync(wrappedCode);
  const parsed = JSON.parse(jsonString);

  let finalOutput = printOutput;
  if (parsed.errorMessage) {
    finalOutput = finalOutput + (finalOutput ? '\n' : '') + '❌ ' + parsed.errorMessage;
  }

  return {
    output: finalOutput,
    traceData: parsed.traceData,
    errorMessage: parsed.errorMessage,
    scopeInfo: parsed.scopeInfo
  };
}
