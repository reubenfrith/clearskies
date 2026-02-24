# ClearSkies

> **Automated, site-aware, vehicle-confirmed weather work holds for construction fleets.**

Built on top of Geotab's open telematics platform for the [Geotab Vibe Coding Challenge 2026](https://www.geotab.com/geotab-vibe-coding-challenge-2026/).

---

## The Problem

Weather delays cost the US construction industry **$5 billion every year**. When a storm hits, site managers face a chaotic manual process: check the weather app, call each site supervisor, who then radios every crew member, who may or may not be reachable.

Meanwhile:
- **Nobody knows exactly which vehicles and equipment are on each site** at the moment a storm hits
- **OSHA requires documented proof** that a work hold was issued, who received it, and when work resumed — but most companies rely on paper logs or memory
- **Generic weather alerts go to everyone**, regardless of whether they're on the affected site or 20 miles away

Existing solutions like Perry Weather send site-wide sirens and mass SMS blasts. They don't know where your fleet is. **Geotab does.**

---

## The Solution

ClearSkies connects Geotab's real-time vehicle tracking with hyper-local weather data to:

1. **Automatically detect** when OSHA weather thresholds are breached at any active job site
2. **Identify exactly which vehicles and operators** are on that site at that moment using Geotab geofence zones
3. **Send targeted SMS alerts** via Twilio — only to drivers confirmed on the affected site
4. **Log a timestamped, OSHA-compliant hold record** including weather snapshot, vehicle list, and GPS positions
5. **Issue the all-clear automatically** once the hold period expires, notifying drivers to resume work

All visible and controllable from a **MyGeotab Add-In dashboard** embedded directly inside the platform fleet managers already use every day.

---

## Demo

> *"3 job sites, all clear. A storm cell develops. Watch what happens."*

1. Live dashboard shows all job sites with GREEN/AMBER/RED weather status
2. Storm threshold breached → site flips RED, hold timer starts
3. ClearSkies resolves 4 vehicles confirmed on site via Geotab
4. SMS fires to those 4 drivers only — pull out phone to show live
5. Hold management page shows driver names, vehicle IDs, GPS positions
6. 30-minute countdown runs — or manager issues manual all-clear
7. All-clear SMS fires, compliance log records the full event

---

## OSHA Thresholds

| Rule | Threshold | Hold Duration | Affected Work |
|---|---|---|---|
| Lightning / Thunderstorm | Lightning probability > 40% | 30 minutes (30/30 rule) | All outdoor work |
| High Wind — General | Wind ≥ 40 mph | Until wind drops | Cranes, scaffolding, elevated work |
| High Wind — Material Handling | Wind ≥ 30 mph | Until wind drops | Material handling, aerial lifts |
| Extreme Heat | Apparent temp ≥ 38°C (100°F) | Ongoing advisory | All outdoor work |

*References: OSHA 1926.968 (wind), OSHA 29 CFR 1926.451(f)(12) (scaffolding), OSHA/NOAA 30/30 Lightning Rule*

---

## Architecture

