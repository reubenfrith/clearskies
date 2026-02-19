# 🌤️ ClearSkies

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
ClearSkies Monitoring Agent (Node.js — hosted on Railway)
        │
        ├── Threshold Engine  →  OSHA rules evaluation
        │
        ├── Geotab Resolver   →  vehicles inside affected zones
        │
        ├── Twilio SMS        →  targeted alerts to on-site drivers only
        │
        └── Supabase          →  hold records + compliance log
                │
                ▼
        MyGeotab Add-In (React — hosted on Vercel)
                │
                ├── Live Dashboard   (site map, RED/GREEN status, timers)
                ├── Hold Management  (manual hold, all-clear, vehicle list)
                └── Compliance Log   (full OSHA-compliant hold history)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monitoring agent | Node.js + TypeScript |
| Agent hosting | Railway.app |
| Weather data | Open-Meteo (free, no API key) |
| Fleet data | Geotab SDK + MyGeotab API |
| SMS alerts | Twilio |
| Database | Supabase (PostgreSQL) |
| Add-In frontend | React + Tailwind CSS |
| Add-In hosting | Vercel |

---

## Project Structure

```
clearskies/
├── agent/
│   ├── index.ts               # Entry point, polling loop
│   ├── weatherPoller.ts       # Open-Meteo API calls per site
│   ├── thresholdEngine.ts     # OSHA rules evaluation
│   ├── geotabResolver.ts      # Geotab auth + zone/vehicle queries
│   ├── alertDispatcher.ts     # Twilio SMS dispatch
│   └── supabaseClient.ts      # DB read/write
│
├── addin/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Live site map + status cards
│   │   │   ├── HoldManagement.tsx  # Issue/clear holds, vehicle list
│   │   │   └── ComplianceLog.tsx   # OSHA hold history table
│   │   └── components/
│   │       ├── SiteCard.tsx
│   │       ├── WeatherBadge.tsx
│   │       ├── CountdownTimer.tsx
│   │       └── VehicleList.tsx
│   └── config.json            # MyGeotab Add-In manifest
│
├── supabase/
│   └── schema.sql             # Full DB schema
│
└── README.md
```

---

## Getting Started

### Prerequisites
- Geotab demo database account
- Supabase account (free)
- Twilio account (free trial)
- Railway account (free)
- Node.js 18+

### 1. Clone & install

```bash
git clone https://github.com/yourusername/clearskies
cd clearskies/agent && npm install
cd ../addin && npm install
```

### 2. Set up Supabase

```bash
# Run schema in Supabase SQL editor
cat supabase/schema.sql
```

### 3. Configure environment

```bash
# agent/.env
GEOTAB_SERVER=my.geotab.com
GEOTAB_DATABASE=your_database
GEOTAB_USERNAME=your_username
GEOTAB_PASSWORD=your_password

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

POLL_INTERVAL_MINUTES=5
DEMO_MODE=false   # set true to lower thresholds for demo
```

### 4. Set up Geotab job site zones

In MyGeotab → Administration → Zones, create zones for each job site. Note the Zone IDs and add them to your `sites` table in Supabase.

### 5. Run the agent

```bash
cd agent && npm run dev
```

### 6. Load the Add-In

In MyGeotab → Administration → Add-Ins, add the config from `addin/config.json` pointing to your Vercel deployment URL.

---

## Database Schema

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  geotab_zone_id TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE holds_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  triggered_at TIMESTAMPTZ NOT NULL,
  trigger_rule TEXT NOT NULL,
  weather_snapshot JSONB NOT NULL,
  vehicles_on_site JSONB NOT NULL,
  hold_duration_mins INT,
  all_clear_at TIMESTAMPTZ,
  issued_by TEXT DEFAULT 'auto',
  notifications_sent JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id UUID REFERENCES holds_log(id),
  driver_name TEXT,
  phone_number TEXT,
  message_type TEXT,   -- 'hold' or 'all_clear'
  sent_at TIMESTAMPTZ,
  twilio_sid TEXT,
  status TEXT
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
- [ ] **Insurance integration** — auto-generate weather delay documentation for claims

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
- [Supabase](https://supabase.com) — real-time database
- [Railway](https://railway.app) — agent hosting
- [Vercel](https://vercel.com) — Add-In hosting

---

## License

MIT

---

*Built for the Geotab Vibe Coding Challenge 2026 — Feb 12 to Mar 2, 2026*
