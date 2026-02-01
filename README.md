# GlassBox

A web-based Python IDE that visualises how variables change throughout code execution. Hover over any variable assignment to see its complete history displayed as an interactive flowchart.

## Features

- **Live Python Execution** — Runs Python code directly in the browser using Pyodide (no server required)
- **Variable Tracing** — Tracks every variable assignment with line numbers and values
- **Scope-Aware Highlighting** — Correctly distinguishes between global and local variables, even when shadowed
- **Interactive Flowcharts** — Visualises variable history with zoomable, pannable Mermaid diagrams
- **Monaco Editor** — VS Code-like editing experience with syntax highlighting

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

## Installation

1. **Clone the repository**
```bash
   git clone https://github.com/ArcDerivative/trace-my-py.git
   cd trace-my-py
```

2. **Install dependencies**
```bash
   npm install
```

## Running the App

**Development mode:**
```bash
npm run dev
```
Then open [http://localhost:5173](http://localhost:5173) in your browser.

**Production build:**
```bash
npm run build
npm run preview
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `react` | UI framework |
| `react-dom` | React DOM rendering |
| `@monaco-editor/react` | VS Code-like code editor |
| `pyodide` | Python interpreter compiled to WebAssembly |
| `mermaid` | Flowchart generation and rendering |

**Dev dependencies:**
- `vite` — Build tool and dev server
- `@vitejs/plugin-react` — React plugin for Vite

## Project Structure
```
trace-my-py/
├── src/
│   ├── App.jsx        # Main React component (editor, UI, flowchart)
│   ├── App.css        # Styling
│   ├── tracer.js      # Python tracing engine (Pyodide + sys.settrace)
│   └── main.jsx       # React entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## How It Works

1. **Tracing**: Uses Python's `sys.settrace()` to intercept every line execution and capture variable changes

2. **Scope Analysis**: Uses Python's `ast` module to statically analyse which variables belong to which scope (global vs local)

3. **Highlighting**: Monaco decorations API highlights variable occurrences, respecting scope rules (e.g., a local `x` inside a function won't highlight the global `x`)

4. **Visualisation**: Mermaid.js renders the variable history as a flowchart, showing value progression with line numbers

## Usage Tips

- **Hover** over any line with a variable assignment to see that variable's history
- **Select** a variable from the dropdown to keep it highlighted
- **Zoom** in the flowchart with pinch gesture or Ctrl+scroll
- **Pan** the flowchart with two-finger scroll
- **Edit** the code and the trace automatically invalidates

## Browser Compatibility

Works in modern browsers that support WebAssembly:
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 16+

## License

MIT
