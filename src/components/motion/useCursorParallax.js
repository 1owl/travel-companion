import { useEffect } from 'react'
import { prefersReducedMotion } from './useReducedMotion'

// Cursor parallax for a container: tracks the pointer over the element and
// writes --px/--py (−1…1) CSS vars onto it. Children opt in with the
// .parallax-layer class and a --depth (px) — deeper layers travel further,
// which is what reads as 3D. Skipped entirely under prefers-reduced-motion.
export function useCursorParallax(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return undefined
    let raf = 0
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(3))
        el.style.setProperty('--py', y.toFixed(3))
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(raf)
      el.style.setProperty('--px', '0')
      el.style.setProperty('--py', '0')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

export default useCursorParallax
