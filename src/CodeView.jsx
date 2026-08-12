import { useEffect, useRef } from 'react'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  lineNumbers,
} from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import {
  languageCompartment,
  loadLanguage,
  themeCompartment,
  themeFor,
} from './editorConfig.js'

// minimalSetup gives us syntax highlighting (defaultHighlightStyle) without
// pulling in basicSetup's fold gutter, active-line highlight, and decorations.
// Its highlight style is registered with `fallback: true`, so adding oneDark
// through the theme compartment supersedes it cleanly.
// The line-number gutter is added separately below as the click target.

const activeDeco = Decoration.line({ class: 'cw-active' })
const relatedDeco = Decoration.line({ class: 'cw-related' })

const setHighlight = StateEffect.define()

// Rebuilt from scratch on every effect, so the previous selection is always
// fully cleared rather than layered under the new one.
function buildDecorations(state, activeLine, relatedLines) {
  const seen = new Set()
  const ranges = []
  const push = (n, deco) => {
    if (!Number.isInteger(n) || n < 1 || n > state.doc.lines) return
    if (seen.has(n)) return // active wins over related on the same line
    seen.add(n)
    ranges.push({ pos: state.doc.line(n).from, deco })
  }

  push(activeLine, activeDeco)
  for (const n of relatedLines) push(n, relatedDeco)

  // RangeSet.of requires ascending positions.
  ranges.sort((a, b) => a.pos - b.pos)
  return Decoration.set(ranges.map(({ pos, deco }) => deco.range(pos)))
}

const highlightField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlight)) {
        return buildDecorations(
          tr.state,
          effect.value.activeLine,
          effect.value.relatedLines,
        )
      }
    }
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

// Colours come from the CSS custom properties in styles.css so the accent is
// defined in exactly one place.
const highlightTheme = EditorView.baseTheme({
  '.cw-active': { backgroundColor: 'var(--cw-active-bg)' },
  '.cw-related': { backgroundColor: 'var(--cw-related-bg)' },
})

// Which lines have an explanation. Kept in editor state (rather than closed
// over) so the marker gutter stays correct when a re-analysis produces a new
// set of lines without changing the document.
const setExplained = StateEffect.define()

const explainedField = StateField.define({
  create() {
    return new Set()
  },
  update(explained, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setExplained)) return effect.value
    }
    return explained
  },
})

const explainedMarker = new (class extends GutterMarker {
  toDOM() {
    return document.createTextNode('•')
  }
})()

// A separate gutter rather than a line decoration, so it cannot interact with
// the active/related background decorations.
function makeMarkerGutter(domEventHandlers) {
  return gutter({
    class: 'cw-marker-gutter',
    lineMarker(view, block) {
      const n = view.state.doc.lineAt(block.from).number
      return view.state.field(explainedField).has(n) ? explainedMarker : null
    },
    lineMarkerChange: (update) =>
      update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(setExplained)),
      ),
    domEventHandlers,
  })
}

// Required for scrollIntoView to do anything: without a height bound the
// scroller grows to fit the whole document, so there is nothing to scroll
// and jumping to an off-screen line is a no-op.
const layoutTheme = EditorView.baseTheme({
  '&': { maxHeight: '60vh', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content, .cm-gutters': { fontFamily: 'var(--cw-mono)' },
  '.cm-gutters': { borderRight: '1px solid var(--cw-border)' },
  '.cw-marker-gutter': { paddingRight: '4px', color: 'var(--cw-accent)' },
})

export default function CodeView({
  code,
  language,
  dark,
  onLineClick,
  activeLine,
  relatedLines,
  explainedLines,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)

  // Held in refs so new identities on each App render don't land in the
  // effect deps and tear down the EditorView every render.
  const onLineClickRef = useRef(onLineClick)
  const highlightRef = useRef({ activeLine, relatedLines })
  const explainedRef = useRef(explainedLines)
  useEffect(() => {
    onLineClickRef.current = onLineClick
    highlightRef.current = { activeLine, relatedLines }
    explainedRef.current = explainedLines
  })

  useEffect(() => {
    // Shared by both gutters so clicking the marker selects the line too.
    const gutterClick = {
      mousedown(view, block) {
        // `block` is a BlockInfo; resolve its start offset to a 1-based
        // document line number.
        onLineClickRef.current?.(view.state.doc.lineAt(block.from).number)
        return true // handled
      },
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: code,
        extensions: [
          minimalSetup,
          languageCompartment.of([]),
          themeCompartment.of([]),
          EditorView.editable.of(false),
          lineNumbers({ domEventHandlers: gutterClick }),
          makeMarkerGutter(gutterClick),
          // Seeded from current props so a rebuild triggered by new code never
          // starts with stale-empty decorations.
          highlightField.init((state) =>
            buildDecorations(
              state,
              highlightRef.current.activeLine,
              highlightRef.current.relatedLines,
            ),
          ),
          explainedField.init(() => new Set(explainedRef.current)),
          highlightTheme,
          layoutTheme,
        ],
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    // Destroys on unmount and before every re-run of this effect, so new code
    // never stacks a second EditorView on the host node. Language is NOT a
    // dependency — it is swapped in place through the compartment below.
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [code])

  useEffect(() => {
    // Guards against out-of-order resolution: switching languages quickly could
    // otherwise let an earlier import land after a later one.
    let stale = false
    loadLanguage(language).then((extension) => {
      if (stale) return
      viewRef.current?.dispatch({
        effects: languageCompartment.reconfigure(extension),
      })
    })
    return () => {
      stale = true
    }
  }, [language, code])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeFor(dark)),
    })
  }, [dark, code])

  // `relatedLines` is joined into a string so a fresh array identity with the
  // same contents doesn't cause a redundant dispatch.
  const relatedKey = relatedLines.join(',')
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const effects = [setHighlight.of({ activeLine, relatedLines })]
    if (
      Number.isInteger(activeLine) &&
      activeLine >= 1 &&
      activeLine <= view.state.doc.lines
    ) {
      // Dispatched together with the highlight so the scroll and the
      // decoration land in the same transaction.
      effects.push(
        EditorView.scrollIntoView(view.state.doc.line(activeLine).from, {
          y: 'center',
        }),
      )
    }
    view.dispatch({ effects })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine, relatedKey])

  const explainedKey = explainedLines.join(',')
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setExplained.of(new Set(explainedLines)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainedKey])

  return <div ref={hostRef} />
}
