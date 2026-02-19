# ClearSkies — Work In Progress

> Geotab Vibe Coding Challenge 2026 (Feb 12 – Mar 2, 2026)
> Last updated: 2026-02-19

---

## Status Overview

| Area | Status | Notes |
|---|---|---|
| Agent — scaffold & config | ✅ Done | TypeScript, tsx dev runner, Railway-ready |
| Agent — weather polling | ✅ Done | Open-Meteo, CAPE→lightning%, WMO fallback |
| Agent — threshold engine | ✅ Done | All 4 OSHA rules, DEMO_MODE, auto-clear logic |
| Agent — Geotab resolver | ✅ Done | JSON-RPC auth, zone query, phone resolution |
| Agent — alert dispatcher | ✅ Done | Twilio SMS (hold + all-clear), Supabase logging |
| Agent — polling loop | ✅ Done | Concurrent per-site, hold lifecycle management |
| Supabase schema | ✅ Done | 3 tables, indexes, RLS policies, seed comments |
| Add-In — scaffold | ✅ Done | Vite + React + Tailwind + HashRouter |
| Add-In — Geotab lifecycle | ✅ Done | initialize/focus/blur, standalone dev mode |
| Add-In — Dashboard page | ✅ Done | Site cards, RED/GREEN status, auto-refresh 30s |
| Add-In — Hold Management | ✅ Done | Hold detail, countdown timer, manual all-clear |
| Add-In — Compliance Log | ✅ Done | Paginated hold history table |
| Add-In — config.json | ✅ Done | Manifest stub (needs real Vercel URL) |
| Credentials & .env setup | ⏳ Pending | Waiting on Supabase, Geotab, Twilio accounts |
| End-to-end test | ⏳ Pending | Requires live credentials |
| Railway deployment | ⏳ Pending | Agent |
| Vercel deployment | ⏳ Pending | Add-In |
| MyGeotab Add-In loading | ⏳ Pending | Needs Vercel URL in config.json |
| Demo mode validation | ⏳ Pending | Low thresholds, real weather reading |

---

## What Has Been Built

### `agent/`

Node.js + TypeScript monitoring agent. Entry point is `src/index.ts`.

**Polling loop (`index.ts`)**
- Runs every `POLL_INTERVAL_MINUTES` (default 5 min)
- Fetches all active sites from Supabase
- Processes all sites concurrently via `Promise.allSettled`
- On breach with no active hold: creates hold, resolves vehicles, fires SMS
- On active hold: checks if it should clear (timer elapsed or conditions dropped), fires all-clear SMS and closes hold

**Weather poller (`weatherPoller.ts`)**
- Calls Open-Meteo `/v1/forecast` — free, no API key
- Fetches: wind speed, wind gust, apparent temperature, weather code, CAPE (lightning proxy)
- CAPE → lightning probability conversion (bucketed 0–90%)
- Fallback: WMO thunderstorm codes (95, 96, 99) → 50% probability if CAPE is low
- Returns typed `WeatherSnapshot`

**Threshold engine (`thresholdEngine.ts`)**
- Evaluates 4 OSHA rules in priority order: LIGHTNING_30_30 > HIGH_WIND_GENERAL > HIGH_WIND_MATERIAL_HANDLING > EXTREME_HEAT
- Uses wind **gust** (not sustained) for wind rules — more conservative and correct
- `DEMO_MODE=true` lowers all thresholds (lightning 10%, wind 5/3 mph, heat 25°C)
- `shouldClearHold()` handles both timed holds (30-min lightning rule) and condition-based holds (wind/heat drops below threshold)

**Geotab resolver (`geotabResolver.ts`)**
- Full JSON-RPC authentication against `https://{server}/apiv1`
- Handles server redirect on auth response (`path` field)
- Queries `DeviceStatusInfo` filtered by `zoneId` — Geotab's real-time GPS (~30s refresh)
- Filters out non-communicating devices
- Resolves driver phone numbers from `User` entity, normalises to E.164 for Twilio
- Auto re-authenticates on `InvalidUserException` (session expiry)

