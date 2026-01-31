import { useState } from 'react'

function App() {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [closed, setClosed] = useState(false)

  const malaysianStates = [
    'johor', 'kedah', 'kelantan', 'melaka', 'negeri sembilan',
    'pahang', 'perak', 'perlis', 'penang', 'sabah',
    'sarawak', 'selangor', 'terengganu'
  ]

  const handleChange = (e) => {
    const value = e.target.value
    setText(value)
    const lower = value.toLowerCase()
    if (malaysianStates.some(state => lower.includes(state))) {
      setClosed(true)
    }
  }

  const handleSubmit = () => {
    setSubmitted(text)
  }

  if (closed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ fontSize: '2rem' }}>Textbox closed!</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1rem' }}>
      <h1 style={{ fontSize: '2.5rem' }}>Malaysian State Detector</h1>
      <input
        type="text"
        value={text}
        onChange={handleChange}
        placeholder="Type something..."
        style={{ fontSize: '1.5rem', padding: '0.5rem', width: '300px' }}
      />
      <button onClick={handleSubmit} style={{ fontSize: '1.5rem', padding: '0.5rem 1rem' }}>
        Submit
      </button>
      {submitted && <p style={{ fontSize: '1.5rem' }}>{submitted}</p>}
    </div>
  )
}

export default App
