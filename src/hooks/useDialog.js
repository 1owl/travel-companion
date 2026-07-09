import { useEffect, useRef } from 'react'

// Accessibility plumbing shared by the Quick-Add modal and the Booking drawer:
// on open, move focus into the dialog; trap Tab so it can't escape to the page
// behind the overlay; close on Escape; and restore focus to the trigger on close.
// Attach the returned ref to the dialog element (give it tabIndex={-1} and
// aria-modal="true") and pass your onClose handler.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([hidden])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialog(onClose) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    const previouslyFocused = document.activeElement

    const focusables = () => (node ? Array.from(node.querySelectorAll(FOCUSABLE)) : [])

    // Move focus into the dialog (first focusable, else the container itself).
    const first = focusables()[0]
    if (first) first.focus()
    else if (node) node.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [])

  return ref
}