**Alert dispatcher (`alertDispatcher.ts`)**
- Sends hold SMS: site name, OSHA rule label, duration text, vehicle name, timestamp
- Sends all-clear SMS: site name, rule, resume instruction
- Logs every message to `notification_log` via Supabase
- Per-driver error handling — one failed send doesn't block others

**Supabase client (`supabaseClient.ts`)**
- Typed wrappers for all DB operations
- Uses service role key (bypasses RLS, server-side only)
- Functions: `getActiveSites`, `getActiveHold`, `createHold`, `closeHold`, `logNotification`

---

### `supabase/schema.sql`

- `sites` — job sites with lat/lng and Geotab zone ID
- `holds_log` — one row per hold event; `all_clear_at = NULL` means active; `weather_snapshot` and `vehicles_on_site` stored as JSONB
- `notification_log` — one row per SMS sent
- Partial index on `holds_log` for fast active-hold lookups (`WHERE all_clear_at IS NULL`)
- RLS: service role bypasses; anon role can read all tables and insert/update holds (for dashboard manual all-clear)
- Commented seed data for 3 example Chicago sites

---

### `addin/`

Vite + React 18 + TypeScript + Tailwind CSS add-in. Entry via `index.html` → `src/main.tsx`.

**Geotab Add-In lifecycle (`main.tsx`)**
- Registers `window.geotab.addin.clearskies = { initialize, focus, blur }`
- React mounts on `initialize`, persists across `focus`/`blur` cycles
- Dev mode detection: mounts directly when running on Vite dev server (not inside MyGeotab)
- HashRouter used — reliable in MyGeotab's iframe environment across all platform versions

**Dashboard page (`pages/Dashboard.tsx`)**
- Loads all active sites + open holds from Supabase in parallel
- Derives RED (active hold) / GREEN (clear) status per site
- Auto-refreshes every 30 seconds
- Summary count bar (X holds active / Y clear)
- Renders `SiteCard` grid

**Hold Management page (`pages/HoldManagement.tsx`)**
- Loads by `siteId` URL param
- Shows hold detail: rule, weather snapshot at trigger time, vehicle list, countdown or condition-based status
- Manual all-clear button → updates `holds_log.all_clear_at` directly via Supabase anon client
- Note: manual all-clear from the dashboard does NOT send SMS — operator should notify drivers directly (by design, to avoid accidental mass-SMS)

**Compliance Log page (`pages/ComplianceLog.tsx`)**
- Paginated table (25 rows/page) of all hold events, newest first
- Columns: site, rule, triggered time, duration, vehicle count, SMS count, issued by, status badge
- Active holds show animated red pulse badge

**Components**
- `SiteCard` — status-coloured left border, weather stats, countdown, link to hold management
- `WeatherBadge` — coloured pill with rule label
- `CountdownTimer` — live countdown to lightning 30-min expiry (updates every second)
- `VehicleList` — table of vehicles with driver name, phone, speed, GPS coords

**Add-In manifest (`config.json`)**
- Single-entry add-in under `ActivityLink/` (top-level MyGeotab nav)
- URL placeholder: `YOUR_VERCEL_URL` must be replaced before loading into MyGeotab

---

## What Remains To Do

### Setup & Credentials (blockers)
- [ ] Create Supabase project, run `supabase/schema.sql`, copy URL + keys to `agent/.env` and `addin/.env`
- [ ] Create Geotab demo database account, configure zones for job sites, note zone IDs
- [ ] Populate `sites` table in Supabase with real site lat/lng + Geotab zone IDs
- [ ] Create Twilio account, get a phone number, copy SID/token to `agent/.env`

