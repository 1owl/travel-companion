import { useEffect, useState } from 'react'
import { searchImages, trackImageUse } from '../lib/images'

// Resolve a place-aware image for `query`, starting from (and falling back to) a
// local placeholder so there is never a blank or broken cover. Re-runs when the
// query changes; ignores a stale response if the query changed mid-flight.
export function useDynamicImage(query, fallbackSrc) {
  const [img, setImg] = useState({ src: fallbackSrc, author: null, author_url: null, dynamic: false })

  useEffect(() => {
    let alive = true
    setImg({ src: fallbackSrc, author: null, author_url: null, dynamic: false })
    if (!query) return
    searchImages(query).then(({ results }) => {
      if (!alive || !results?.length) return
      const r = results[0]
      setImg({ src: r.url, author: r.author, author_url: r.author_url, dynamic: true })
      trackImageUse(r.download_location)
    })
    return () => { alive = false }
  }, [query, fallbackSrc])

  return img
}
