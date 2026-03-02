# ClearSkies — Build Journey & Learning Guide

> Session log covering the Map View implementation, MyGeotab integration debugging,
> and demo configuration. Written to help understand how and why decisions were made.

---

## What We Built in This Session

### 1. Live Map View (react-leaflet)

The goal was a map showing all monitored job sites and the fleet vehicles currently on them — with live GPS positions from Geotab rather than stale snapshot data.

**Technology chosen: react-leaflet + OpenStreetMap**
- Free tiles — no API key, no billing surprises during a demo
- Works inside an iframe (unlike Google Maps which has stricter CSP requirements)
- `L.divIcon` with plain HTML circles avoids the broken default Leaflet marker icon issue that Vite causes (Vite mangles the asset paths Leaflet expects)

**What the map shows:**
- Green dots — job sites with no active hold
- Red dots — job sites with an active weather hold (click for rule + time)
- Yellow dots (14px) — fleet vehicles going about normal work
- Orange dots (16px) — fleet vehicles confirmed on an active-hold site

**Data flow:**
```
Supabase (sites + holds_log) ──→ site markers + hold status
Geotab DeviceStatusInfo API  ──→ live vehicle positions (all fleet)
Cross-reference               ──→ which vehicles are on hold sites
```

---

### 2. GitHub Pages Deployment

Rather than deploying to Railway or Vercel (which require accounts and billing), we used GitHub Pages — free, permanent, no server to manage.

**Key Vite config decision — `base: "./"`**

This was subtle but critical. We initially set `base: "/clearskies/"` (the repo name). This works for standalone browser access but breaks inside MyGeotab because MyGeotab's add-in loader concatenates the add-in base URL with script `src` attributes:

```
base URL:   https://reubenfrith.github.io/clearskies/
script src: /clearskies/assets/index.js   ← absolute path from Vite

Result: https://reubenfrith.github.io/clearskies//clearskies/assets/index.js  ← 404
```

Using `base: "./"` (relative) makes Vite emit `./assets/index.js`, which the loader resolves correctly relative to the page.

**GitHub Actions workflow** builds on every push to `main`, injects Supabase secrets from repository secrets at build time, and deploys `addin/dist` to GitHub Pages automatically.

---

### 3. MyGeotab Add-In Integration — What Went Wrong

Getting the add-in running inside MyGeotab required fixing five separate issues:

#### Issue 1: Plain object vs factory function
**Symptom:** `initCalled=0` — our `initialize()` was never called despite the add-in loading.

**Root cause:** The Geotab Add-In SDK expects a **factory function** that returns the lifecycle object:

```js
// ❌ Wrong — plain object
window.geotab.addin.clearskies = {
  initialize(api, state, callback) { ... }
}

// ✅ Correct — factory function
window.geotab.addin.clearskies = function() {
  return {
    initialize(api, state, callback) { ... }
  }
}
```

MyGeotab calls `window.geotab.addin.clearskies()` to obtain the object, then calls `.initialize()` on the result. With a plain object, calling it as a function is a no-op, so `initialize` was never reached.

#### Issue 2: React 18 async rendering race condition
**Symptom:** Even after fixing the factory function, `apiReady=false` and `api=null` inside MyGeotab.

**Root cause:** In React 18, `ReactDOM.createRoot().render()` is **asynchronous** — it schedules rendering rather than completing it synchronously. The sequence was:

```
1. main.tsx runs
2. createRoot().render() → schedules React mount (not yet complete)
3. window.geotab.addin.clearskies = function() { ... }  ← registers immediately
4. MyGeotab calls initialize() → setGeotabApi(api) → _apiRef is null! → API lost
5. React eventually mounts GeotabProvider → sets _apiRef and _setApiReady
   ...but initialize() already fired with nobody listening
```

**Fix:** Store the API in a `_pendingApi` module-level variable the moment `initialize()` fires. When `GeotabProvider` mounts (a React `useEffect`), check for the pending API and apply it:

```ts
let _pendingApi: GeotabApi | null = null;

export function setGeotabApi(api) {
  _pendingApi = api;            // always save — regardless of mount timing
  if (_apiRef) _apiRef.current = api;
  if (_setApiReady) _setApiReady(true);
}

// Inside GeotabProvider:
useEffect(() => {
  if (_pendingApi && !apiReady) {
    ref.current = _pendingApi;
    setApiReady(true);         // triggers re-render → load() re-runs with real API
  }
}, []);
```

#### Issue 3: HashRouter intercepted by MyGeotab
**Symptom:** Clicking "Map" or "Compliance Log" in the nav immediately redirected back to Dashboard.

**Root cause:** `HashRouter` works by changing `window.location.hash`. MyGeotab monitors `window.location.hash` for its own navigation and intercepted our hash changes, treating `#/map` as an unknown MyGeotab page and resetting it.

