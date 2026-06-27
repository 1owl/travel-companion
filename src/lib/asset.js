// Resolve a /public asset to the app's deployed base URL. With Vite base:'./'
// this yields a relative path, so assets load correctly at any deploy path —
// including a GitHub Pages project site served under /travel-companion/.
// Use for runtime asset strings (img src, globe texture); never hardcode "/foo".
export const asset = (p) => import.meta.env.BASE_URL + String(p).replace(/^\/+/, '')
