// Regenerates src/styles/tokens.css from src/styles/tokens.json (a copy of the design system's tokens).
// Light on :root, dark under prefers-color-scheme and [data-theme="dark"].
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
type Value = string | Record<string, string>
const tokens = await Bun.file(join(root, 'src/styles/tokens.json')).json()
const val = (v: Value, theme: string) => (typeof v === 'string' ? v : (v[theme] ?? v.light)).replace(/\{([^}]+)\}/g, 'var(--$1)')
const colors = (theme: string, indent: string) =>
  [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])].map((t: { name: string; value: Value }) => `${indent}--${t.name}: ${val(t.value, theme)};`).join('\n')
const other = ['spacing', 'radius'].flatMap((f) => tokens[f].tokens.map((t: { name: string; value: string }) => `  --${t.name}: ${t.value};`)).join('\n')
const fonts = Object.entries(tokens.type.families).map(([k, v]) => `  --font-${k}: ${v};`).join('\n')

const css = `/* Streams Console — generated from tokens.json by scripts/gen-tokens-css.ts (design system: https://claude.ai/artifact/FBr69Pi42psrJXtz6wSZxy). Do not edit by hand. */
:root {
${colors('light', '  ')}
${other}
${fonts}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colors('dark', '    ')}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${colors('dark', '  ')}
  color-scheme: dark;
}
`
await Bun.write(join(root, 'src/styles/tokens.css'), css)
console.log('tokens.css written')
