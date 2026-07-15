import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, renderHook, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import RevealOnScroll from './RevealOnScroll'
import StaggerList from './StaggerList'
import PageTransition from './PageTransition'
import Skeleton from './Skeleton'
import { useReducedMotion, prefersReducedMotion } from './useReducedMotion'

// ── Test doubles ────────────────────────────────────────────────────────────
// jsdom implements neither IntersectionObserver nor matchMedia, so both are
// stubbed here (same spirit as the repo mocking ./supabase — never touch the
// real environment from a unit test).
let observers = []

class MockIO {
  constructor(cb, opts) {
    this.cb = cb
    this.opts = opts
    this.observed = new Set()
    this.disconnected = false
    observers.push(this)
  }
  observe(el) { this.observed.add(el) }
  unobserve(el) { this.observed.delete(el) }
  disconnect() { this.observed.clear(); this.disconnected = true }
  // Fire the callback as the browser would when the element scrolls into view.
  enter() {
    act(() => this.cb([...this.observed].map(target => ({ target, isIntersecting: true })), this))
  }
  // Scrolled past but not intersecting — must NOT reveal.
  miss() {
    act(() => this.cb([...this.observed].map(target => ({ target, isIntersecting: false })), this))
  }
}

let mqListeners
function stubMatchMedia(matches) {
  mqListeners = new Set()
  window.matchMedia = vi.fn(query => ({
    matches,
    media: query,
    addEventListener: (_evt, cb) => mqListeners.add(cb),
    removeEventListener: (_evt, cb) => mqListeners.delete(cb),
  }))
}
const flipReducedMotion = matches => act(() => mqListeners.forEach(cb => cb({ matches })))

beforeEach(() => {
  observers = []
  globalThis.IntersectionObserver = MockIO
  stubMatchMedia(false) // motion allowed unless a test says otherwise
})
afterEach(() => {
  delete globalThis.IntersectionObserver
  delete window.matchMedia
  vi.restoreAllMocks()
})

