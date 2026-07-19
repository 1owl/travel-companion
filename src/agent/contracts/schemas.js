// Single source of truth for tool input schemas (Phase 1).
//
// Framework-free ESM so the same file is importable by the in-app runtime, the
// (future) MCP server, and Edge Functions. Every field carries a natural-language
// .describe() — this IS the manifest the model reads, so ambiguity here is the
// #1 cause of agent failure. Handlers re-validate against these server-side;
// agent-supplied params are never trusted.

import { z } from 'zod'

// Keep in sync with src/lib/currency.js CURRENCIES (inlined for portability).
export const CURRENCIES = ['AUD', 'EUR', 'GBP', 'USD', 'NZD', 'JPY']

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A calendar date as YYYY-MM-DD.')
const UUID = z.string().uuid()
const CURRENCY = z.enum(CURRENCIES)
const CABIN = z.enum(['economy', 'premium_economy', 'business', 'first'])
const LEDGER_CATEGORY = z.enum(['Flight', 'Accommodation', 'Train', 'Bus', 'Ferry', 'Activity', 'Other'])
const LEDGER_STATUS = z.enum(['TO BOOK', 'BOOKED', 'OPTIONAL', 'CHECK'])

// ── Read-only ────────────────────────────────────────────────────────────────
export const searchFlightsInput = z.object({
  origin: z.string().min(3).describe("Departure — 3-letter IATA airport code preferred (e.g. 'LHR'), or a city name."),
  destination: z.string().min(3).describe('Arrival — IATA airport code or city name.'),
  depart_date: ISO_DATE.describe('Outbound date, YYYY-MM-DD.'),
  return_date: ISO_DATE.optional().describe('Return date, YYYY-MM-DD. Omit for one-way.'),
  adults: z.number().int().min(1).max(9).default(1).describe('Number of adult passengers.'),
  cabin: CABIN.default('economy').describe('Cabin class.'),
  max_stops: z.number().int().min(0).max(3).optional().describe('Maximum stops per leg; 0 = direct only.'),
})

export const searchStaysInput = z.object({
  location: z.string().min(2).describe("City or area, e.g. 'Lyon, France'."),
  check_in: ISO_DATE.describe('Check-in date, YYYY-MM-DD.'),
  check_out: ISO_DATE.describe('Check-out date, YYYY-MM-DD.'),
  guests: z.number().int().min(1).max(8).default(2).describe('Number of guests.'),
  max_price_per_night: z.number().positive().optional().describe("Ceiling per night, in the trip's base currency."),
})

export const getOfferInput = z.object({
  offer_id: z.string().min(1).describe('The Duffel offer id from a prior search_flights/search_stays result.'),
})

export const listTripsInput = z.object({
  status: z.enum(['planning', 'booked', 'past', 'all']).default('all').describe('Filter by trip status.'),
})

export const getItineraryInput = z.object({
  trip_id: UUID.describe("The trip's id (from list_trips)."),
})

export const searchActivitiesInput = z.object({
  location: z.string().min(2).describe("City or area, e.g. 'Lyon'."),
  date: ISO_DATE.optional().describe('Day the activity is for (context only).'),
  category: z.enum(['sight', 'food', 'activity', 'all']).default('all').describe('Kind of place.'),
})

export const getTripBudgetInput = z.object({
  trip_id: UUID.describe("The trip's id."),
})

// ── Mutating, non-financial ──────────────────────────────────────────────────
export const createTripInput = z.object({
  name: z.string().min(1).describe("Trip name, e.g. 'France 2026'."),
  start_date: ISO_DATE.optional().describe('Trip start, YYYY-MM-DD.'),
  end_date: ISO_DATE.optional().describe('Trip end, YYYY-MM-DD.'),
  base_currency: CURRENCY.default('AUD').describe('Currency all totals roll up into.'),
  travelers: z.number().int().min(1).max(20).default(1).describe('Number of travellers.'),
})

const itineraryFields = {
  title: z.string().min(1).describe("Short label, e.g. 'Eurostar London→Paris'."),
  category: LEDGER_CATEGORY.describe('Item type.'),
  date: ISO_DATE.optional().describe('Date, YYYY-MM-DD.'),
  starts_at: z.string().datetime().optional().describe('Start ISO datetime if a time is known.'),
  ends_at: z.string().datetime().optional().describe('End ISO datetime.'),
  amount: z.number().nonnegative().optional().describe('Known price; omit if unknown. Never invented.'),
  currency: CURRENCY.optional().describe('Currency of amount.'),
  link: z.string().url().optional().describe('Booking/manage URL if any.'),
  status: LEDGER_STATUS.default('TO BOOK').describe('Ledger status.'),
  notes: z.string().optional().describe('Free-text notes.'),
}
export const addItineraryItemInput = z.object({
  trip_id: UUID.describe("The trip's id."),
  ...itineraryFields,
})

export const updateItineraryItemInput = z.object({
  item_id: UUID.describe('The itinerary/booking item id to change.'),
  patch: z.object({
    title: itineraryFields.title.optional(),
    category: itineraryFields.category.optional(),
    date: itineraryFields.date,
    starts_at: itineraryFields.starts_at,
    ends_at: itineraryFields.ends_at,
    amount: itineraryFields.amount,
    currency: itineraryFields.currency,
    link: itineraryFields.link,
    status: LEDGER_STATUS.optional().describe('Ledger status.'), // no default — a patch only changes named fields
    notes: itineraryFields.notes,
  }).describe('Only the fields to change.'),
})

export const setTravellerPreferencesInput = z.object({
  trip_id: UUID.optional().describe('Scope to a trip; omit for account-wide defaults.'),
  preferences: z.object({
    cabin: CABIN.optional(),
    max_stops: z.number().int().min(0).max(3).optional(),
    diet: z.string().max(120).optional().describe("e.g. 'vegetarian'. Free text, non-medical."),
    pace: z.enum(['relaxed', 'balanced', 'packed']).optional(),
    budget_style: z.enum(['budget', 'mid', 'premium']).optional(),
  }).describe('Preference fields to set/merge. Never passport or payment data.'),
})

// ── Financial / irreversible ─────────────────────────────────────────────────
export const holdOfferInput = z.object({
  offer_id: z.string().min(1).describe('Offer id to hold (validate with get_offer first).'),
  trip_id: UUID.describe("The trip's id."),
})

export const createBookingInput = z.object({
  offer_id: z.string().min(1).describe('Offer id, freshly validated via get_offer in the same flow.'),
  trip_id: UUID.describe("The trip's id."),
  expected_amount: z.number().positive().describe('The amount the user approved; the handler aborts if Duffel’s current total differs.'),
  expected_currency: CURRENCY.describe('Currency of expected_amount.'),
  passengers: z.array(z.object({
    given_name: z.string().min(1),
    family_name: z.string().min(1),
    born_on: ISO_DATE.optional(),
  })).min(1).describe('Passenger names/DOB only. Passport and payment data are NEVER accepted here — they stay in Duffel’s vault.'),
})

export const cancelBookingInput = z.object({
  booking_id: UUID.describe("The trip's booking record id."),
  reason: z.string().max(280).optional().describe('Optional cancellation reason.'),
})
