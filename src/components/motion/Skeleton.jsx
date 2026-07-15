const cx = (...c) => c.filter(Boolean).join(' ')

// Content-shaped loading placeholder. Composable enough to build card/row
// skeletons from: give it a size, or ask for N stacked lines.
//
//   <Skeleton w="65%" h={18} />                 // one bar
//   <Skeleton lines={3} />                      // a paragraph
//   <Skeleton h={130} radius="var(--r-md)" />   // a media block
//
// The shimmer itself is the shared `.skeleton` class in styles.css — reused, not
// re-declared, so there is exactly one shimmer in the system. It goes static
// under prefers-reduced-motion via the global rule.
//
// Props:
//   w, h   — width / height. Numbers are px; strings pass through as CSS.
//   radius — border radius (default the --r-sm token).
//   lines  — >1 renders that many stacked bars, last one short like real text.
export default function Skeleton({
  w = '100%', h = 14, radius = 'var(--r-sm)', lines = 1, className = '', style, ...rest
}) {
  if (lines > 1) {
    return (
      <span className={cx('m-skel-lines', className)} style={style} aria-hidden="true" {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="skeleton"
            style={{ width: i === lines - 1 ? '70%' : w, height: h, borderRadius: radius }}
          />
        ))}
      </span>
    )
  }
  return (
    <span
      className={cx('skeleton', className)}
      style={{ width: w, height: h, borderRadius: radius, ...style }}
      aria-hidden="true"
      {...rest}
    />
  )
}
