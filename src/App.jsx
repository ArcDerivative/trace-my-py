import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import mermaid from 'mermaid'
import { runAndTrace } from './tracer'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

function App() {
  const [output, setOutput] = useState('')
  const [variableName, setVariableName] = useState('')
  const [allTraceData, setAllTraceData] = useState({})
  const [running, setRunning] = useState(false)
  const editorRef = useRef(null)
  const diagramRef = useRef(null)
  const diagramIdRef = useRef(0)

  const handleEditorMount = (editor) => {
    editorRef.current = editor
  }

  const generateMermaid = (trace) => {
    let mermaidStr = 'graph TD\n'

    trace.forEach((v, i) => {
      const nodeId = `N${i}`
      const label = `${v.value} (line ${v.line}, ${v.function})`
      mermaidStr += `${nodeId}["${label}"]\n`
      if (i < trace.length - 1) {
        mermaidStr += `${nodeId} --> N${i + 1}\n`
      }
    })

    return mermaidStr
  }

  const renderDiagram = async (trace) => {
    if (!diagramRef.current || !trace || trace.length === 0) {
      if (diagramRef.current) {
        diagramRef.current.innerHTML = '<p style="color: #666;">No trace data to display</p>'
      }
      return
    }

    const diagramDef = generateMermaid(trace)
    diagramIdRef.current += 1

    try {
      const { svg } = await mermaid.render(`diagram${diagramIdRef.current}`, diagramDef)
      diagramRef.current.innerHTML = svg
    } catch (err) {
      console.error('Mermaid error:', err)
      diagramRef.current.innerHTML = `<p style="color: red;">Diagram error: ${err.message}</p>`
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setOutput('Loading Python...\n')
    setAllTraceData({})
    setVariableName('')

    try {
      const code = editorRef.current.getValue()
      const { output: progOutput, traceData, firstVar } = await runAndTrace(code)

      setAllTraceData(traceData)

      // Format output
      let traceOutput = '--- Program Output ---\n'
      traceOutput += progOutput || '(no output)\n'
      traceOutput += '\n--- Variable Trace ---\n'

      for (const [varName, assignments] of Object.entries(traceData)) {
        traceOutput += `\n${varName}:\n`
        for (const a of assignments) {
          traceOutput += `  Line ${a.line} (${a.function}): ${a.value}\n`
        }
      }

      setOutput(traceOutput)

      // Render diagram for first variable
      if (firstVar && traceData[firstVar]) {
        setVariableName(firstVar)
        await renderDiagram(traceData[firstVar])
      }

    } catch (err) {
      setOutput(prev => prev + 'Error: ' + err.message + '\n')
    }

    setRunning(false)
  }

  useEffect(() => {
    if (variableName && allTraceData[variableName]) {
      renderDiagram(allTraceData[variableName])
    }
  }, [variableName])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', padding: '1rem', boxSizing: 'border-box', backgroundColor: '#1e1e1e', color: '#fff' }}>
      <h1 style={{ margin: '0 0 1rem 0', textAlign: 'center' }}>Python Tracer</h1>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}
        >
          {running ? 'Running...' : 'Run & Trace'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Variable:
          <select
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
            style={{ padding: '0.3rem', minWidth: '100px' }}
          >
            {Object.keys(allTraceData).length === 0 && <option value="">--</option>}
            {Object.keys(allTraceData).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0 }}>
        {/* Editor */}
        <div style={{ flex: 1, border: '1px solid #333' }}>
          <Editor
            height="100%"
            defaultLanguage="python"
            defaultValue={`x = 0
for i in range(5):
    x += i
print(x)`}
            theme="vs-dark"
            onMount={handleEditorMount}
          />
        </div>

        {/* Output + Diagram */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <pre style={{
            flex: 1,
            backgroundColor: '#2d2d2d',
            padding: '1rem',
            margin: 0,
            overflow: 'auto',
            border: '1px solid #333',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: '1.4'
          }}>
            {output || 'Click "Run & Trace" to execute your code'}
          </pre>
          <div
            ref={diagramRef}
            style={{
              flex: 1,
              border: '1px solid #333',
              padding: '1rem',
              overflow: 'auto',
              backgroundColor: '#fff',
              minHeight: '200px'
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default App
