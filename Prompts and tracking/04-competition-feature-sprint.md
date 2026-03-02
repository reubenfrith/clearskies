# ClearSkies — Session 4: Competition Feature Sprint
> Date: 2026-02-28 | Deadline: 2026-03-02

---

## What Was Built This Session

Four features added for the Geotab Vibe Coding Challenge submission.

---

### Feature 1 — Bidirectional Site/Zone Integration ✅

**Problem:** Sites could only be added manually via the DB. Removing a site didn't touch Geotab.

**What changed:**
- `addin/src/lib/geotabZones.ts` — Added `createGeotabZone()` and `deactivateGeotabZone()`
  - `createGeotabZone` generates a 16-point polygon approximating a circle (Geotab rejects single-point zones — fixed mid-session)
  - `deactivateGeotabZone` soft-deletes by setting `activeTo: "1986-01-01"`
- `addin/src/components/CreateSiteModal.tsx` *(new)* — Modal form: name, address, lat/lng, radius (default 200m). Creates zone in Geotab first, then calls `api.createSite()` with the returned zone id
- `addin/src/components/SiteCard.tsx` — Added `apiRef` + `onRemoved` props; "Remove" button confirms → deactivates in DB and Geotab
- `addin/src/pages/Dashboard.tsx` — "+ Create Site" button (only shown when `apiRef.current` is set, i.e. inside MyGeotab); passes `onRemoved={load}` to each SiteCard

**Bug fixed during testing:**
Geotab threw `ArgumentException: Invalid area zone` — single-point zone with `z=0, radius` is not accepted. Fixed by generating a proper 16-vertex polygon using lat/lng degree conversion.

---

### Feature 2 — Replace Twilio with Geotab TextMessage ✅

**Problem:** Twilio SMS requires driver phone numbers and a paid account. Geotab TextMessage API reaches any device on the fleet without needing phone numbers.

**What changed:**
- `api/polling/alerts.py` — Full rewrite: removed Twilio client, added `_send_geotab_message(device_id, message)` calling `_geotab_call("Add", { typeName: "TextMessage", ... })`, rewrote both alert functions to iterate by `device_id`
- `api/schema.sql` — `notification_log.phone_number` made nullable, `geotab_device_id TEXT` column added; migration SQL commented in file
- `api/requirements.txt` — Removed `twilio`
- `api/.env.example` — Removed `TWILIO_*` vars
- `addin/src/lib/types.ts` — `NotificationRecord`: `phone_number` → `string | null`, `twilio_sid` → `string | null`, added `geotab_device_id: string | null`

**Migration required on Railway DB:**
```sql
ALTER TABLE notification_log
  ALTER COLUMN phone_number DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS geotab_device_id TEXT;
```

---

### Feature 3 — Weather Heatmap Layers ✅

**Problem:** The map showed site pins and Geotab zones but no ambient weather context.

**What changed:**
- `api/polling/weather.py` — Added `precipitation_mm` to the returned snapshot dict
- `addin/src/lib/types.ts` — Added `precipitation_mm?: number` to `WeatherSnapshot`
- `addin/src/lib/weather.ts` *(new)* — `fetchSiteWeather(lat, lng)` calls Open-Meteo directly for `apparent_temperature` + `precipitation` (free, no key)
- `addin/src/pages/MapView.tsx` — Added:
  - `lerpColour`, `tempColour`, `precipColour` helpers (4-stop and 3-stop gradients)
  - `siteWeather` state populated in parallel after sites load
  - `showTempLayer` / `showPrecipLayer` toggle state
  - "🌡 Temp" + "🌧 Rain" pill buttons in top-right controls panel
  - `<CircleMarker>` overlays rendered before zone polygons (so zones sit on top)
  - Legend panel (bottom-right) with labelled colour swatches — appears only when a layer is active, swaps content on toggle

**Colour scales:**
- Temp: ≤0°C blue → 15°C green → 28°C amber → ≥38°C red
- Rain: 0mm very-light-blue → 5mm sky-blue → ≥25mm dark navy

---

### Feature 4 — PDF Compliance Export ✅

**Problem:** OSHA compliance requires printable hold records; the table was screen-only.

**What changed:**
- `addin/package.json` — Added `jspdf@4.2.0` + `jspdf-autotable@5.0.7`
- `api/routes/holds.py` — `page_size` max raised 100 → 500
- `addin/src/pages/ComplianceLog.tsx` — Added `exportPDF()`: paginates `api.getHolds(page, 500)` until all records fetched, builds landscape PDF with OSHA header, date, event count, and autoTable; "Export PDF" button next to page title

**PDF columns:** Site | Rule | Triggered | Duration | Vehicles on Site | Alerts Sent | Issued By | Status

---

## Current File Tree (changed files)

