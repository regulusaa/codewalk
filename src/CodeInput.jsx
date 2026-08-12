import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, placeholder } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import {
  languageCompartment,
  loadLanguage,
  themeCompartment,
  themeFor,
} from './editorConfig.js'

const inputTheme = EditorView.baseTheme({
  '&': { height: '320px', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content, .cm-gutters': { fontFamily: 'var(--cw-mono)' },
  '.cm-gutters': { borderRight: '1px solid var(--cw-border)' },
})

/**
 * The editable paste target. CodeMirror owns the document — `initialDoc` is
 * read once at construction and changes flow outward through `onChange`.
 */
export default function CodeInput({ initialDoc, onChange, language, dark }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Deps are empty on purpose: rebuilding on every keystroke would destroy the
  // document, the cursor and the undo history. Language and theme changes are
  // applied through compartments instead.
  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          minimalSetup,
          lineNumbers(),
          placeholder('Paste code here (any language)'),
          languageCompartment.of([]),
          themeCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          }),
          inputTheme,
        ],
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  }, [language])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeFor(dark)),
    })
  }, [dark])

  return <div ref={hostRef} className="cw-input-editor" />
}