```
Open-Meteo API (weather)
        │
        ▼
ClearSkies API (FastAPI/Python — hosted on Railway)
        │
        ├── APScheduler (polls every 5 min)
        │       ├── Weather poller   →  Open-Meteo per site
        │       ├── Threshold engine →  OSHA rules evaluation
        │       ├── Geotab resolver  →  vehicles inside affected zones
        │       └── Twilio SMS       →  targeted alerts to on-site drivers only
        │
        ├── REST API  →  sites, holds, logs endpoints
        │
        └── Railway PostgreSQL  →  hold records + compliance log
                │
                ▼
        MyGeotab Add-In (React/Vite — hosted on GitHub Pages)
                │
                ├── Dashboard       (site map, RED/GREEN status, timers)
                ├── Hold Management (manual hold, all-clear, vehicle list)
                └── Compliance Log  (full OSHA-compliant hold history)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| API backend | Python + FastAPI |
| Background polling | APScheduler (runs inside FastAPI lifespan) |
| API hosting | Railway.app |
| Weather data | Open-Meteo (free, no API key) |
| Fleet data | Geotab SDK + MyGeotab API |
| SMS alerts | Twilio |
| Database | Railway PostgreSQL (asyncpg) |
| Add-In frontend | React + Vite + Tailwind CSS |
| Add-In hosting | GitHub Pages |
| API auth | `X-Api-Key` header (shared secret) |

---

## Project Structure

```
clearskies/
├── api/                           # FastAPI backend (deployed to Railway)
│   ├── main.py                    # App entry point, CORS, router registration
│   ├── auth.py                    # API key authentication dependency
│   ├── database.py                # asyncpg connection pool + row serialiser
│   ├── schema.sql                 # PostgreSQL schema (run once on first deploy)
│   ├── requirements.txt
│   ├── railway.toml               # Railway build/start config
│   ├── polling/
│   │   ├── scheduler.py           # APScheduler + poll() + processSite()
│   │   ├── weather.py             # Open-Meteo API calls per site
│   │   ├── thresholds.py          # OSHA rules evaluation
│   │   ├── geotab.py              # Geotab auth + zone/vehicle queries
│   │   └── alerts.py              # Twilio SMS dispatch
│   └── routes/
│       ├── sites.py               # GET /api/sites, GET /api/sites/:id
│       ├── holds.py               # GET/POST /api/holds, PATCH /api/holds/:id/clear
│       └── logs.py                # GET /api/logs
│
├── addin/                         # React add-in (deployed to GitHub Pages)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # Live site map + status cards
│   │   │   ├── HoldManagement.tsx # Issue/clear holds, vehicle list
│   │   │   ├── ComplianceLog.tsx  # OSHA hold history table
│   │   │   └── MapView.tsx
│   │   ├── components/
│   │   │   ├── SiteCard.tsx
│   │   │   ├── WeatherBadge.tsx
│   │   │   ├── CountdownTimer.tsx
│   │   │   └── VehicleList.tsx
│   │   └── lib/
│   │       ├── api.ts             # All fetch calls to the FastAPI backend
│   │       ├── types.ts
│   │       └── geotabContext.tsx
│   └── config.json                # MyGeotab Add-In manifest
│
└── .github/workflows/deploy.yml   # Builds addin → deploys to GitHub Pages
```

---

## Getting Started

### Prerequisites
- Geotab demo database account
- Twilio account (free trial)
- Railway account (free tier works)
- Python 3.11+
- Node.js 20+

### 1. Clone

```bash
git clone https://github.com/yourusername/clearskies
```

### 2. Configure the API

```bash
cd api
cp .env.example .env
# Fill in .env — see api/.env.example for all required vars
```

Required variables:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname

GEOTAB_SERVER=my.geotab.com
GEOTAB_DATABASE=your-database-name
GEOTAB_USERNAME=your@email.com
GEOTAB_PASSWORD=your-password

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

POLL_INTERVAL_MINUTES=5
DEMO_MODE=false

API_KEY=generate-a-random-secret-here   # python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Set up the database

```bash
psql $DATABASE_URL -f api/schema.sql
```

Or paste `api/schema.sql` into Railway's PostgreSQL query console.

### 4. Run the API locally

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload
```

### 5. Configure the Add-In

```bash
cd addin
cp .env.example .env
# Set VITE_API_URL=http://localhost:8000 for local dev
# Set VITE_API_KEY to the same value as API_KEY above
npm install
npm run dev
```

### 6. Load the Add-In in MyGeotab

In MyGeotab → Administration → Add-Ins, add the config from `addin/config.json` pointing to your GitHub Pages URL (or `localhost:5173` for local dev).

### 7. Set up Geotab job site zones

In MyGeotab → Administration → Zones, create a zone for each job site. Copy each Zone ID into your `sites` table:

