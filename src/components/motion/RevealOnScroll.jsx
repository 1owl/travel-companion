import { useRef } from 'react'
import { useInView } from './useInView'

const cx = (...c) => c.filter(Boolean).join(' ')

// Fades + lifts its children in when they scroll into view, once.
//
//   <RevealOnScroll as="section" delay={120}>…</RevealOnScroll>
//
// Props:
//   as       — element/component to render (default 'div')
//   delay    — ms to hold before revealing (for hand-tuned sequences)
//   distance — travel distance; number = px, or any CSS length.
//              Omit to inherit the --motion-lift token (preferred).
// Duration + easing always come from the tokens; there is no prop for them by
// design — that is what keeps the language consistent.
export default function RevealOnScroll({
  as: Tag = 'div', delay = 0, distance, className = '', style, children, ...rest
}) {
  const ref = useRef(null)
  const shown = useInView(ref)

  const vars = {}
  if (delay) vars['--m-delay'] = `${delay}ms`
  if (distance != null) vars['--m-distance'] = typeof distance === 'number' ? `${distance}px` : distance

  return (
    <Tag ref={ref} className={cx('m-reveal', shown && 'is-in', className)} style={{ ...vars, ...style }} {...rest}>
      {children}
    </Tag>
  )
}