**Fix:** Switch to `MemoryRouter` — routing state lives entirely in JavaScript memory, never touches the URL, so MyGeotab never sees it.

#### Issue 4: DeviceStatusInfo API — wrong field name
**Symptom:** No vehicles appearing despite the API being available.

**Root cause:** We used `deviceSearch: { ids: [...] }` but the correct field name is `deviceSearch: { deviceIds: [...] }` (plural). We discovered this by capturing a successful network request from MyGeotab's own built-in map.

Additionally, Geotab requires an explicit `deviceSearch` filter — a call with no search returns no results.

**Fix:** Two-step approach mirroring what MyGeotab's own map does:
1. `Get Device` — fetches all fleet devices and their IDs
2. `Get DeviceStatusInfo` with `{ deviceSearch: { deviceIds: [...] } }`

#### Issue 5: iframe console isolation
**Symptom:** `console.log()` calls we added for debugging never appeared in DevTools.

**Root cause:** The add-in runs in an iframe. The parent `my.geotab.com` page has its own console context; our iframe has a separate one. Standard DevTools shows the parent context by default.

**Fix:** We built an **on-screen debug panel** — a dark bar at the top of the map that rendered React state directly as text:
```
MAP RENDERED | apiReady=true | loading=false | livePositions=40 | initCalled=1
```
This bypasses the iframe console problem entirely because it's just DOM content.

---

### 4. Geotab Server URL Bug

**Symptom:** `POST https://my.geotab.com/Demo_geotab_reuben/apiv1` → 404

**Root cause:** `.env` had `GEOTAB_SERVER=my.geotab.com/Demo_geotab_reuben`. The code built the URL as `https://${server}/apiv1`, putting the database name in the path.

The Geotab JSON-RPC API endpoint is always `https://my.geotab.com/apiv1` — the database is a **parameter inside the request body**, not part of the URL.

**Fix:** `GEOTAB_SERVER=my.geotab.com` (hostname only).

---

### 5. Demo Mode

The threshold engine has two configurations compiled in:

```ts
const PROD = { lightningPct: 40, highWindGeneralMph: 40, ... }
const DEMO = { lightningPct: 10, highWindGeneralMph: 5, ... }
```

`DEMO_MODE=true` in `agent/.env` switches to the low thresholds. At 5 mph wind gusts, any Las Vegas breeze triggers a `HIGH_WIND_GENERAL` hold on all three sites — instantly creating the red-site, vehicles-flagged state that makes the demo compelling.

---

## Understanding the Architecture

### Why Three Separate Systems?

ClearSkies has three distinct moving parts:

| System | Where it runs | What it does |
|---|---|---|
| **Agent** | Your laptop / Railway cloud | Watches weather, creates holds, sends SMS |
| **Supabase** | Supabase cloud (Postgres) | Single source of truth for all state |
| **Add-In** | User's browser (MyGeotab iframe) | Displays current status, lets operators act |

They share state through Supabase rather than talking to each other directly. This means:
- The agent can run without anyone having the add-in open
- The add-in shows accurate data even if the agent just restarted
- Multiple operators can have the add-in open simultaneously with consistent data

### Why Supabase Instead of a Custom API?

Supabase gives us a real Postgres database with an auto-generated REST API, real-time subscriptions, and authentication — all for free at demo scale. Without it, we'd need to build and host our own API server just to bridge the agent and the add-in.

The add-in uses the **anon key** (safe to embed in client-side code) with Row Level Security policies controlling what it can read and write. The agent uses the **service role key** (never exposed to users) to bypass RLS and write authoritatively.

### Why Open-Meteo for Weather?

- Completely free, no API key, no rate limits at our polling frequency
- Returns wind gust speed separately from sustained wind — important because OSHA's wind rules are based on gusts, not sustained speed
- Returns CAPE (Convective Available Potential Energy) which we convert to a lightning probability — a better signal than simply checking if it's currently thundering

### Why Leaflet Instead of Google Maps?

- No API key needed (OpenStreetMap tiles are public)
- No billing risk during demo
- Works inside iframes without Content Security Policy issues
- `L.divIcon` lets us draw pure HTML/CSS markers — simple coloured circles that match the dashboard's red/green visual language

---

## Prompts to Deepen Your Understanding

These questions mirror real decisions made during the build. Think through each one and you'll understand the key trade-offs.

### Architecture

1. **Why does the agent write to Supabase instead of calling the add-in directly?**
   The add-in only exists when a user has it open. The agent runs continuously. What would happen to alerts if no one had the app open when a threshold was breached?

2. **Why does the add-in use the anon (public) key and not the service role key?**
   The add-in is JavaScript that runs in the user's browser. Anyone can open DevTools and see the source. What would happen if the service role key (which bypasses all security) was embedded in client-side code?

3. **Why store `vehicles_on_site` as a JSONB snapshot in `holds_log` rather than a foreign key to a vehicles table?**
   Vehicle positions change constantly. A vehicle on site when the hold opened might have left an hour later. What does compliance documentation require — who was there *when the hold started*, or who's there *now*?

