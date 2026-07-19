# Agent runtime (CopilotKit)

Small Node service that connects the in-app agent to Claude. It holds the
`ANTHROPIC_API_KEY` (never shipped to the browser) and proxies CopilotKit's
protocol to Anthropic. The app's tools are registered on the **frontend**
(`src/agent/runtime/AgentDock.jsx`), so this service is just runtime + adapter.

## Why a separate Node service
CopilotKit's runtime is Node; the app's other backend is Supabase **Deno** Edge
Functions. Rather than fight that, this runs standalone (on the VPS) with its own
`package.json`, so its server deps never touch the frontend bundle.

## Run locally
```bash
cd server/agent-runtime
npm install
ANTHROPIC_API_KEY=sk-ant-… ALLOWED_ORIGIN=http://localhost:5173 npm start
# → http://localhost:4141/api/copilotkit  (health: /health)
```
Then in the app: `VITE_FEATURE_AGENT=true VITE_COPILOT_RUNTIME_URL=http://localhost:4141/api/copilotkit npm run dev`.

## Deploy on the VPS (behind Traefik/nginx with TLS)
1. Copy `server/agent-runtime/` to the VPS; `npm install --omit=dev`.
2. Create `.env` from `.env.example` with the real `ANTHROPIC_API_KEY` and
   `ALLOWED_ORIGIN=https://1owl.github.io`.
3. Run under a process manager (pm2/systemd): `node index.js`.
4. Expose it over HTTPS at a stable URL (e.g. `https://<vps>/agent/api/copilotkit`)
   via your existing Traefik/nginx. GitHub Pages is HTTPS, so the runtime MUST be
   HTTPS too (no mixed content).
5. Rebuild the app with `VITE_FEATURE_AGENT=true` and
   `VITE_COPILOT_RUNTIME_URL=https://<vps>/agent/api/copilotkit`.

## Verified so far
Boots, `/health` 200, CORS preflight 204, endpoint mounted (POST → CopilotKit
protocol, not 404). The live model loop + the "four days in Lyon" acceptance run
once the real key is set and the app points here.

## Notes
- Anonymous telemetry is disabled by default.
- `create_booking` is TEST-mode only (the Edge Function refuses a live Duffel key).
- Health endpoint makes no model call — safe for uptime probes.
