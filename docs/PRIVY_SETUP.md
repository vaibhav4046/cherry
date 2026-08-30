# Privy setup (optional)

Cherry is local-first. Guest mode is the default, needs zero configuration, and every feature works
without an account. Privy sign-in is opt-in: it only activates when `VITE_PRIVY_APP_ID` is present at
build time. Without it, the Privy SDK is not even downloaded (it lives in a lazy chunk that is never
requested in guest mode).

## 1. Create the app

1. Go to [dashboard.privy.io](https://dashboard.privy.io) and create a new app.
2. Under **Login methods**, enable **Email**.
3. Under **Settings → Domains / Allowed origins**, add every origin Cherry runs on:
   - `https://cherry-wine.vercel.app` (production)
   - `http://localhost:5173` (Vite dev default; this repo's dev server uses `http://127.0.0.1:5273` — add that too if you use `npm run dev`)
   - `http://127.0.0.1:4173` (local `npm run preview`)
4. Copy the **App ID** (and optionally the **Client ID**) from the app settings.

## 2. Environment variables

| Variable | Required | Where | Notes |
| --- | --- | --- | --- |
| `VITE_PRIVY_APP_ID` | yes (to enable auth) | build-time env | Public identifier; safe to embed in the client bundle. |
| `VITE_PRIVY_CLIENT_ID` | no | build-time env | Passed through to the SDK when present. |
| `PRIVY_APP_SECRET` | never in Cherry | server-only | Cherry's client **never needs it**. Do NOT create a `VITE_`-prefixed variant: any `VITE_*` variable is inlined into the public JS bundle. |

Local `.env.local` example (gitignored — the repo's `.gitignore` covers `.env.*`):

```ini
# .env.local — never commit
VITE_PRIVY_APP_ID=clxxxxxxxxxxxxxxxxxxxxxxxx
# VITE_PRIVY_CLIENT_ID=client-xxxxxxxxxxxx
```

On Vercel, set the same variables in Project Settings → Environment Variables and redeploy.

## 3. What signing in does (and does not do)

- **Guest → account migration:** signing in does not move data. Workspace scoping to your account
  applies to newly created workspaces; existing guest work stays in this browser's IndexedDB until you
  move it yourself via **Command Center → Export** and re-import it where you want it.
- **Logout:** signs you out of Privy only. All local data (workspaces, missions, proof) is untouched.
- **If Privy fails to load** (bad app id, blocked network, ad-blocker): Cherry downgrades to a
  "setup required" notice on the Connections page and keeps working in guest mode. It never blocks
  the app.

## 4. Secret handling rules

- `VITE_PRIVY_APP_ID` and `VITE_PRIVY_CLIENT_ID` are public identifiers — fine in the bundle.
- `PRIVY_APP_SECRET` belongs only on a server you control (Cherry has none and never asks for it).
  If it ever leaks, rotate it in the Privy dashboard immediately.
- Never paste secrets into chat with any agent, and never commit `.env.local`.
