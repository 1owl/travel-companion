import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

// Shared reveal trigger for RevealOnScroll + StaggerList: flips to true the first
// time the element enters the viewport, then stops observing (a reveal is a
// one-way door — re-animating on scroll-back reads as busy, not composed).
//
// Degrades to immediately-shown when reduced motion is on, or when there is no
// IntersectionObserver (jsdom/old browsers) — content must never be stranded.
export function useInView(ref, { threshold = 0.12, rootMargin = '0px 0px -8% 0px' } = {}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    if (reduced || typeof IntersectionObserver !== 'function') { setShown(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      io.unobserve(el)
      io.disconnect()
      setShown(true)
    }, { threshold, rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, reduced, shown, threshold, rootMargin])

  return shown
}

export default useInView
