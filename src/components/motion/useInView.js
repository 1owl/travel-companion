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

    // Failsafe: reveal anything already in the viewport at mount without waiting
    // for the observer's first tick. Real browsers do fire IO on-observe for
    // in-view elements, but this guarantees above-the-fold content is never left
    // stranded at opacity:0 if a tick is delayed/dropped — a blank hero is a far
    // worse failure than a skipped animation. Below-the-fold elements have a
    // zero/off-screen rect here, so they still wait for the real scroll.
    const raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const onScreen = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw && (r.width > 0 || r.height > 0)
      if (onScreen) { io.disconnect(); setShown(true) }
    })

    return () => { cancelAnimationFrame(raf); io.disconnect() }
  }, [ref, reduced, shown, threshold, rootMargin])

  return shown
}

export default useInView
