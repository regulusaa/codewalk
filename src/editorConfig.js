import { Compartment } from '@codemirror/state'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'

// A curated subset of language-data's ~143 descriptors. These strings are the
// descriptor `name` values verbatim, so the dropdown value doubles as the
// lookup key and no mapping table is needed.
export const CURATED_LANGUAGES = [
  'JavaScript',
  'TypeScript',
  'Python',
  'HTML',
  'CSS',
  'JSON',
  'Java',
  'C',
  'C++',
  'Go',
  'Rust',
  'SQL',
]

// Module-level tokens shared by both editors. A Compartment is only an identity
// marker — each EditorState stores its own contents for it — so reconfiguring
// one view's compartment cannot affect the other's.
export const languageCompartment = new Compartment()
export const themeCompartment = new Compartment()

// language-data loads each grammar through a dynamic import, so resolution is
// async and `descriptor.support` is undefined until the first load resolves.
// Results are memoised so a language is only ever fetched once.
const cache = new Map()

export function loadLanguage(name) {
  if (cache.has(name)) return cache.get(name)

  const descriptor = languages.find((d) => d.name === name)
  // Exact match rather than LanguageDescription.matchLanguageName: our names
  // come straight from the descriptors, and fuzzy matching could silently
  // resolve a typo to the wrong grammar.
  const pending = descriptor
    ? descriptor.load().catch((err) => {
        console.error(`Could not load language "${name}"`, err)
        cache.delete(name) // let a later attempt retry
        return []
      })
    : Promise.resolve([])

  cache.set(name, pending)
  return pending
}

export function themeFor(dark) {
  return dark ? oneDark : []
}
