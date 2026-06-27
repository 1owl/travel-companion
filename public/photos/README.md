# Travel photos

These images are used on the landing page (hero gallery + final CTA) and in the app
(trips list covers, trip-detail banner). They're referenced by name in
`src/lib/photos.js`.

The files here now are **on-brand placeholders**. Replace each with your real photo,
keeping the same filename (any common web size is fine — ~1600px wide, JPG/WebP):

| File | Used for | Suggested subject |
|------|----------|-------------------|
| `villefranche.jpg`   | hero gallery (large), CTA, France trip covers | Villefranche-sur-Mer harbour |
| `saint-tropez.jpg`   | hero gallery, France trip covers | Saint-Tropez waterfront |
| `maldives-sunset.jpg`| hero gallery, tropical trip covers | overwater bungalows at sunset |
| `maldives-pool.jpg`  | hero gallery, tropical trip covers | beach pool / palms |

To add or rename photos, edit `PHOTOS` in `src/lib/photos.js`. `coverFor(trip)` picks a
cover by matching the trip name (France/Riviera → the France shots; beach/island → the
tropical shots), falling back to a stable choice otherwise.
