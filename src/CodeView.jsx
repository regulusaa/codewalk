import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'

// minimalSetup gives us syntax highlighting (defaultHighlightStyle) without
// pulling in basicSetup's fold gutter, active-line highlight, and decorations.
// The line-number gutter is added separately below as the click target.
export const LANGUAGES = {
  javascript: { label: 'JavaScript', extension: javascript },
  python: { label: 'Python', extension: python },
}

export default function CodeView({ code, language, onLineClick }) {
  const hostRef = useRef(null)

  // Held in a ref so a new callback identity on each App render doesn't
  // land in the effect deps and tear down the EditorView every render.
  const onLineClickRef = useRef(onLineClick)
  useEffect(() => {
    onLineClickRef.current = onLineClick
  })

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: code,
        extensions: [
          minimalSetup,
          LANGUAGES[language].extension(),
          EditorView.editable.of(false),
          lineNumbers({
            domEventHandlers: {
              mousedown(view, block) {
                // `block` is a BlockInfo; resolve its start offset to a
                // 1-based document line number.
                onLineClickRef.current?.(
                  view.state.doc.lineAt(block.from).number,
                )
                return true // handled
              },
            },
          }),
        ],
      }),
      parent: hostRef.current,
    })
    // Destroys on unmount and before every re-run of this effect, so a new
    // code/language never stacks a second EditorView on the host node.
    return () => view.destroy()
  }, [code, language])

  return <div ref={hostRef} />
}