```
addin/src/
  components/
    CreateSiteModal.tsx    ← NEW
    SiteCard.tsx           ← Remove button + apiRef/onRemoved props
  lib/
    geotabZones.ts         ← createGeotabZone, deactivateGeotabZone
    types.ts               ← precipitation_mm, updated NotificationRecord
    weather.ts             ← NEW — direct Open-Meteo fetch
  pages/
    Dashboard.tsx          ← Create Site button + modal + onRemoved wiring
    MapView.tsx            ← Heatmap layers, toggles, legend
    ComplianceLog.tsx      ← Export PDF button + jsPDF logic

api/
  polling/
    alerts.py              ← Geotab TextMessage (Twilio removed)
    weather.py             ← precipitation_mm added
  routes/
    holds.py               ← page_size max 500
  schema.sql               ← phone_number nullable, geotab_device_id added
  requirements.txt         ← twilio removed
  .env.example             ← TWILIO_* removed
```

---

## Status Table

| Feature | Status | Notes |
|---|---|---|
| Create Site (+ Geotab zone) | ✅ Done | Polygon fix applied |
| Remove Site (+ deactivate zone) | ✅ Done | Soft-delete both sides |
| Geotab TextMessage alerts | ✅ Done | DB migration needed on Railway |
| Temp heatmap layer | ✅ Done | Direct Open-Meteo, legend included |
| Rain heatmap layer | ✅ Done | Direct Open-Meteo, legend included |
| PDF compliance export | ✅ Done | Landscape, paginates all records |
| Railway DB migration | ⏳ Pending | Run ALTER TABLE before deploying api/ |
| End-to-end test in MyGeotab | ⏳ Pending | Test Create Site, TextMessage, PDF |

---

## Continuation Prompts

Use these to pick up where we left off in a new session.

---

### Run the Railway DB migration
```
Run the pending notification_log migration against the Railway PostgreSQL database.
The migration SQL is commented in api/schema.sql. Apply it then verify the column
exists by querying the table schema.
```

---

### Test Create Site end-to-end
```
The CreateSiteModal in addin/src/components/CreateSiteModal.tsx creates a Geotab zone
then calls api.createSite(). When tested live it previously threw "ArgumentException:
Invalid area zone" — this was fixed by generating a 16-point polygon in circlePoints()
in geotabZones.ts. Verify the fix works end-to-end: open Dashboard inside MyGeotab,
click "+ Create Site", fill the form, confirm the zone appears in Geotab Zones admin
and the site appears in the ClearSkies DB.
```

---

### Test Geotab TextMessage delivery
```
api/polling/alerts.py now sends Geotab TextMessage instead of Twilio SMS.
The send function is _send_geotab_message(device_id, message) in that file.
Enable DEMO_MODE on the Railway API, trigger a hold, then check:
1. notification_log has geotab_device_id populated and phone_number is NULL
2. The message appears in MyGeotab under the device's messages / GODriven app
```

---

### Add an "Off" state to the heatmap toggles
```
In addin/src/pages/MapView.tsx the Temp and Rain toggle buttons currently
radio-select (clicking active one leaves it on, clicking the other switches).
Change behaviour so clicking the active button again turns the layer off entirely
(sets both showTempLayer and showPrecipLayer to false). The legend should also
disappear when both are off.
```

---

### Add weather data to the PDF export
```
The PDF export in addin/src/pages/ComplianceLog.tsx currently includes:
Site, Rule, Triggered, Duration, Vehicles, Alerts Sent, Issued By, Status.
Add a "Weather at Trigger" column showing wind gust, apparent temp, and
lightning probability from hold.weather_snapshot.
```

---

### Per-site custom OSHA thresholds
```
Currently all sites use the same thresholds in api/polling/thresholds.py.
Add a thresholds JSONB column to the sites table in api/schema.sql so individual
sites can override specific limits (e.g. crane sites get a stricter wind threshold).
The processSite() function in api/polling/scheduler.py should merge site-level
overrides on top of the defaults before running threshold checks.
```

---

### Predictive hold warnings
```
Add a /api/sites/:id/forecast endpoint to the FastAPI backend that fetches
the next 6-hour Open-Meteo hourly forecast for a site and returns any hours
where a threshold would be breached. Display a "Forecast warning" banner on
the SiteCard in Dashboard.tsx when a breach is predicted within 2 hours.
```

---

### Procore daily log integration
```
When a hold closes (all_clear_at is set), POST a weather delay entry to the
Procore API for the linked project. Add procore_project_id to the sites table.
Implement a post_to_procore(hold, site) async function in a new file
api/integrations/procore.py that uses the Procore REST API v1 to create a
Daily Log > Weather entry with the hold duration and OSHA rule as the note.
```
