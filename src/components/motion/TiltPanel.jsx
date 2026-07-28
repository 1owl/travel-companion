import { useRef, useCallback } from 'react'
import { prefersReducedMotion } from './useReducedMotion'

// 3D tilt panel: the surface rotates toward the cursor (small angles — presence,
// not gimmick) with a moving light sheen. All values live in CSS custom props so
// the feel stays in styles.css; the component only reports cursor position.
// Collapses to a static panel under prefers-reduced-motion (no listeners, no tilt).
export default function TiltPanel({ children, className = '', max = 8, glare = false, style }) {
  const ref = useRef(null)

  const onMove = useCallback((e) => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return // jsdom/hidden — nothing to measure
    const x = (e.clientX - r.left) / r.width - 0.5   // −0.5…0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tilt-rx', `${(-y * max).toFixed(2)}deg`)
    el.style.setProperty('--tilt-ry', `${(x * max).toFixed(2)}deg`)
    el.style.setProperty('--sheen-x', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--sheen-y', `${((y + 0.5) * 100).toFixed(1)}%`)
  }, [max])

  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--tilt-rx', '0deg')
    el.style.setProperty('--tilt-ry', '0deg')
  }, [])

  return (
    <div
      ref={ref}
      className={['tilt', glare && 'tilt-glare', className].filter(Boolean).join(' ')}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  )
}