// ── useReducedMotion ────────────────────────────────────────────────────────
describe('useReducedMotion', () => {
  it('is false when the user has no preference', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('is true when the user prefers reduced motion', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('reacts to the OS setting changing mid-session', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    flipReducedMotion(true)
    expect(result.current).toBe(true)
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion())
    expect(mqListeners.size).toBe(1)
    unmount()
    expect(mqListeners.size).toBe(0)
  })

  it('does not throw when matchMedia is unavailable (jsdom/SSR)', () => {
    delete window.matchMedia
    expect(prefersReducedMotion()).toBe(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })
})

// ── RevealOnScroll ──────────────────────────────────────────────────────────
describe('RevealOnScroll', () => {
  it('starts hidden and reveals when the element intersects', () => {
    render(<RevealOnScroll>hello</RevealOnScroll>)
    const el = screen.getByText('hello')
    expect(el).toHaveClass('m-reveal')
    expect(el).not.toHaveClass('is-in')

    observers[0].enter()
    expect(el).toHaveClass('is-in')
  })

  it('stays hidden while the element is not intersecting', () => {
    render(<RevealOnScroll>hello</RevealOnScroll>)
    observers[0].miss()
    expect(screen.getByText('hello')).not.toHaveClass('is-in')
  })

  it('stops observing once revealed (a reveal is one-way)', () => {
    render(<RevealOnScroll>hello</RevealOnScroll>)
    const io = observers[0]
    expect(io.observed.size).toBe(1)
    io.enter()
    expect(io.observed.size).toBe(0)
    expect(io.disconnected).toBe(true)
  })

  it('reveals immediately and never observes under reduced motion', () => {
    stubMatchMedia(true)
    render(<RevealOnScroll>hello</RevealOnScroll>)
    expect(screen.getByText('hello')).toHaveClass('is-in')
    expect(observers).toHaveLength(0)
  })

  it('reveals immediately when IntersectionObserver is missing', () => {
    delete globalThis.IntersectionObserver
    render(<RevealOnScroll>hello</RevealOnScroll>)
    expect(screen.getByText('hello')).toHaveClass('is-in')
  })

  it('passes delay/distance through as custom properties and honours `as`', () => {
    render(<RevealOnScroll as="section" delay={120} distance={40}>hi</RevealOnScroll>)
    const el = screen.getByText('hi')
    expect(el.tagName).toBe('SECTION')
    expect(el.style.getPropertyValue('--m-delay')).toBe('120ms')
    expect(el.style.getPropertyValue('--m-distance')).toBe('40px')
  })

  it('omits the custom properties when not given, so the tokens win', () => {
    render(<RevealOnScroll>hi</RevealOnScroll>)
    const el = screen.getByText('hi')
    expect(el.style.getPropertyValue('--m-delay')).toBe('')
    expect(el.style.getPropertyValue('--m-distance')).toBe('')
  })
})

// ── StaggerList ─────────────────────────────────────────────────────────────
describe('StaggerList', () => {
  it('indexes children for the CSS step and reveals on intersect', () => {
    render(<StaggerList><i>a</i><i>b</i><i>c</i></StaggerList>)
    const a = screen.getByText('a')
    expect(a).toHaveClass('m-stagger-item')
    expect(a.style.getPropertyValue('--m-i')).toBe('0')
    expect(screen.getByText('c').style.getPropertyValue('--m-i')).toBe('2')

    expect(a.closest('.m-stagger')).not.toHaveClass('is-in')
    observers[0].enter()
    expect(a.closest('.m-stagger')).toHaveClass('is-in')
  })

  it('uses one observer for the whole list, not one per child', () => {
    render(<StaggerList><i>a</i><i>b</i><i>c</i></StaggerList>)
    expect(observers).toHaveLength(1)
  })

  it('clones children instead of wrapping them, preserving layout', () => {
    const { container } = render(<StaggerList as="ul" className="grid"><li>a</li></StaggerList>)
    const list = container.querySelector('ul')
    expect(list).toHaveClass('grid', 'm-stagger')
    expect(list.firstChild.tagName).toBe('LI') // direct child, no wrapper div
  })

  it('keeps the child’s own className and style', () => {
    render(<StaggerList><i className="card" style={{ color: 'red' }}>a</i></StaggerList>)
    const a = screen.getByText('a')
    expect(a).toHaveClass('card', 'm-stagger-item')
    expect(a.style.color).toBe('red')
  })

  it('only sets --m-stagger when overridden, so the token is the default', () => {
    const { container, rerender } = render(<StaggerList><i>a</i></StaggerList>)
    expect(container.firstChild.style.getPropertyValue('--m-stagger')).toBe('')
    rerender(<StaggerList stagger={140}><i>a</i></StaggerList>)
    expect(container.firstChild.style.getPropertyValue('--m-stagger')).toBe('140ms')
  })

  it('passes plain text children through untouched', () => {
    expect(() => render(<StaggerList>just text</StaggerList>)).not.toThrow()
    expect(screen.getByText('just text')).toBeInTheDocument()
  })
})

// ── PageTransition ──────────────────────────────────────────────────────────
describe('PageTransition', () => {
  // A real navigation is required: MemoryRouter's initialEntries only apply on
  // first mount, so re-rendering with a new path would never change useLocation.
  function GoTo({ to }) {
    const navigate = useNavigate()
    return <button onClick={() => navigate(to)}>go</button>
  }
  const mount = () => render(
    <MemoryRouter initialEntries={['/app']}>
      <PageTransition><p>content</p></PageTransition>
      <GoTo to="/app/trip/1" />
    </MemoryRouter>,
  )
  const navigate = () => fireEvent.click(screen.getByText('go'))

  it('renders children inside the animated wrapper', () => {
    const { container } = mount()
    expect(container.querySelector('.m-page')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('remounts on route change so the enter animation replays', () => {
    const { container } = mount()
    const first = container.querySelector('.m-page')
    navigate()
    // A different key means a different DOM node — that is what replays the CSS.
    expect(container.querySelector('.m-page')).not.toBe(first)
  })

  it('does not remount under reduced motion', () => {
    stubMatchMedia(true)
    const { container } = mount()
    const first = container.querySelector('.m-page')
    navigate()
    expect(container.querySelector('.m-page')).toBe(first)
  })
})

// ── Skeleton ────────────────────────────────────────────────────────────────
describe('Skeleton', () => {
  it('renders one shimmer bar with the given size', () => {
    const { container } = render(<Skeleton w="65%" h={18} />)
    const el = container.firstChild
    expect(el).toHaveClass('skeleton') // reuses the shared shimmer class
    expect(el.style.width).toBe('65%')
    expect(el.style.height).toBe('18px')
  })

  it('defaults the radius to the token', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild.style.borderRadius).toBe('var(--r-sm)')
  })

  it('renders N bars for `lines`, with a short last line', () => {
    const { container } = render(<Skeleton lines={3} w="100%" />)
    const bars = container.querySelectorAll('.skeleton')
    expect(bars).toHaveLength(3)
    expect(bars[0].style.width).toBe('100%')
    expect(bars[2].style.width).toBe('70%')
  })

  it('is hidden from assistive tech', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})
