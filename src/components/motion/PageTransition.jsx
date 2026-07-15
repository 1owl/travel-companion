import { useLocation } from 'react-router-dom'
import { useReducedMotion } from './useReducedMotion'

const cx = (...c) => c.filter(Boolean).join(' ')

// Wraps route content so it fades + lifts in on every route change.
//
//   <PageTransition><Routes>…</Routes></PageTransition>
//
// Re-keying on pathname is what replays the animation: the key changes, React
// swaps the wrapper, and the CSS enter animation runs again. That works
// identically under HashRouter, because useLocation reports the path parsed out
// of the hash. Under reduced motion the key is frozen, so nothing remounts.
//
// Note this is an ENTER animation, not a true two-way crossfade: holding the
// outgoing tree mounted would double the DOM and thrash layout on every
// navigation, which is exactly the "busy" this system is avoiding.
export default function PageTransition({ as: Tag = 'div', className = '', children, ...rest }) {
  const { pathname } = useLocation()
  const reduced = useReducedMotion()
  return (
    <Tag key={reduced ? 'static' : pathname} className={cx('m-page', className)} {...rest}>
      {children}
    </Tag>
  )
}
