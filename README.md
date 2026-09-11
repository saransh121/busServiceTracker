# 🇦🇪 UAE Pulse Bot

An **on-demand** Telegram bot for anywhere in the UAE. Share your GPS location with one tap (no typing) and ask for:

- 🚦 **Live traffic** — congestion level, speeds vs free-flow, incidents, plus a **live traffic map snapshot** (Google-Maps-style colored roads)
- 🚌 **Upcoming public transport** — next departures from stops near you
- 👥 **Unusually crowded places** — venues busier than usual right now

**It never spams.** The bot only replies when you press a button. No cron jobs, no notifications.

## How location sharing works

The bot sends a Telegram keyboard button built with `request_location`. You tap **📍 Share my location** → your phone shows the native "Allow location" prompt → tap **Allow** → done. You can also send a **Live Location** (attach → Location → Share Live Location) and the bot follows it as you move. Locations are kept for 1 hour, then forgotten.

## Every data source has a fallback

| Data | Primary | Fallback | Last resort |
|---|---|---|---|
| Traffic | TomTom (live) | HERE (live) | Waze live-map feed — keyless, unofficial, often blocked |
| Traffic map | Mapbox navigation style (live traffic colors) | TomTom static map | text only |
| Transit | Transitland — Dubai RTA GTFS (Dubai) | HERE Transit (other emirates) | Nearest stops from OpenStreetMap + official app links |
| Crowds | BestTime.app live foot traffic (budget-guarded) | 🔥 "Nuke option": scrape Google's "Currently X% busy" from search results — unofficial, ToS-gray, bails instantly when captcha-blocked | Estimated: POIs (Geoapify, or keyless OSM) + live congestion + time-of-day |
| Reverse geocode | Nominatim (OSM) | TomTom | offline emirate bounding boxes |

Known reality check (tested Sep 2026): Waze's web feed returns 403 for non-partners and Google captcha-blocks most non-browser scrapes — both are wired in as opportunistic attempts that fail fast into the next provider, never as something the bot depends on. Crowds and transit work with **zero keys** via the OSM paths.

Honesty notes: traffic and map colors are genuinely **live**; UAE transit times are **scheduled** (no UAE authority publishes an open real-time feed yet) and the bot says so; estimated crowd data is always labeled *estimated*.

## Setup (all keys are free, no credit card)

1. **Telegram** — talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. **TomTom** — [developer.tomtom.com](https://developer.tomtom.com) → 2,500 requests/day free.
3. **HERE** — [platform.here.com](https://platform.here.com) → freemium ~30k transactions/month.
4. **Transitland** — [transit.land](https://www.transit.land/documentation) → free API key.
5. **BestTime** — [besttime.app](https://besttime.app) → private API key, ~100 free credits *(optional)*.
6. **Geoapify** — [geoapify.com](https://www.geoapify.com) → 3,000 requests/day free.
7. **Mapbox** — [mapbox.com](https://www.mapbox.com) → free static images tier (live-traffic map style).

Only `BOT_TOKEN` is strictly required — each missing key just disables one link in a fallback chain.

```bash
npm install
copy .dev.vars.example .dev.vars   # then paste your keys in
```

## Run locally (polling — easiest)

```bash
npm run dev:poll
```

Open your bot in Telegram, `/start`, share a location, tap buttons.

## Deploy to Cloudflare Workers (free tier)

```bash
npx wrangler login
npx wrangler kv namespace create PULSE_KV   # optional but recommended — paste id into wrangler.toml
npx wrangler secret put BOT_TOKEN           # repeat for TOMTOM_KEY, HERE_KEY, TRANSITLAND_KEY,
                                            # BESTTIME_KEY, GEOAPIFY_KEY, MAPBOX_TOKEN, WEBHOOK_SECRET
npm run deploy
```

Then point Telegram at your worker (replace values):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://uae-pulse-bot.<your-subdomain>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>"
```

Check it: `curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"`

## Develop & test

```bash
npm run typecheck
npm test
```

## Architecture

- **grammY** on Cloudflare Workers (webhook) or local polling (`src/poll.ts`)
- `src/core/fallback.ts` — generic provider chain (timeout / quota / error → next provider)
- `src/core/cache.ts` — Workers KV (or in-memory) read-through cache, geohash-keyed, to stretch free quotas
- `src/providers/*` — one file per external API; `src/services/*` — orchestration per feature
- BestTime spend is capped per month in KV; past the cap the bot silently downgrades to the estimated heuristic
