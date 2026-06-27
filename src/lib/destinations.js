// Curated wanderlist the globe spins through. Each is a real, plannable place so
// the AI designer + Google Places return great results. `days` seeds a suggested
// trip length; `blurb` is the one-line hook shown when the globe lands.
export const DESTINATIONS = [
  { name: 'Kyoto', country: 'Japan', region: 'East Asia', days: 6, lat: 35.0, lng: 135.8, blurb: 'Temples, tea houses and lantern-lit lanes.' },
  { name: 'Santorini', country: 'Greece', region: 'Mediterranean', days: 5, lat: 36.4, lng: 25.4, blurb: 'White-washed cliffs over a caldera sea.' },
  { name: 'Lisbon', country: 'Portugal', region: 'Iberia', days: 5, lat: 38.7, lng: -9.1, blurb: 'Tiled hills, trams and pastéis de nata.' },
  { name: 'Marrakesh', country: 'Morocco', region: 'North Africa', days: 4, lat: 31.6, lng: -8.0, blurb: 'Souks, riads and Saharan sunsets.' },
  { name: 'Queenstown', country: 'New Zealand', region: 'Oceania', days: 7, lat: -45.0, lng: 168.7, blurb: 'Alpine lakes and pure adrenaline.' },
  { name: 'Reykjavík', country: 'Iceland', region: 'Nordics', days: 6, lat: 64.1, lng: -21.9, blurb: 'Waterfalls, lava fields and the aurora.' },
  { name: 'Hanoi', country: 'Vietnam', region: 'Southeast Asia', days: 6, lat: 21.0, lng: 105.8, blurb: 'Old-quarter buzz and street-food legends.' },
  { name: 'Cape Town', country: 'South Africa', region: 'Africa', days: 7, lat: -33.9, lng: 18.4, blurb: 'Table Mountain, vineyards and two oceans.' },
  { name: 'Amalfi Coast', country: 'Italy', region: 'Mediterranean', days: 6, lat: 40.6, lng: 14.6, blurb: 'Cliffside villages and lemon groves.' },
  { name: 'Banff', country: 'Canada', region: 'North America', days: 6, lat: 51.2, lng: -115.6, blurb: 'Turquoise lakes ringed by the Rockies.' },
  { name: 'Petra', country: 'Jordan', region: 'Middle East', days: 4, lat: 30.3, lng: 35.4, blurb: 'A rose-red city carved into canyon walls.' },
  { name: 'Cusco', country: 'Peru', region: 'South America', days: 7, lat: -13.5, lng: -72.0, blurb: 'Andean gateway to Machu Picchu.' },
  { name: 'Bali', country: 'Indonesia', region: 'Southeast Asia', days: 8, lat: -8.4, lng: 115.2, blurb: 'Rice terraces, temples and surf.' },
  { name: 'Edinburgh', country: 'Scotland', region: 'British Isles', days: 4, lat: 55.95, lng: -3.19, blurb: 'Castles, closes and Highland air.' },
  { name: 'Istanbul', country: 'Türkiye', region: 'Eurasia', days: 5, lat: 41.0, lng: 29.0, blurb: 'Where two continents share a skyline.' },
  { name: 'Tromsø', country: 'Norway', region: 'Arctic', days: 5, lat: 69.6, lng: 19.0, blurb: 'Fjords, dog-sleds and northern lights.' },
  { name: 'Mexico City', country: 'Mexico', region: 'North America', days: 5, lat: 19.4, lng: -99.1, blurb: 'Murals, mezcal and ancient pyramids.' },
  { name: 'Hoi An', country: 'Vietnam', region: 'Southeast Asia', days: 4, lat: 15.9, lng: 108.3, blurb: 'Lantern bridges and tailor-made everything.' },
  { name: 'Dubrovnik', country: 'Croatia', region: 'Adriatic', days: 4, lat: 42.6, lng: 18.1, blurb: 'Marble streets inside medieval walls.' },
  { name: 'Seville', country: 'Spain', region: 'Iberia', days: 4, lat: 37.4, lng: -6.0, blurb: 'Flamenco nights and orange-blossom plazas.' },
  { name: 'Chiang Mai', country: 'Thailand', region: 'Southeast Asia', days: 5, lat: 18.8, lng: 99.0, blurb: 'Mountain temples and night bazaars.' },
  { name: 'Marlborough Sounds', country: 'New Zealand', region: 'Oceania', days: 5, lat: -41.2, lng: 174.0, blurb: 'Remote sounds and coastal walks.' },
  { name: 'Florence', country: 'Italy', region: 'Mediterranean', days: 5, lat: 43.8, lng: 11.25, blurb: 'Renaissance art around every corner.' },
  { name: 'Kraków', country: 'Poland', region: 'Central Europe', days: 4, lat: 50.06, lng: 19.94, blurb: 'A storybook old town with deep history.' },
]

// Pick a random destination that isn't the one currently shown.
export function pickDestination(exclude) {
  const pool = DESTINATIONS.filter(d => d.name !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}
