// Supabase Edge Function: parse-confirmation
// Extracts booking fields from confirmation TEXT using the Claude API with
// structured outputs (the model can only return the strict schema below).
//
// Deploy:
//   supabase functions deploy parse-confirmation
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Optional:
//   supabase secrets set PARSE_MODEL=claude-opus-4-8   # default
//
// The browser calls this via supabase.functions.invoke('parse-confirmation').
// It only ever receives extracted text — never the original file.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BOOKING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short title for the booking, e.g. "Hotel — Paris" or "Eurostar London→Paris". "" if unknown.' },
    vendor: { type: 'string', description: 'Provider/company name, e.g. "Booking.com", "Eurostar", "Qantas". "" if unknown.' },
    category: { type: 'string', enum: ['Flight', 'Accommodation', 'Train', 'Bus', 'Car hire', 'Ferry', 'Activity', 'Other'], description: 'Best-fit category for this booking.' },
    date: { type: 'string', description: 'Primary date as written in the text, e.g. "31 Aug" or "2026-08-31". "" if unknown.' },
    start: { type: 'string', description: 'Start / check-in / departure moment as ISO 8601 ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM") if a specific date (and time, when given) is present; else "".' },
    end: { type: 'string', description: 'End / check-out / arrival moment as ISO 8601; else "".' },
    location: { type: 'string', description: 'City / address / route, e.g. "Nice, France" or "LHR → CDG". "" if unknown.' },
    amount: { type: 'string', description: 'Total price for THIS booking as a number only (no currency symbol or separators), e.g. "475". "" if unknown.' },
    currency: { type: 'string', description: '3-letter currency code, e.g. "AUD", "EUR", "GBP". "" if unknown.' },
    confirmation_no: { type: 'string', description: 'Booking/confirmation reference. "" if unknown.' },
    link: { type: 'string', description: 'A URL copied VERBATIM from the text that opens THIS booking on the provider site (e.g. "Manage booking", "View itinerary", "Your booking"). Prefer a manage/view-booking link over marketing, tracking, unsubscribe, app-store or social links. "" if none is present.' },
  },
  required: ['title', 'vendor', 'category', 'date', 'start', 'end', 'location', 'amount', 'currency', 'confirmation_no', 'link'],
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bookings: {
      type: 'array',
      description: 'One entry per DISTINCT booking in the email. A single confirmation can hold several — outbound + return flights, multiple hotel stays, a car plus a room. Return an empty array if none can be found.',
      items: BOOKING,
    },
  },
  required: ['bookings'],
}

const SYSTEM = [
  'You extract structured booking details from a travel confirmation, provided either as email',
  'text or as scanned/photographed page images (e-tickets, PDFs). Read every page carefully.',
  'A single confirmation may describe SEVERAL bookings (e.g. an outbound and a return train/flight,',
  'or a hotel plus a transfer) — return one array entry for each distinct booking.',
  'Use ONLY information actually present in the text or images. Never invent or guess a value —',
  'if a field is not clearly present, return an empty string for it.',
  'For amount, return digits only (no currency symbol or thousands separators).',
  'For links, copy any URL exactly as it appears; do not fabricate or shorten URLs.',
].join(' ')

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'parse-confirmation', 10, 100, true); if (blocked) return blocked

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json({ error: 'Parser not configured (missing ANTHROPIC_API_KEY).' }, 503)
  }

  let text = ''
  let images: string[] = []
  try {
    const body = await req.json()
    text = (body?.text ?? '').toString()
    // Scanned PDFs / photos arrive as data-URL page images for vision OCR.
    if (Array.isArray(body?.images)) images = body.images.filter((x: unknown) => typeof x === 'string').slice(0, 8)
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  if (!text.trim() && !images.length) return json({ error: 'No text or images provided.' }, 400)

  // Cap input so a huge paste can't blow the token budget.
  const clipped = text.slice(0, 16_000)
  const model = Deno.env.get('PARSE_MODEL') || 'claude-opus-4-8'

  // Vision path (scanned pages) vs text path (email/paste). When images are present
  // they are authoritative — an image-only e-ticket has no text to send.
  const imageBlocks = images.map(toImageBlock).filter(Boolean)
  const usingVision = imageBlocks.length > 0
  const content = usingVision
    ? [...imageBlocks, { type: 'text', text: 'These are the pages of one or more travel confirmations. Extract every booking as JSON per the schema — read dates, times, prices, currencies, confirmation numbers, routes and any printed links.' }]
    : `Confirmation email:\n\n${clipped}`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), usingVision ? 90_000 : 30_000)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content }],
      }),
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `Model request failed (${resp.status}).`, detail: detail.slice(0, 300) }, 502)
    }

    const data = await resp.json()
    if (data.stop_reason === 'refusal') {
      return json({ error: 'The model declined to parse this confirmation.' }, 422)
    }
    const out = (data.content || []).find((b: any) => b.type === 'text')?.text ?? '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(out) } catch { parsed = {} }
    const bookings = Array.isArray(parsed?.bookings) ? parsed.bookings : []
    // Links: in text mode, keep one only if it appears verbatim in the email
    // (anti-hallucination). In vision mode there's no source text to check
    // against, so accept a well-formed URL the model read off the page.
    for (const b of bookings) {
      if (b && typeof b === 'object') b.link = usingVision ? sanitizeUrl(b.link) : verifyLink(b.link, clipped)
    }
    return json({ bookings }, 200)
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return json({ error: aborted ? 'Parser timed out.' : 'Parser error.' }, 504)
  }
})

// Keep a model-returned URL only if it is present verbatim in the source text —
// the model must never invent a link the traveller can't verify. Trailing
// sentence punctuation is trimmed before the comparison.
function verifyLink(link: unknown, source: string): string {
  if (typeof link !== 'string') return ''
  const cleaned = link.trim().replace(/[).,;:'"]+$/, '')
  if (!/^https?:\/\//i.test(cleaned)) return ''
  return source.toLowerCase().includes(cleaned.toLowerCase()) ? cleaned : ''
}

// Vision mode: no source text to verify against, so just require a well-formed URL.
function sanitizeUrl(link: unknown): string {
  if (typeof link !== 'string') return ''
  const cleaned = link.trim().replace(/[).,;:'"]+$/, '')
  return /^https?:\/\/[^\s]+\.[^\s]/i.test(cleaned) ? cleaned : ''
}

// Convert a data URL ("data:image/png;base64,….") to an Anthropic image block.
// Non-image or malformed URLs are dropped.
function toImageBlock(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  return { type: 'image', source: { type: 'base64', media_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] } }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
