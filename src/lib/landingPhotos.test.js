import { describe, it, expect } from 'vitest'
import pool from './landingPhotos.json'
import { pickLandingPhoto, hasLandingPool } from './landingPhotos'

const firstQueryWithPhotos = Object.keys(pool).find(k => Array.isArray(pool[k]) && pool[k].length)

describe('pickLandingPhoto', () => {
  it('falls back to the placeholder for an unpooled query (no network, never blank)', () => {
    const img = pickLandingPhoto('___not a real query___', 'local/fallback.jpg')
    expect(img).toEqual({ src: 'local/fallback.jpg', author: null, author_url: null, dynamic: false })
  })

  it('returns a pooled photo in the useDynamicImage shape when the query is pooled', () => {
    if (!firstQueryWithPhotos) return // manifest not fetched yet — skip rather than fail
    const img = pickLandingPhoto(firstQueryWithPhotos, 'fallback.jpg', 0)
    expect(img.dynamic).toBe(true)
    expect(typeof img.src).toBe('string')
    expect(img.src).not.toBe('fallback.jpg')
    expect(img).toHaveProperty('author')
    expect(img).toHaveProperty('author_url')
  })

  it('is deterministic for a given seed (so a tile does not reshuffle on re-render)', () => {
    if (!firstQueryWithPhotos) return
    const a = pickLandingPhoto(firstQueryWithPhotos, 'f', 1)
    const b = pickLandingPhoto(firstQueryWithPhotos, 'f', 1)
    expect(a.src).toBe(b.src)
  })

  it('wraps the seed around the pool length', () => {
    if (!firstQueryWithPhotos) return
    const n = pool[firstQueryWithPhotos].length
    expect(pickLandingPhoto(firstQueryWithPhotos, 'f', n).src)
      .toBe(pickLandingPhoto(firstQueryWithPhotos, 'f', 0).src)
  })
})

describe('hasLandingPool', () => {
  it('reflects whether the manifest holds any photos', () => {
    expect(hasLandingPool()).toBe(Boolean(firstQueryWithPhotos))
  })
})
