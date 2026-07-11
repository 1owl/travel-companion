import { describe, it, expect } from 'vitest'
import { emailToText, htmlToText } from './emailText'

describe('htmlToText — flatten but keep booking URLs', () => {
  it('turns an anchor into "label (url)"', () => {
    const out = htmlToText('<p>Please <a href="https://acme.com/manage/AB12">manage your booking</a> here.</p>')
    expect(out).toContain('manage your booking (https://acme.com/manage/AB12)')
  })
  it('strips scripts/styles and decodes entities', () => {
    const out = htmlToText('<style>.x{}</style><div>Total&nbsp;A$475 &amp; taxes</div><script>x()</script>')
    expect(out).toContain('Total A$475 & taxes')
    expect(out).not.toContain('.x{}')
    expect(out).not.toContain('x()')
  })
})

describe('emailToText — decode real email encodings', () => {
  it('decodes a quoted-printable MIME body', () => {
    const eml = [
      'From: hotel@acme.com', 'Subject: Confirmation', 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: quoted-printable',
      '', 'Total: =E2=82=AC120 at Hotel Nice. Ref=3D ABC123',
    ].join('\n')
    const out = emailToText(eml)
    expect(out).toContain('€120')
    expect(out).toContain('Ref= ABC123')
  })

  it('picks and base64-decodes the HTML part of a multipart email', () => {
    const html = '<html><body><a href="https://acme.com/b/9">View booking</a> - A$300</body></html>'
    const b64 = btoa(html)
    const eml = [
      'From: a@b.com', 'Content-Type: multipart/alternative; boundary="BND"', '',
      '--BND', 'Content-Type: text/plain', '', 'plain fallback',
      '--BND', 'Content-Type: text/html', 'Content-Transfer-Encoding: base64', '', b64,
      '--BND--',
    ].join('\n')
    const out = emailToText(eml)
    expect(out).toContain('View booking (https://acme.com/b/9)')
    expect(out).toContain('A$300')
  })

  it('passes plain text through unchanged', () => {
    expect(emailToText('Booking at Hotel Paris, total 90 EUR')).toBe('Booking at Hotel Paris, total 90 EUR')
  })
})
