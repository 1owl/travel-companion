import { Children, cloneElement, isValidElement, useRef } from 'react'
import { useInView } from './useInView'

const cx = (...c) => c.filter(Boolean).join(' ')

// Reveals its children in sequence when the list scrolls into view — deal cards,
// planner picks, search results streaming in.
//
//   <StaggerList as="ul" className="place-grid">{picks.map(p => <li key={p.id}>…</li>)}</StaggerList>
//
// One observer for the whole list (not one per child), and the step is pure CSS:
// each child carries its index as --m-i and the delay is index × --motion-stagger.
//
// Children are cloned rather than wrapped, so the DOM stays flat and the parent's
// grid/flex layout is untouched — children must accept className + style.
//
// Props:
//   as      — element/component to render (default 'div')
//   stagger — ms between children. Omit to inherit the --motion-stagger token.
export default function StaggerList({
  as: Tag = 'div', stagger, className = '', style, children, ...rest
}) {
  const ref = useRef(null)
  const shown = useInView(ref)

  const items = Children.toArray(children).map((child, i) => (
    isValidElement(child)
      ? cloneElement(child, {
          className: cx(child.props.className, 'm-stagger-item'),
          style: { ...child.props.style, '--m-i': i },
        })
      : child // plain strings/numbers can't carry a delay; pass them through
  ))

  const vars = stagger != null ? { '--m-stagger': `${stagger}ms` } : {}

  return (
    <Tag ref={ref} className={cx('m-stagger', shown && 'is-in', className)} style={{ ...vars, ...style }} {...rest}>
      {items}
    </Tag>
  )
}
