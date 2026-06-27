// On-brand SVG graphics. Colours come only from design tokens (see DESIGN.txt),
// so they stay on-system and adapt to Daylight/Red-eye automatically.

// Signature motif: a calm horizon with a dotted flight-route arc from a teal
// origin to an amber destination. Used on the auth screen and trips header.
export function RouteMap({ className = '' }) {
  return (
    <svg className={'art-route ' + className} viewBox="0 0 480 150" width="480" height="150" role="img"
      aria-label="A dotted flight route arcing from origin to destination" preserveAspectRatio="xMidYMid meet">
      {/* soft sun + clouds */}
      <circle cx="412" cy="44" r="26" fill="var(--accent-soft)" />
      <ellipse cx="96" cy="40" rx="34" ry="12" fill="var(--primary-soft)" />
      <ellipse cx="128" cy="50" rx="22" ry="9" fill="var(--primary-soft)" />
      {/* horizon */}
      <line x1="24" y1="126" x2="456" y2="126" stroke="var(--hairline)" strokeWidth="1.5" />
      <path d="M120 126 q24 -26 48 0" fill="none" stroke="var(--hairline)" strokeWidth="1.5" />
      <path d="M150 126 q34 -40 68 0" fill="none" stroke="var(--hairline)" strokeWidth="1.5" />
      {/* route arc (dotted) */}
      <path d="M52 112 Q240 6 432 92" fill="none" stroke="var(--primary)" strokeWidth="2.5"
        strokeLinecap="round" strokeDasharray="0.5 9" />
      {/* origin node */}
      <circle cx="52" cy="112" r="6" fill="var(--primary)" />
      <circle cx="52" cy="112" r="11" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.4" />
      {/* plane near apex, tilted along the arc */}
      <g transform="translate(238 34) rotate(12)" fill="var(--primary)">
        <path d="M0 -7 L20 0 L0 7 L5 0 Z" />
        <path d="M2 -1 L-12 -8 L-7 -1 Z" opacity="0.7" />
        <path d="M2 1 L-12 8 L-7 1 Z" opacity="0.7" />
      </g>
      {/* destination pin (amber = the place you're headed) */}
      <g transform="translate(432 92)">
        <path d="M0 6 C-10 -6 -8 -20 0 -20 C8 -20 10 -6 0 6 Z" fill="var(--accent)" />
        <circle cx="0" cy="-13" r="4" fill="var(--surface)" />
      </g>
    </svg>
  )
}

// Empty-state illustrations. The wrapper sets colour to --muted; teal/amber are
// used sparingly as accents.
export function EmptyState({ kind = 'trips', children }) {
  return (
    <div className="empty">
      <div className="empty-art">{ART[kind] || ART.trips}</div>
      {children && <p className="muted">{children}</p>}
    </div>
  )
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

const ART = {
  // Suitcase with a destination pin
  trips: (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
      <rect x="26" y="46" width="68" height="52" rx="8" {...stroke} />
      <path d="M46 46 V38 a6 6 0 0 1 6 -6 h16 a6 6 0 0 1 6 6 v8" {...stroke} />
      <line x1="44" y1="46" x2="44" y2="98" {...stroke} stroke="var(--hairline)" />
      <line x1="76" y1="46" x2="76" y2="98" {...stroke} stroke="var(--hairline)" />
      <g transform="translate(60 30)">
        <path d="M0 8 C-9 -4 -7 -18 0 -18 C7 -18 9 -4 0 8 Z" fill="var(--accent)" stroke="none" />
        <circle cx="0" cy="-11" r="3.5" fill="var(--surface)" stroke="none" />
      </g>
    </svg>
  ),
  // Ticket / confirmation with a dashed tear line
  bookings: (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
      <path d="M24 40 h72 a6 6 0 0 1 6 6 v10 a6 6 0 0 0 0 12 v10 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-10 a6 6 0 0 0 0 -12 v-10 a6 6 0 0 1 6 -6 Z" {...stroke} />
      <line x1="60" y1="44" x2="60" y2="80" stroke="var(--hairline)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
      <line x1="30" y1="56" x2="50" y2="56" {...stroke} />
      <line x1="30" y1="66" x2="46" y2="66" {...stroke} stroke="var(--muted)" />
      <circle cx="80" cy="62" r="6" fill="none" stroke="var(--primary)" strokeWidth="2" />
    </svg>
  ),
  // Calendar with a route line across the days
  itinerary: (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
      <rect x="22" y="32" width="76" height="62" rx="8" {...stroke} />
      <line x1="22" y1="48" x2="98" y2="48" {...stroke} />
      <line x1="40" y1="28" x2="40" y2="38" {...stroke} />
      <line x1="80" y1="28" x2="80" y2="38" {...stroke} />
      <path d="M34 78 Q52 58 60 70 T90 60" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.5 7" />
      <circle cx="34" cy="78" r="3.5" fill="var(--primary)" stroke="none" />
      <g transform="translate(90 60)">
        <path d="M0 5 C-7 -3 -6 -14 0 -14 C6 -14 7 -3 0 5 Z" fill="var(--accent)" stroke="none" />
        <circle cx="0" cy="-8" r="2.6" fill="var(--surface)" stroke="none" />
      </g>
    </svg>
  ),
}
