import { useEffect, useState } from 'react'

// The one place the reduced-motion preference is read. CSS handles the visual
// collapse (see the prefers-reduced-motion block in styles.css); this is for the
// JS-driven cases — skipping observers, freezing keys, short-circuiting timers.
const QUERY = '(prefers-reduced-motion: reduce)'

// Imperative read, for call sites that aren't components (and for initial state).
// matchMedia is absent in jsdom/SSR, so guard rather than assume.
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches
}

// Reactive read: re-renders if the user flips the OS setting mid-session.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(QUERY)
    const onChange = e => setReduced(e.matches)
    setReduced(mq.matches) // resync in case it changed before mount
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange) // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else if (mq.removeListener) mq.removeListener(onChange)
    }
  }, [])
  return reduced
}

export default useReducedMotion
