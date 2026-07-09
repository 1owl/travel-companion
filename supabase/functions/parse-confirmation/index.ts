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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short title for the booking, e.g. "Hotel — Paris" or "Eurostar London→Paris". "" if unknown.' },
    vendor: { type: 'string', description: 'Provider/company name, e.g. "Booking.com", "Eurostar". "" if unknown.' },
    date: { type: 'string', description: 'Booking/travel date as written in the text, e.g. "31 Aug" or "2026-08-31". "" if unknown.' },
    amount: { type: 'string', description: 'Total price as a number only (no currency symbol), e.g. "475". "" if unknown.' },
    currency: { type: 'string', description: '3-letter currency code, e.g. "AUD", "EUR", "GBP". "" if unknown.' },
    confirmation_no: { type: 'string', description: 'Booking/confirmation reference. "" if unknown.' },
  },
  required: ['title', 'vendor', 'date', 'amount', 'currency', 'confirmation_no'],
}

const SYSTEM = [
  'You extract structured booking details from a travel confirmation.',
  'Use ONLY information present in the provided text. Never invent or guess a value —',
  'if a field is not clearly present, return an empty string for it.',
  'For amount, return digits only (no currency symbol or thousands separators).',
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
  try {
    const body = await req.json()
    text = (body?.text ?? '').toString()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  if (!text.trim()) return json({ error: 'No text provided.' }, 400)

  // Cap input so a huge paste can't blow the token budget.
  const clipped = text.slice(0, 12_000)
  const model = Deno.env.get('PARSE_MODEL') || 'claude-opus-4-8'

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
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
        max_tokens: 1024,
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: `Confirmation text:\n\n${clipped}` }],
      }),
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `Model request failed (${resp.status}).`, detail: detail.slice(0, 300) }, 502)
    }

    const data = await resp.json()
    if (data.stop_reason === 'refusal') {
      return json({ error: 'The model declined to parse this text.' }, 422)
    }
    const out = (data.content || []).find((b: any) => b.type === 'text')?.text ?? '{}'
    // Return the raw JSON string; the client coerces it to the prefill shape.
    return new Response(out, { headers: { ...CORS, 'content-type': 'application/json' } })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return json({ error: aborted ? 'Parser timed out.' : 'Parser error.' }, 504)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
