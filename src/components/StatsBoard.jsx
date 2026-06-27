import { useEffect, useRef, useState } from 'react'

// An airport split-flap "departure board": when it scrolls into view, each tile
// flickers through glyphs and settles on its value — the Solari flip-board effect.
const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const DIGITS = '0123456789'
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function randGlyph(target) {
  if (/[0-9]/.test(target)) return DIGITS[Math.floor(Math.random() * DIGITS.length)]
  if (/[A-Za-z]/.test(target)) return ALPHA[Math.floor(Math.random() * ALPHA.length)]
  return target // $ , . space — no flicker
}

function Tile({ target, play, index }) {
  const blank = target === ' '
  const [ch, setCh] = useState('')
  useEffect(() => {
    if (!play || blank) return
    if (reduceMotion()) { setCh(target); return }
    let steps = 0
    const total = 12 + index * 3 + Math.floor(Math.random() * 6) // later tiles settle last
    let timer
    const tick = () => {
      steps += 1
      if (steps >= total) { setCh(target); return }
      setCh(randGlyph(target))
      timer = setTimeout(tick, 55)
    }
    timer = setTimeout(tick, index * 80)
    return () => clearTimeout(timer)
  }, [play, target, index, blank])
  if (blank) return <span className="flap-tile flap-gap" aria-hidden="true" />
  return <span className={'flap-tile' + (ch === target ? ' set' : '')} aria-hidden="true">{ch || ' '}</span>
}

function Flap({ value, play }) {
  return (
    <span className="flap" role="img" aria-label={value}>
      {String(value).split('').map((c, i) => <Tile key={i} target={c} play={play} index={i} />)}
    </span>
  )
}

const STATS = [
  { v: 'A$8,043', label: 'planned, to the cent' },
  { v: '19', label: 'bookings tracked' },
  { v: '5', label: 'destinations, one timeline' },
  { v: '6', label: 'currencies, live' },
]

export default function StatsBoard() {
  const ref = useRef(null)
  const [play, setPlay] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting) { setPlay(true); io.disconnect() }
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section className="lp-board" ref={ref}>
      <div className="lp-board-inner">
        {STATS.map((s, i) => (
          <div className="lp-board-stat" key={i}>
            <Flap value={s.v} play={play} />
            <span className="lp-board-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