```sql
INSERT INTO sites (name, address, lat, lng, geotab_zone_id) VALUES
  ('Site A — Downtown Tower', '123 Main St, Chicago, IL', 41.8781, -87.6298, 'zABCDE12345');
```

The add-in now renders **every** zone available to the signed-in MyGeotab user, coloring the zones that match `sites.geotab_zone_id`. Because those polygons come straight from the MyGeotab JavaScript API, they only appear when the add-in runs inside MyGeotab (the standalone Vite dev server intentionally skips them).

---

## Deployment

### API → Railway

1. Create a Railway project and add a PostgreSQL plugin
2. Add a service pointing to the `api/` subdirectory
3. Set all env vars from `api/.env.example` in the Railway dashboard
4. Run `api/schema.sql` against the Railway PostgreSQL instance
5. Railway auto-deploys on push to `main`

### Add-In → GitHub Pages

1. Add `VITE_API_URL` and `VITE_API_KEY` as GitHub Actions secrets
2. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds and deploys automatically

---

## Database Schema

```sql
-- Job sites (one row per monitored site)
CREATE TABLE sites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  address          TEXT,
  lat              FLOAT NOT NULL,
  lng              FLOAT NOT NULL,
  geotab_zone_id   TEXT NOT NULL UNIQUE,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weather work hold events (open while all_clear_at IS NULL)
CREATE TABLE holds_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  triggered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_rule       TEXT NOT NULL,           -- LIGHTNING_30_30 | HIGH_WIND_GENERAL | ...
  weather_snapshot   JSONB NOT NULL DEFAULT '{}',
  vehicles_on_site   JSONB NOT NULL DEFAULT '[]',
  hold_duration_mins INT,                     -- NULL = hold until condition clears
  all_clear_at       TIMESTAMPTZ,             -- NULL = hold still active
  issued_by          TEXT NOT NULL DEFAULT 'auto',
  notifications_sent JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SMS log (one row per message sent)
CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id       UUID NOT NULL REFERENCES holds_log(id) ON DELETE CASCADE,
  driver_name   TEXT,
  phone_number  TEXT NOT NULL,
  message_type  TEXT NOT NULL CHECK (message_type IN ('hold', 'all_clear')),
  sent_at       TIMESTAMPTZ NOT NULL,
  twilio_sid    TEXT,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Roadmap

- [ ] **Procore integration** — auto-log weather delay events on project daily report
- [ ] **PDF compliance export** — OSHA-ready hold report for legal/insurance claims
- [ ] **Tomorrow.io lightning** — upgrade from probability to real-time strike detection
- [ ] **Slack / Teams notifications** — site manager channel alerts
- [ ] **Per-site custom thresholds** — crane sites get stricter wind limits than ground crews
- [ ] **Predictive holds** — warn managers 2 hours before threshold breach using forecast data

---

## Why ClearSkies Wins

| Capability | Perry Weather | Generic Weather App | **ClearSkies** |
|---|---|---|---|
| Hyper-local weather | ✅ | ❌ | ✅ |
| Knows which vehicles are on site | ❌ | ❌ | ✅ |
| Targeted SMS to on-site drivers only | ❌ | ❌ | ✅ |
| GPS-verified equipment stop proof | ❌ | ❌ | ✅ |
| OSHA-compliant hold log | Partial | ❌ | ✅ |
| Lives inside existing fleet platform | ❌ | ❌ | ✅ |
| Zero new hardware required | ❌ (needs station) | ✅ | ✅ |

---

## Built With

- [Geotab SDK](https://developers.geotab.com) — vehicle tracking & zone data
- [Open-Meteo](https://open-meteo.com) — free hyper-local weather API
- [Twilio](https://twilio.com) — SMS delivery
- [FastAPI](https://fastapi.tiangolo.com) — async Python API framework
- [Railway](https://railway.app) — API + PostgreSQL hosting
- [GitHub Pages](https://pages.github.com) — Add-In hosting

---

## License

MIT

---

*Built for the Geotab Vibe Coding Challenge 2026 — Feb 12 to Mar 2, 2026*
