// Simple FX layer. Rates are "AUD per 1 unit of the currency".
// Replace DEFAULT_RATES with a live feed (e.g. open.er-api.com) in production.

export const CURRENCIES = ['AUD', 'EUR', 'GBP', 'USD', 'NZD', 'JPY']

export const DEFAULT_RATES = {
  AUD: 1,
  EUR: 1.63,
  GBP: 1.88,
  USD: 1.5,
  NZD: 0.92,
  JPY: 0.01
}

// Convert an amount in `currency` into the trip base currency.
export function toBase(amount, currency, baseCurrency = 'AUD', rates = DEFAULT_RATES) {
  const amt = Number(amount) || 0
  const inAud = amt * (rates[currency] ?? 1)
  return inAud / (rates[baseCurrency] ?? 1)
}

// A single budget line converted to the base currency: qty × unit price × FX.
// Shared so the budget engine and any other total (itinerary snapshot) reuse the
// same math instead of re-implementing it.
export function lineBase(item, base = 'AUD') {
  return toBase((Number(item.qty) || 0) * (Number(item.unit_price) || 0), item.currency, base)
}

// Grand total of budget line items in the base currency.
export function sumBudget(items, base = 'AUD') {
  return (items || []).reduce((s, r) => s + lineBase(r, base), 0)
}

export function fmt(n, currency = 'AUD') {
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(n) || 0)
  } catch {
    return currency + ' ' + Math.round(Number(n) || 0).toLocaleString()
  }
}
