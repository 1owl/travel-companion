import { PageTransition, RevealOnScroll, StaggerList, Skeleton, useReducedMotion } from '../components/motion'

// Dev-only demo of the motion language (route: /app/_motion-lab, gated in App.jsx).
// Deliberately dumb content — this exists to eyeball timing and consistency, and
// to serve as the usage reference for the primitives. Not linked from any nav.
const DUMMY = ['Paris', 'Annecy', 'Provence', 'Nice', 'Lyon', 'Bordeaux']

export default function MotionLab() {
  const reduced = useReducedMotion()
  return (
    <PageTransition className="page" style={{ padding: 'var(--s-xl)', maxWidth: 900, margin: '0 auto' }}>
      <h1>Motion lab</h1>
      <p className="muted">
        Dev-only. Scroll to trigger reveals. Reduced motion is currently{' '}
        <b>{reduced ? 'ON — everything should be instant' : 'off'}</b>.
      </p>

      <RevealOnScroll as="section" style={{ marginTop: 'var(--s-2xl)' }}>
        <h2>RevealOnScroll</h2>
        <p className="muted">Fades + lifts once when it enters the viewport.</p>
      </RevealOnScroll>

      <RevealOnScroll as="section" delay={150} style={{ marginTop: 'var(--s-2xl)' }}>
        <h2>…with a delay</h2>
        <p className="muted">Same primitive, <code>delay={'{150}'}</code> — for hand-tuned sequences.</p>
      </RevealOnScroll>

      <section style={{ marginTop: 'var(--s-2xl)' }}>
        <h2>StaggerList</h2>
        <p className="muted">One observer; children step in by <code>--motion-stagger</code>.</p>
        <StaggerList className="grid">
          {DUMMY.map(name => (
            <div className="card" key={name}>
              <h3>{name}</h3>
              <p className="muted">A dummy card.</p>
            </div>
          ))}
        </StaggerList>
      </section>

      <section style={{ marginTop: 'var(--s-2xl)' }}>
        <h2>StaggerList — slower step</h2>
        <StaggerList className="grid" stagger={140}>
          {DUMMY.slice(0, 3).map(name => (
            <div className="card" key={name}><h3>{name}</h3></div>
          ))}
        </StaggerList>
      </section>

      <section style={{ marginTop: 'var(--s-2xl)' }}>
        <h2>Skeleton</h2>
        <p className="muted">Composed into a card shape; shimmer goes static under reduced motion.</p>
        <div className="grid">
          <div className="card">
            <Skeleton h={130} radius="var(--r-md)" />
            <div style={{ marginTop: 'var(--s-md)' }}><Skeleton w="65%" h={18} /></div>
            <div style={{ marginTop: 'var(--s-sm)' }}><Skeleton lines={3} /></div>
          </div>
          <div className="card">
            <Skeleton w="40%" h={10} />
            <div style={{ marginTop: 'var(--s-sm)' }}><Skeleton w="70%" h={22} /></div>
          </div>
        </div>
      </section>

      <p className="muted" style={{ marginTop: 'var(--s-2xl)' }}>
        PageTransition wraps this page — navigate away and back to replay it.
      </p>
    </PageTransition>
  )
}
