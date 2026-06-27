// Lightweight loading placeholders (see DESIGN.txt — quiet, token-driven).
// The shimmer is disabled under prefers-reduced-motion via the global rule.

export function Skeleton({ width = '100%', height = 14, radius = 'var(--r-sm)', style }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />
}

export function TripCardsSkeleton({ n = 4 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading trips">
      {Array.from({ length: n }).map((_, i) => (
        <div className="card skel-card" key={i}>
          <Skeleton height={18} width="65%" />
          <Skeleton height={12} width="45%" />
          <Skeleton height={30} radius="var(--r-md)" />
        </div>
      ))}
    </div>
  )
}

export function StatsSkeleton({ n = 3 }) {
  return (
    <div className="cards" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div className="stat skel-card" key={i}>
          <Skeleton height={10} width="50%" />
          <Skeleton height={22} width="70%" />
        </div>
      ))}
    </div>
  )
}

export function RowsSkeleton({ n = 5 }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div className="skel-row" key={i}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={14} width="18%" />
          <Skeleton height={14} width="12%" />
        </div>
      ))}
    </div>
  )
}

export function PlaceCardsSkeleton({ n = 3 }) {
  return (
    <div className="place-grid" aria-busy="true" aria-label="Searching places">
      {Array.from({ length: n }).map((_, i) => (
        <div className="place-card card" key={i}>
          <Skeleton height={130} radius="0" />
          <div className="place-body">
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="40%" />
            <Skeleton height={12} width="90%" />
          </div>
        </div>
      ))}
    </div>
  )
}
