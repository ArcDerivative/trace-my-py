import { useState, useRef, useEffect, useCallback } from 'react';
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
    lineColor: '#4a90d9'
  },
  flowchart: {
    curve: 'basis',
    nodeSpacing: 50,
    rankSpacing: 50
  }
});

const getDisplayName = (scopedVar, allTraceData) => {
  if (!scopedVar) return '';
  const parts = scopedVar.split('::');
  if (parts.length < 2) return scopedVar;
  const scope = parts[0];
  const varName = parts[1];
  
  if (scope !== 'global') {
    return `${varName} (${scope})`;
  }
  
  const hasLocalWithSameName = Object.keys(allTraceData).some((key) => {
    const keyParts = key.split('::');
    return keyParts[0] !== 'global' && keyParts[1] === varName;
  });
  
  if (hasLocalWithSameName) {
    return `${varName} (global)`;
  }
  
  return varName;
};

const getRawVarName = (scopedVar) => {
  if (!scopedVar) return '';
  const parts = scopedVar.split('::');
  return parts[parts.length - 1];
};

const getScope = (scopedVar) => {
  if (!scopedVar) return '';
  const parts = scopedVar.split('::');
  return parts[0];
};

function App() {
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [allTraceData, setAllTraceData] = useState({});
  const [scopeInfo, setScopeInfo] = useState({ lineToScope: {}, scopeToLocals: {} });
  const [selectedVar, setSelectedVar] = useState('');
  const [hoveredVar, setHoveredVar] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const diagramRef = useRef(null);
  const diagramContainerRef = useRef(null);
  const diagramIdRef = useRef(0);
  const decorationsRef = useRef([]);
  const lineToVarMapRef = useRef({});
  const traceDataRef = useRef({});
  const scopeInfoRef = useRef({ lineToScope: {}, scopeToLocals: {} });

  const activeVar = hoveredVar || selectedVar;
  const hasTraceData = Object.keys(allTraceData).length > 0;
  const hasSyntaxError = hasRun && errorMessage && !hasTraceData;

  // Keep refs in sync with state
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Reset zoom and pan when diagram changes
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    traceDataRef.current = allTraceData;
  }, [allTraceData]);

  useEffect(() => {
    scopeInfoRef.current = scopeInfo;
  }, [scopeInfo]);

  const buildLineToVarMap = (traceData) => {
    const map = {};
    for (const [scopedVar, traces] of Object.entries(traceData)) {
      for (const trace of traces) {
        if (!map[trace.line]) {
          map[trace.line] = scopedVar;
        }
      }
    }
    return map;
  };

  useEffect(() => {
    lineToVarMapRef.current = buildLineToVarMap(allTraceData);
  }, [allTraceData]);

  const clearHighlights = () => {
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  };

  const invalidateTrace = () => {
    setAllTraceData({});
    setScopeInfo({ lineToScope: {}, scopeToLocals: {} });
    setSelectedVar('');
    setHoveredVar(null);
    setErrorMessage(null);
    setHasRun(false);
    setOutput('');
    clearHighlights();
    lineToVarMapRef.current = {};
    traceDataRef.current = {};
    scopeInfoRef.current = { lineToScope: {}, scopeToLocals: {} };
    resetView();
  };

  const shouldHighlightOnLine = (scopedVar, lineNum) => {
    const { lineToScope, scopeToLocals } = scopeInfoRef.current;
    const varName = getRawVarName(scopedVar);
    const varScope = getScope(scopedVar);
    
    const lineScope = lineToScope[String(lineNum)] || 'global';
    
    if (varScope === 'global') {
      if (lineScope === 'global') {
        return true;
      }
      const functionLocals = scopeToLocals[lineScope] || [];
      return !functionLocals.includes(varName);
    } else {
      return lineScope === varScope;
    }
  };

  const highlightVariable = (scopedVar, hoveredLine) => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    const rawVarName = getRawVarName(scopedVar);

    if (!rawVarName) {
      clearHighlights();
      return;
    }

    const newDecorations = [];

    if (hoveredLine) {
      newDecorations.push({
        range: new monaco.Range(hoveredLine, 1, hoveredLine, 1),
        options: {
          isWholeLine: true,
          className: 'hovered-line-highlight'
        }
      });
    }

    const text = model.getValue();
    const lines = text.split('\n');
    const regex = new RegExp(`\\b${rawVarName}\\b`, 'g');

    lines.forEach((lineContent, index) => {
      const lineNum = index + 1;
      
      if (!shouldHighlightOnLine(scopedVar, lineNum)) {
        return;
      }
      
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(lineContent)) !== null) {
        newDecorations.push({
          range: new monaco.Range(
            lineNum,
            match.index + 1,
            lineNum,
            match.index + 1 + rawVarName.length
          ),
          options: {
            inlineClassName: 'variable-highlight'
          }
        });
      }
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  };

  const handleLineHover = (lineNumber) => {
    const scopedVar = lineToVarMapRef.current[lineNumber];

    if (scopedVar) {
      setHoveredVar(scopedVar);
      setSelectedVar(scopedVar);
      highlightVariable(scopedVar, lineNumber);
    } else {
      clearHighlights();
      setHoveredVar(null);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onMouseMove((e) => {
      if (e.target && e.target.position) {
        const lineNumber = e.target.position.lineNumber;
        handleLineHover(lineNumber);
      }
    });

    editor.onMouseLeave(() => {
      clearHighlights();
      setHoveredVar(null);
    });

    editor.onDidChangeModelContent(() => {
      if (hasRun) {
        invalidateTrace();
      }
    });
  };

  useEffect(() => {
    if (editorRef.current) {
      const disposable = editorRef.current.onDidChangeModelContent(() => {
        if (hasRun) {
          invalidateTrace();
        }
      });
      return () => disposable.dispose();
    }
  }, [hasRun]);

  useEffect(() => {
    if (selectedVar && !hoveredVar) {
      highlightVariable(selectedVar, null);
    }
  }, [selectedVar]);

    // Handle wheel events for zoom and pan
  // Handle wheel events for zoom and pan
const handleWheel = useCallback((e) => {
  e.preventDefault();
  
  const container = diagramContainerRef.current;
  const content = diagramRef.current;
  if (!container || !content) return;
  
  const rect = container.getBoundingClientRect();
  const svg = content.querySelector('svg');
  
  // Count nodes in the flowchart
  const nodes = content.querySelectorAll('.node');
  const nodeCount = nodes.length;
  
  // If only one box, disable all zoom/pan
  if (nodeCount <= 1) {
    return;
  }
  
  // Get content dimensions (use SVG if available)
  let contentWidth = rect.width;
  let contentHeight = rect.height;
  if (svg) {
    const svgRect = svg.getBoundingClientRect();
    contentWidth = svgRect.width / zoomRef.current;
    contentHeight = svgRect.height / zoomRef.current;
  }
  
  // Helper to clamp pan values
  const clampPan = (panX, panY, zoomLevel) => {
    const scaledWidth = contentWidth * zoomLevel;
    const scaledHeight = contentHeight * zoomLevel;
    
    // Allow panning a bit past the edge
    const extraX = rect.width * 0.2;
    const extraY = rect.height * -0.45;
    
    const maxPanX = (scaledWidth / 2) + extraX;
    const maxPanY = (scaledHeight / 2) + extraY;
    
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, panX)),
      y: Math.min(maxPanY, Math.max(-maxPanY, panY))
    };
  };
  
  if (e.ctrlKey || e.metaKey) {
    // Pinch zoom (or ctrl+scroll) - centered on cursor
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    
    // More sensitive zoom
    const delta = -e.deltaY * 0.04;
    const newZoom = Math.min(Math.max(0.5, currentZoom + delta), 5);
    
    // Point under cursor in content space
    const contentX = (cursorX - centerX - currentPan.x) / currentZoom;
    const contentY = (cursorY - centerY - currentPan.y) / currentZoom;
    
    // New pan to keep same content point under cursor
    const newPanX = cursorX - centerX - contentX * newZoom;
    const newPanY = cursorY - centerY - contentY * newZoom;
    
    // Clamp pan to bounds
    const clampedPan = clampPan(newPanX, newPanY, newZoom);
    
    setZoom(newZoom);
    setPan(clampedPan);
  } else {
    // Two-finger pan
    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;
    
    const newPanX = currentPan.x - e.deltaX;
    const newPanY = currentPan.y - e.deltaY;
    
    // Clamp pan to bounds
    const clampedPan = clampPan(newPanX, newPanY, currentZoom);
    
    setPan(clampedPan);
  }
}, []);


  // Attach wheel listener to diagram container
  useEffect(() => {
    const container = diagramContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const mermaidSafe = (value) => {
    if (value == null) return 'null';
    return String(value)
      .replace(/"/g, "'")
      .replace(/[<>]/g, '')
      .replace(/\n/g, ' ')
      .slice(0, 80);
  };

  const generateMermaid = (trace, scopedVar, error) => {
    let mermaidStr = `%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#334155', 'primaryTextColor': '#f8fafc', 'lineColor': '#4a90d9' }}}%%
graph TD
`;
    const rawName = getRawVarName(scopedVar);

    trace.forEach((v, i) => {
      const nodeId = `N${i}`;
      const scopeLabel = v.function === 'global' ? '' : ` (${v.function})`;
      const label = `${rawName} = ${mermaidSafe(v.value)}${scopeLabel}<br/>line ${v.line}`;
      mermaidStr += `${nodeId}["${label}"]\n`;
      if (i < trace.length - 1) {
        mermaidStr += `${nodeId} --> N${i + 1}\n`;
      }
    });

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

    if (!hasRun) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">code must be run :)</p>';
      resetView();
      return;
    }

    if (hasSyntaxError) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">code must be run without syntax errors :))</p>';
      resetView();
      return;
    }

    const trace = allTraceData[activeVar] || [];
    if (trace.length === 0 && !errorMessage) {
      diagramRef.current.innerHTML =
        '<p class="diagram-placeholder">Hover over an assignment or select a variable</p>';
      resetView();
      return;
    }

    const diagramDef = generateMermaid(trace, activeVar, errorMessage);
    diagramIdRef.current += 1;

    try {
      const { svg } = await mermaid.render(
        `diagram-${diagramIdRef.current}`,
        diagramDef
      );
      diagramRef.current.innerHTML = svg;

      const rects = diagramRef.current.querySelectorAll('.node rect, .label-container');
      rects.forEach((rect) => {
        rect.setAttribute('rx', '10');
        rect.setAttribute('ry', '10');
      });
      
      // Reset view when new diagram is rendered
      resetView();
    } catch (err) {
      diagramRef.current.innerHTML =
        `<pre style="color:red">Mermaid error:\n${err.message}</pre>`;
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setOutput('Running...\n');
    setAllTraceData({});
    setScopeInfo({ lineToScope: {}, scopeToLocals: {} });
    setSelectedVar('');
    setHoveredVar(null);
    setErrorMessage(null);
    setHasRun(false);
    clearHighlights();
    resetView();
    if (diagramRef.current) diagramRef.current.innerHTML = '';

    try {
      const code = editorRef.current.getValue();
      const { output: progOutput, traceData, errorMessage, scopeInfo } = await runAndTrace(code);

      setAllTraceData(traceData);
      setScopeInfo(scopeInfo || { lineToScope: {}, scopeToLocals: {} });
      setErrorMessage(errorMessage || null);
      setOutput(progOutput || '(no output)');
      setHasRun(true);
    } catch (err) {
      setOutput(`Error: ${err.message}`);
      setHasRun(true);
    }

    setRunning(false);
  };

  useEffect(() => {
    renderDiagram();
  }, [activeVar, allTraceData, errorMessage, hasRun]);

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
            value={selectedVar}
            onChange={(e) => setSelectedVar(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value="">-- select --</option>
            {Object.keys(allTraceData).map((v) => (
              <option key={v} value={v}>{getDisplayName(v, allTraceData)}</option>
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
              defaultValue={`# Global variables
count = 0
x = 100
name = "global"

def outer_function():
    # Local variable that shadows global 'x'
    x = 50
    y = 10
    
    def inner_function():
        # Local variable that shadows outer's 'x'
        x = 25
        z = 5
        print(f"inner: x={x}, z={z}")
        return x + z
    
    result = inner_function()
    x = x + y  # modifies outer's local x
    print(f"outer: x={x}, y={y}, result={result}")
    return x

def modifier():
    # Accesses and modifies global 'count'
    global count
    count = count + 1
    step = 10
    print(f"modifier: count={count}, step={step}")
    return step

def reader():
    # Reads global 'x' without shadowing
    temp = x + 5
    print(f"reader: using global x={x}, temp={temp}")
    return temp

def loop_example():
    # Loop variable 'i' and accumulator 'total'
    total = 0
    for i in range(5):
        total = total + i
        x = i * 2  # local 'x' shadows global
    print(f"loop: total={total}, final i={i}, local x={x}")
    return total

def multi_assign():
    # Multiple variables, some shadow, some don't
    a = 1
    b = 2
    name = "local"  # shadows global 'name'
    a = a + b
    b = b * 2
    print(f"multi: a={a}, b={b}, name={name}, global count={count}")
    return a + b

# Main execution
print(f"Start: count={count}, x={x}, name={name}")

modifier()
modifier()
outer_result = outer_function()
reader_result = reader()
loop_result = loop_example()
multi_result = multi_assign()

print(f"End: count={count}, x={x}, name={name}")
print(f"Results: outer={outer_result}, reader={reader_result}, loop={loop_result}, multi={multi_result}")`}
              onMount={handleEditorMount}
            />
          </div>
        </div>

        {/* Output + Diagram */}
        <div className="output-diagram-panel">
          <div className="output-panel">
            <h3 className="panel-header">Console Output</h3>
            <div className="output-container">
              <pre className="output-pre">{output}</pre>
            </div>
          </div>
          <div className="diagram-panel">
            <h3 className="panel-header">
              Variable Flow
              {activeVar && <span style={{ fontWeight: 'normal', marginLeft: '0.5rem' }}>— {getDisplayName(activeVar, allTraceData)}</span>}
              {zoom !== 1 && <span style={{ fontWeight: 'normal', marginLeft: '0.5rem', fontSize: '0.8rem', color: '#666' }}>({Math.round(zoom * 100)}%)</span>}
            </h3>
            <div 
              className="diagram-container"
              ref={diagramContainerRef}
            >
              <div 
                ref={diagramRef}
                className="diagram-content"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
