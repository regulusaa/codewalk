import { useEffect, useMemo, useState } from 'react'
import { analyzeCode } from './analyzeCode.js'
import CodeInput from './CodeInput.jsx'
import CodeView from './CodeView.jsx'
import { CURATED_LANGUAGES } from './editorConfig.js'

const MAX_LINES = 300
const KEY_STORAGE = 'codewalk.apiKey'
const THEME_STORAGE = 'codewalk.theme'

// localStorage throws in some privacy modes; both the saved key and the saved
// theme are conveniences, so failing to read or write should never break the app.
function readStored(key) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
function removeStored(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Map every line number to the lines it relates to, in both directions.
 *
 * The model reports each connection once, in whichever direction it chose
 * (typically use-site -> definition). Recording the reverse as well means
 * clicking either end of a pair surfaces the connection.
 *
 * Forward relations are added first so that when both directions were
 * reported with different notes, the model's own wording for A -> B wins.
 */
export function buildRelationIndex(lines) {
  const index = new Map()

  const add = (from, to, note) => {
    if (from === to) return // a line relating to itself is not useful
    if (!index.has(from)) index.set(from, [])
    const related = index.get(from)
    if (related.some((r) => r.n === to)) return // already linked to that line
    related.push({ n: to, note })
  }

  for (const line of lines) {
    for (const relation of line.relations) add(line.n, relation.n, relation.note)
  }
  for (const line of lines) {
    for (const relation of line.relations) add(relation.n, line.n, relation.note)
  }

  return index
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => readStored(KEY_STORAGE))
  const [language, setLanguage] = useState('JavaScript')
  const [dark, setDark] = useState(() => readStored(THEME_STORAGE) === 'dark')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Snapshot of the code that produced `lines`, so editing the textarea
  // afterwards can't desync the rendered output from its source lines.
  const [analyzed, setAnalyzed] = useState(null)
  const [activeLine, setActiveLine] = useState(null)
  // Lines visited before the current one, oldest first.
  const [history, setHistory] = useState([])

  // Every forward move goes through here, so gutter clicks and chip clicks
  // record history identically.
  function navigateTo(n) {
    if (n === activeLine) return // re-clicking the active line is a no-op
    if (activeLine !== null) setHistory((h) => [...h, activeLine])
    setActiveLine(n)
  }

  // Going back never records history — it consumes it.
  function goBackTo(index) {
    setActiveLine(history[index])
    setHistory((h) => h.slice(0, index))
  }

  const relationIndex = useMemo(
    () => (analyzed ? buildRelationIndex(analyzed.lines) : new Map()),
    [analyzed],
  )

  const activeEntry =
    analyzed?.lines.find((line) => line.n === activeLine) ?? null
  const related = (activeLine !== null && relationIndex.get(activeLine)) || []
  const relatedLines = useMemo(() => related.map((r) => r.n), [related])
  const explainedLines = useMemo(
    () => (analyzed ? analyzed.lines.map((line) => line.n) : []),
    [analyzed],
  )

  // Last few visited lines; `offset` maps a trail position back to its real
  // index in `history`.
  const TRAIL_LENGTH = 3
  const offset = Math.max(0, history.length - TRAIL_LENGTH)
  const trail = history.slice(offset)

  // The attribute lives on <html> so the page background flips too, not just
  // the app container.
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    writeStored(THEME_STORAGE, dark ? 'dark' : 'light')
  }, [dark])

  function clearKey() {
    removeStored(KEY_STORAGE)
    setApiKey('')
  }

  async function run() {
    const nonBlank = code.split('\n').filter((l) => l.trim() !== '').length
    if (nonBlank > MAX_LINES) {
      // Guard before any request is sent; `loading` is never set, so the
      // button stays enabled.
      setError(
        `Please paste ${MAX_LINES} lines or fewer for now (this has ${nonBlank} non-blank lines).`,
      )
      return
    }

    setLoading(true)
    setError('')
    setAnalyzed(null)
    setActiveLine(null)
    setHistory([])
    try {
      const submitted = code
      const result = await analyzeCode(apiKey, submitted)
      setAnalyzed({
        lines: result.lines,
        source: submitted,
        sourceLines: submitted.split('\n'),
      })
      writeStored(KEY_STORAGE, apiKey) // only persist a key that actually worked
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cw-app">
      <header className="cw-header">
        <h1>codewalk</h1>
        <button
          type="button"
          className="cw-toggle"
          onClick={() => setDark((d) => !d)}
          aria-pressed={dark}
        >
          {dark ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      <div className="cw-controls">
        <input
          className="cw-input"
          type="password"
          placeholder="Anthropic API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <select
          className="cw-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {CURATED_LANGUAGES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          className="cw-button"
          onClick={run}
          disabled={loading || !apiKey || !code.trim()}
        >
          Run analysis
        </button>
        {apiKey && (
          <button type="button" className="cw-link" onClick={clearKey}>
            Clear key
          </button>
        )}
        {loading && <span className="cw-status">Analyzing...</span>}
      </div>

      {error && <p className="cw-error">{error}</p>}

      <CodeInput
        initialDoc={code}
        onChange={setCode}
        language={language}
        dark={dark}
      />

      {analyzed && (
        <div className="cw-workspace">
          <div className="cw-editor">
            <CodeView
              code={analyzed.source}
              language={language}
              dark={dark}
              onLineClick={navigateTo}
              activeLine={activeLine}
              relatedLines={relatedLines}
              explainedLines={explainedLines}
            />
          </div>

          <div className="cw-panel">
            <div className="cw-nav">
              <button
                type="button"
                className="cw-back"
                onClick={() => goBackTo(history.length - 1)}
                disabled={history.length === 0}
              >
                ← Back
              </button>

              {activeLine !== null && (
                <span className="cw-trail">
                  {offset > 0 && '… '}
                  {trail.map((n, i) => (
                    <span key={offset + i}>
                      <button
                        type="button"
                        className="cw-crumb"
                        onClick={() => goBackTo(offset + i)}
                      >
                        {n}
                      </button>
                      {' → '}
                    </span>
                  ))}
                  <span className="cw-current">{activeLine}</span>
                </span>
              )}
            </div>

            {activeLine === null ? (
              <p className="cw-placeholder">
                Click a line to see its explanation
              </p>
            ) : (
              <div>
                <h2>Line {activeLine}</h2>
                <p className="cw-explanation">
                  {activeEntry
                    ? activeEntry.explanation
                    : 'No explanation for this line.'}
                </p>

                {related.length > 0 && (
                  <div>
                    <h3>Related lines</h3>
                    <div className="cw-chips">
                      {related.map((relation) => (
                        <button
                          key={relation.n}
                          type="button"
                          className="cw-chip"
                          onClick={() => navigateTo(relation.n)}
                        >
                          line {relation.n}: {relation.note}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
