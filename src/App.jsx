import { useState } from 'react'
import { analyzeCode } from './analyzeCode.js'

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Snapshot of the code that produced `lines`, so editing the textarea
  // afterwards can't desync the rendered output from its source lines.
  const [analyzed, setAnalyzed] = useState(null)

  async function run() {
    setLoading(true)
    setError('')
    setAnalyzed(null)
    try {
      const submitted = code
      const result = await analyzeCode(apiKey, submitted)
      setAnalyzed({ lines: result.lines, sourceLines: submitted.split('\n') })
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>codewalk</h1>

      <div>
        <input
          type="password"
          placeholder="Anthropic API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          size={50}
        />
        <button onClick={run} disabled={loading || !apiKey || !code.trim()}>
          Run analysis
        </button>
        {loading && <span> Analyzing...</span>}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div>
        <textarea
          rows={18}
          cols={100}
          placeholder="Paste code here (any language)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ fontFamily: 'monospace', whiteSpace: 'pre' }}
        />
      </div>

      {analyzed && (
        <ol>
          {analyzed.lines.map((line, i) => (
            <li key={i}>
              <div>
                <strong>{line.n}</strong>{' '}
                <code style={{ whiteSpace: 'pre' }}>
                  {analyzed.sourceLines[line.n - 1] ?? '(no such line)'}
                </code>
              </div>
              <div>{line.explanation}</div>
              {line.relations.length > 0 && (
                <ul>
                  {line.relations.map((relation, j) => (
                    <li key={j}>
                      line {relation.n}: {relation.note}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