### Deployment
- [ ] Deploy agent to Railway — set all env vars in Railway dashboard, confirm polling loop starts
- [ ] Deploy add-in to Vercel — set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in Vercel env
- [ ] Update `addin/config.json` with real Vercel URL
- [ ] Load `config.json` into MyGeotab → Administration → Add-Ins → Add Add-In

### Testing
- [ ] End-to-end: trigger DEMO_MODE, confirm weather breach → hold created → SMS sent → all-clear fires
- [ ] Verify `DeviceStatusInfo` zone query returns correct vehicles against Geotab demo data
- [ ] Confirm Twilio SMS delivered, `notification_log` populated
- [ ] Confirm MyGeotab Add-In loads, all three pages render, manual all-clear works

### Demo Polish
- [ ] Add a site status map (Google Maps or Leaflet embed) to the Dashboard showing site pins with RED/GREEN markers
- [ ] Add real-time Supabase `realtime` subscription to Dashboard (currently polls every 30s) so hold status flips instantly on the screen during the demo
- [ ] Add an SVG icon (`addin/public/icon.svg`) for the MyGeotab nav entry
- [ ] Improve `main.tsx` dev mode: pass a mock `api` object so Geotab SDK calls can be stubbed locally
- [ ] Add a "Trigger Demo Hold" button in the UI (dev/demo only) to manually create a hold without waiting for weather

### Nice-to-haves (Roadmap)
- [ ] Procore integration — auto-log weather delay on project daily report
- [ ] PDF export — OSHA-ready hold report (React PDF or Puppeteer)
- [ ] Tomorrow.io lightning — real-time strike detection (upgrade from probability)
- [ ] Slack / Teams notifications — parallel to SMS
- [ ] Per-site custom thresholds — crane sites get stricter wind limits
- [ ] Predictive holds — warn managers 2h before breach using forecast data

---

## Key File Reference

```
clearskies/
├── WIP/
│   └── progress.md              ← this file
├── agent/
│   ├── src/
│   │   ├── index.ts             ← polling loop entry point
│   │   ├── weatherPoller.ts     ← Open-Meteo integration
│   │   ├── thresholdEngine.ts   ← OSHA rules + DEMO_MODE
│   │   ├── geotabResolver.ts    ← Geotab auth + zone/vehicle lookup
│   │   ├── alertDispatcher.ts   ← Twilio SMS
│   │   ├── supabaseClient.ts    ← DB layer
│   │   └── types.ts             ← shared domain types
│   ├── .env.example             ← copy to .env and fill in
│   ├── package.json
│   └── tsconfig.json
├── addin/
│   ├── src/
│   │   ├── main.tsx             ← Geotab lifecycle + React mount
│   │   ├── App.tsx              ← router + nav
│   │   ├── geotab.d.ts          ← Geotab API type declarations
│   │   ├── lib/
│   │   │   ├── supabase.ts      ← Supabase anon client
│   │   │   └── types.ts         ← shared types (mirrors agent/types.ts)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── HoldManagement.tsx
│   │   │   └── ComplianceLog.tsx
│   │   └── components/
│   │       ├── SiteCard.tsx
│   │       ├── WeatherBadge.tsx
│   │       ├── CountdownTimer.tsx
│   │       └── VehicleList.tsx
│   ├── config.json              ← MyGeotab Add-In manifest (update URL)
│   ├── .env.example             ← copy to .env and fill in
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
└── supabase/
    └── schema.sql               ← run in Supabase SQL editor
```

---

## Environment Variables Checklist

### `agent/.env`
- [ ] `GEOTAB_SERVER`
- [ ] `GEOTAB_DATABASE`
- [ ] `GEOTAB_USERNAME`
- [ ] `GEOTAB_PASSWORD`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_FROM_NUMBER`
- [ ] `POLL_INTERVAL_MINUTES` (default: 5)
- [ ] `DEMO_MODE` (set `true` for demo)

### `addin/.env`
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
