import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import TiltPanel from './TiltPanel'
import { useCursorParallax } from './useCursorParallax'

// jsdom reports a zero rect; give the element a real one so the math runs.
function stubRect(el, rect = { left: 0, top: 0, width: 200, height: 100 }) {
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
}

// testing-library's pointerMove doesn't carry clientX/clientY through jsdom's
// PointerEvent — a MouseEvent with the type renamed does (MouseEventInit).
function pointerMove(el, clientX, clientY) {
  fireEvent(el, new MouseEvent('pointermove', { bubbles: true, clientX, clientY }))
}

function stubReducedMotion(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => { delete window.matchMedia })

describe('TiltPanel', () => {
  it('tilts toward the cursor and resets on leave', () => {
    stubReducedMotion(false)
    const { container } = render(<TiltPanel max={10}>content</TiltPanel>)
    const el = container.firstChild
    stubRect(el)
    // Cursor at the far right, vertically centred → max rotateY, no rotateX.
    pointerMove(el, 200, 50)
    expect(el.style.getPropertyValue('--tilt-ry')).toBe('5.00deg')
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('0.00deg')
    expect(el.style.getPropertyValue('--sheen-x')).toBe('100.0%')

    fireEvent.pointerLeave(el)
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('0deg')
    expect(el.style.getPropertyValue('--tilt-ry')).toBe('0deg')
  })

  it('inverts rotateX for the top half of the panel', () => {
    stubReducedMotion(false)
    const { container } = render(<TiltPanel max={8}>content</TiltPanel>)
    const el = container.firstChild
    stubRect(el)
    pointerMove(el, 100, 0) // top centre
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('4.00deg')
    pointerMove(el, 100, 100) // bottom centre
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('-4.00deg')
  })

  it('stays static under prefers-reduced-motion', () => {
    stubReducedMotion(true)
    const { container } = render(<TiltPanel max={10}>content</TiltPanel>)
    const el = container.firstChild
    stubRect(el)
    pointerMove(el, 200, 50)
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('')
    expect(el.style.getPropertyValue('--tilt-ry')).toBe('')
  })

  it('ignores unmeasurable (zero-size) elements instead of writing NaN', () => {
    stubReducedMotion(false)
    const { container } = render(<TiltPanel max={10}>content</TiltPanel>)
    const el = container.firstChild // jsdom default rect is all zeros
    pointerMove(el, 50, 50)
    expect(el.style.getPropertyValue('--tilt-rx')).toBe('')
  })

  it('applies the glare class only when asked', () => {
    const { container: a } = render(<TiltPanel glare>x</TiltPanel>)
    const { container: b } = render(<TiltPanel>x</TiltPanel>)
    expect(a.firstChild.className).toContain('tilt-glare')
    expect(b.firstChild.className).not.toContain('tilt-glare')
  })
})

function Scene() {
  const ref = useRef(null)
  useCursorParallax(ref)
  return <div data-testid="scene" ref={ref} />
}

describe('useCursorParallax', () => {
  it('writes --px/--py in −1…1 on pointer move and resets on leave', async () => {
    stubReducedMotion(false)
    const { getByTestId } = render(<Scene />)
    const el = getByTestId('scene')
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 })
    pointerMove(el, 100, 0)
    await waitFor(() => {
      expect(el.style.getPropertyValue('--px')).toBe('1.000')
      expect(el.style.getPropertyValue('--py')).toBe('-1.000')
    })
    fireEvent.pointerLeave(el)
    expect(el.style.getPropertyValue('--px')).toBe('0')
    expect(el.style.getPropertyValue('--py')).toBe('0')
  })

  it('attaches no listener under prefers-reduced-motion', () => {
    stubReducedMotion(true)
    const { getByTestId } = render(<Scene />)
    const el = getByTestId('scene')
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 })
    pointerMove(el, 100, 0)
    expect(el.style.getPropertyValue('--px')).toBe('')
  })
})
