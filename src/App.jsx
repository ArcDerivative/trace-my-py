import Editor from '@monaco-editor/react'

function App() {
  const handleChange = (value) => {
    console.log(value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h1 style={{ textAlign: 'center', padding: '1rem' }}>Python Tracer</h1>
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="python"
          defaultValue="# Write Python here\nprint('hello world')"
          theme="vs-dark"
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

export default App
