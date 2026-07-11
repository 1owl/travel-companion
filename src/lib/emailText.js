// Turn a raw uploaded/pasted email into readable text the parser can use.
//
// Exported email files (.eml) and many "save as" HTML dumps are MIME: the body
// is base64- or quoted-printable-encoded and wrapped in multipart boundaries, so
// a naive file.text() hands the model gibberish and it extracts nothing. This
// decodes the transfer encoding, picks the best body part, and flattens HTML to
// text while PRESERVING link URLs (we need them for the booking link) — e.g.
// <a href="https://…/manage">Manage booking</a> becomes "Manage booking (https://…/manage)".

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

function decodeQuotedPrintable(s) {
  const noSoft = s.replace(/=\r?\n/g, '')                     // soft line breaks
  // Collect bytes (=XX escapes + literal chars) then UTF-8 decode as a whole,
  // so a multi-byte sequence like =E2=82=AC becomes "€", not three Latin-1 chars.
  const bytes = []
  for (let i = 0; i < noSoft.length; i++) {
    const c = noSoft[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(noSoft.substr(i + 1, 2))) {
      bytes.push(parseInt(noSoft.substr(i + 1, 2), 16)); i += 2
    } else {
      bytes.push(noSoft.charCodeAt(i) & 0xff)
    }
  }
  try { return new TextDecoder('utf-8').decode(Uint8Array.from(bytes)) } catch { return noSoft }
}

function decodeBase64(s) {
  try {
    const clean = s.replace(/\s+/g, '')
    if (typeof atob === 'function') {
      const bin = atob(clean)
      // Interpret bytes as UTF-8.
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
      return new TextDecoder('utf-8').decode(bytes)
    }
    return s
  } catch { return s }
}

export function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*href=["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, (_, href, txt) => {
      const label = txt.replace(/<[^>]+>/g, '').trim()
      return label ? `${label} (${href})` : ` ${href} `
    })
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\/td>|<\/th>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  return s.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/gm, '').trim()
}

function looksLikeHtml(s) {
  return /<html[\s>]|<body[\s>]|<div[\s>]|<table[\s>]|<a\s+href=/i.test(s)
}

function looksLikeMime(s) {
  return /^(from|to|subject|date|content-type|mime-version|received|return-path):/im.test(s.slice(0, 2000))
    && /content-type:/i.test(s.slice(0, 4000))
}

// Split a MIME entity into { headers, body }.
function splitEntity(raw) {
  const idx = raw.search(/\r?\n\r?\n/)
  if (idx === -1) return { headers: '', body: raw }
  return { headers: raw.slice(0, idx), body: raw.slice(idx).replace(/^\r?\n\r?\n/, '') }
}

function headerValue(headers, name) {
  // Unfold folded headers, then match "Name: value".
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ')
  const m = unfolded.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))
  return m ? m[1].trim() : ''
}

function decodeBody(headers, body) {
  const enc = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase()
  if (enc === 'base64') return decodeBase64(body)
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body)
  return body
}

// Walk a (possibly multipart) MIME message and return the richest readable text,
// preferring text/plain, falling back to flattened text/html.
function mimeToText(raw, depth = 0) {
  if (depth > 6) return ''
  const { headers, body } = splitEntity(raw)
  const rawCtype = headerValue(headers, 'Content-Type')      // original case (boundary is case-sensitive)
  const ctype = rawCtype.toLowerCase()

  if (ctype.startsWith('multipart/')) {
    const bm = rawCtype.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
    const boundary = bm && (bm[1] || bm[2])
    if (!boundary) return ''
    const parts = raw.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\r?\\n?`))
    const decoded = parts.slice(1, -1).map(p => mimeToText(p, depth + 1)).filter(Boolean)
    // Prefer a text/plain part if any part produced plain text; else the longest.
    return decoded.sort((a, b) => b.length - a.length)[0] || ''
  }

  const decoded = decodeBody(headers, body)
  if (ctype.startsWith('text/html') || (!ctype && looksLikeHtml(decoded))) return htmlToText(decoded)
  return decoded
}

// Public entry: normalise any raw email/text/html string into readable text.
export function emailToText(raw) {
  if (!raw) return ''
  const s = String(raw)
  if (looksLikeMime(s)) {
    const out = mimeToText(s)
    if (out && out.trim().length > 20) return out.trim()
  }
  if (looksLikeHtml(s)) return htmlToText(s)
  return s.trim()
}
