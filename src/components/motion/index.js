// The motion language. Import primitives from here, not from the files directly:
//
//   import { RevealOnScroll, StaggerList, Skeleton } from '../components/motion'
//
// Rules of the layer:
//  - Duration/easing/stagger live ONLY in the --motion-* / --ease-* tokens in
//    styles.css. Primitives never hardcode timing, and expose no duration prop.
//  - Everything collapses to no-motion under prefers-reduced-motion, handled
//    centrally (CSS global rule + useReducedMotion for JS-driven cases).
//  - No animation library: these are CSS transitions/keyframes driven by an
//    IntersectionObserver. Nothing here needs a physics engine.
export { default as RevealOnScroll } from './RevealOnScroll'
export { default as StaggerList } from './StaggerList'
export { default as PageTransition } from './PageTransition'
export { default as Skeleton } from './Skeleton'
export { useReducedMotion, prefersReducedMotion } from './useReducedMotion'
export { useInView } from './useInView'