4. **The agent uses `Promise.allSettled` to process all sites concurrently. Why not `Promise.all`?**
   If the Downtown site's Geotab zone query fails (network timeout), what should happen to the Summerlin and Henderson sites? `Promise.all` vs `Promise.allSettled` have very different failure behaviours.

### MyGeotab Integration

5. **What is the difference between a Geotab Add-In and a regular website embedded in an iframe?**
   Any website can be shown in an iframe. What does registering as a Geotab Add-In specifically add? (Hint: think about authentication, API access, and user context.)

6. **Why does `MemoryRouter` work inside MyGeotab but `HashRouter` doesn't?**
   Both are React Router implementations. What's the fundamental difference in how they store navigation state?

7. **Why must the Geotab add-in lifecycle use a factory function rather than a plain object?**
   `window.geotab.addin.clearskies = function() { return { initialize, focus, blur } }` — why does MyGeotab call it as a function rather than reading the properties directly?

8. **The `_pendingApi` pattern solves a race condition. What exactly is racing against what?**
   Draw out the timeline: when does `main.tsx` run, when does React mount, and when does MyGeotab call `initialize()`? Where does the timing break down?

### Weather & Thresholds

9. **Why does the threshold engine use wind *gust* speed rather than sustained wind speed?**
   OSHA's 1926.968 standard specifies gusts. Why are gusts more relevant than sustained speed for crane and scaffolding safety?

10. **What is CAPE (Convective Available Potential Energy) and why does it make a better lightning signal than checking WMO thunderstorm weather codes?**
    WMO codes tell you what's happening *right now*. CAPE tells you something different — what does it tell you, and why is that more useful for a 30-minute hold rule?

11. **The lightning hold is *timed* (clears after 30 minutes regardless of weather) while wind and heat holds are *condition-based* (clear when weather drops below threshold). Why the difference?**
    Think about what the OSHA 30/30 lightning rule is actually measuring. Once the last strike is seen, why wait 30 minutes even if the storm appears to have passed?

12. **`DEMO_MODE` lowers the wind gust threshold to 5 mph. Las Vegas averages 7–10 mph. Why is this a good demo threshold?**
    What would happen if you set it to 1 mph? What about 20 mph? What makes 5 mph a realistic-looking but reliably-triggering value for a February Las Vegas demo?

### Debugging

13. **We couldn't use `console.log()` to debug the add-in inside MyGeotab. Why not, and what did we use instead?**
    The add-in runs in an iframe. What does that mean for the browser's DevTools console? What was our workaround?

14. **How did we discover that `DeviceStatusInfo` uses `deviceIds` (plural) rather than `ids`?**
    We couldn't find it in documentation. What was our approach to discovering the correct API format? (Hint: look at what MyGeotab's own map sends.)

15. **The Geotab API URL was `https://my.geotab.com/Demo_geotab_reuben/apiv1` instead of `https://my.geotab.com/apiv1`. How did we diagnose this without being able to see the agent's outbound requests directly?**
    The error message was a 404. What information in the error output pointed to the URL being wrong, and where in the code was the bug?

---

## Key Lessons

| Lesson | Context |
|---|---|
| Test in the real environment early | Many bugs only appeared inside MyGeotab, not on the standalone GitHub Pages URL |
| Read protocol not just documentation | The Geotab API field name (`deviceIds` vs `ids`) was found by inspecting real network traffic |
| Make your debug output visible | On-screen debug panels beat console.log when you don't control the runtime environment |
| Race conditions need explicit sequencing | React 18's async rendering changed the timing assumption that had worked in React 17 |
| URL construction bugs produce 404 not auth errors | A hostname that includes a path segment (`my.geotab.com/Demo_geotab_reuben`) produces a 404, which looks like a server problem not a config problem |
| Keep demo thresholds realistic | Too low (1 mph) looks fake; right at typical conditions (5 mph) looks real and still always triggers |

---

## Current State (as of 2026-02-20)

| Component | Status |
|---|---|
| Agent weather polling | ✅ Running, all 3 sites monitored |
| DEMO_MODE thresholds | ✅ Active — HIGH_WIND_GENERAL firing at ~5–11 mph |
| Geotab vehicle resolver | ✅ Fixed (correct API URL) |
| Add-In deployed | ✅ GitHub Pages — `https://reubenfrith.github.io/clearskies/` |
| Add-In in MyGeotab | ✅ Loading, all pages working, MemoryRouter navigation working |
| Live vehicle map | ✅ 40 fleet vehicles rendering with live positions |
| Factory function lifecycle | ✅ `initCalled=1`, `apiReady=true` confirmed |
| Geotab zone vehicle lookup | ✅ Auth working, zone query running |
| Twilio SMS | ⏳ Credentials not yet configured |
