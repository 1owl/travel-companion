import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock({ saved_places: [] })
  return { supabase, __store: store }
})

import { __store } from './supabase'
import { savePlace, listSavedPlaces, updatePlaceStatus, removeSavedPlace, addPlaceToItinerary } from './savedPlaces'

beforeEach(() => { __store.saved_places = []; __store.bookings = [] })

const card = {
  google_place_id: 'g1', name: 'Eiffel Tower', category: 'sight',
  rating: 4.6, user_ratings_total: 1000, price_level: '$$',
  photo_url: 'https://img/eiffel', maps_url: 'https://maps/eiffel', why: 'Iconic',
}

describe('savedPlaces', () => {
  it('saves a planner card as an idea (mapping photo_url -> photo_ref)', async () => {
    const { data, error } = await savePlace('t1', card)
    expect(error).toBeNull()
    expect(data).toMatchObject({ name: 'Eiffel Tower', status: 'idea', photo_ref: 'https://img/eiffel', google_place_id: 'g1', price_level: '$$' })
    expect(__store.saved_places).toHaveLength(1)
  })

  it('lists saved places for a trip', async () => {
    await savePlace('t1', card)
    await savePlace('t2', { ...card, name: 'Other trip place' })
    const { data } = await listSavedPlaces('t1')
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Eiffel Tower')
  })

  it('updates status and removes', async () => {
    const { data } = await savePlace('t1', card)
    await updatePlaceStatus(data.id, 'shortlisted')
    expect(__store.saved_places[0].status).toBe('shortlisted')
    await removeSavedPlace(data.id)
    expect(__store.saved_places).toHaveLength(0)
  })
})

describe('addPlaceToItinerary', () => {
  const trip = { id: 't1', base_currency: 'AUD', start_date: '2026-09-07', end_date: '2026-09-11' }

  it('creates exactly one booking linked to the place and flips its status', async () => {
    __store.saved_places = [{ id: 'p1', trip_id: 't1', name: 'Eiffel Tower', category: 'sight', status: 'idea', maps_url: 'https://maps/x' }]
    const place = { ...__store.saved_places[0] }
    const { data, error } = await addPlaceToItinerary(trip, place)
    expect(error).toBeNull()
    expect(__store.bookings).toHaveLength(1)
    expect(data).toMatchObject({ title: 'Eiffel Tower', status: 'TO BOOK', saved_place_id: 'p1', category: 'Attraction' })
    expect(data.link).toContain('maps') // sight uses the maps link
    expect(__store.saved_places[0].status).toBe('added_to_itinerary')
  })

  it('is idempotent — an already-added place makes no second booking', async () => {
    __store.saved_places = [{ id: 'p1', trip_id: 't1', name: 'Eiffel Tower', category: 'sight', status: 'added_to_itinerary' }]
    const { data, error } = await addPlaceToItinerary(trip, __store.saved_places[0])
    expect(data).toBeNull()
    expect(error).toBeTruthy()
    expect(__store.bookings).toHaveLength(0)
  })
})
