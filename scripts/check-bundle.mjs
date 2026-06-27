// Launch-hardening guard: fail the build if any secret-shaped string leaks into
// the browser bundle. Only the Supabase URL and the sb_publishable_ key are allowed
// client-side. Runs after `vite build` (see package.json "build").
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const DIST = 'dist'
if (!existsSync(DIST)) {
  console.error('check-bundle: dist/ not found — run `vite build` first.')
  process.exit(1)
}

// Patterns for real secret values that must never ship to the browser.
const FORBIDDEN = [
  { name: 'Duffel token', re: /duffel_(test|live)_[A-Za-z0-9]/ },
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9]/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9]/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.svg', '.txt'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (TEXT_EXT.has(extname(p).toLowerCase())) out.push(p)
  }
  return out
}

const hits = []
for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8')
  for (const { name, re } of FORBIDDEN) {
    const m = text.match(re)
    if (m) hits.push({ file, name, sample: m[0].slice(0, 12) + '…' })
  }
}

if (hits.length) {
  console.error('\n✖ check-bundle FAILED — secret-shaped strings found in dist/:')
  for (const h of hits) console.error(`   ${h.name} in ${h.file} (${h.sample})`)
  console.error('\nNo key other than the Supabase URL + sb_publishable_ key may be client-side.')
  process.exit(1)
}
console.log('✓ check-bundle: no secrets in dist/')
