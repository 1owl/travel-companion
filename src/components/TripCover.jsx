import { useNavigate } from 'react-router-dom'
import { useDynamicImage } from '../hooks/useDynamicImage'
import { coverFor } from '../lib/photos'
import { coverQuery } from '../lib/images'

// Clickable cover for a trip card. Pulls a place-aware photo for the destination
// (fresh each visit), falling back to a local placeholder. Uses navigate() rather
// than a <Link> so the photo-credit anchor isn't nested inside another anchor.
export default function TripCover({ trip }) {
  const nav = useNavigate()
  const img = useDynamicImage(coverQuery(trip), coverFor(trip))
  const open = () => nav(`/app/trip/${trip.id}`)

  return (
    <div
      className="trip-cover"
      style={{ backgroundImage: `url(${img.src})` }}
      role="link"
      tabIndex={0}
      aria-label={trip.name}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
    >
      {img.author_url &&
        <a className="photo-credit" href={img.author_url} target="_blank" rel="noreferrer noopener"
          onClick={e => e.stopPropagation()}>Photo: {img.author}</a>}
    </div>
  )
}
