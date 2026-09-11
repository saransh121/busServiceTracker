import { BESTTIME_MONTHLY_BUDGET } from "../../config";
import type { KVLike } from "../../core/cache";
import { QuotaError } from "../../core/fallback";
import type { CrowdData, CrowdVenue } from "../../types";

const VENUES_PER_SEARCH = 6;

async function chargeBudget(kv: KVLike): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const key = `budget:besttime:${month}`;
  const spent = Number((await kv.get(key)) ?? "0");
  if (spent + VENUES_PER_SEARCH > BESTTIME_MONTHLY_BUDGET) {
    throw new QuotaError(`BestTime monthly budget exhausted (${spent} credits used)`);
  }
  // ~40 day TTL so the counter dies after the month ends
  await kv.put(key, String(spent + VENUES_PER_SEARCH), { expirationTtl: 40 * 24 * 3600 });
}

interface BestTimeVenue {
  venue_name?: string;
  venue_address?: string;
  venue_foot_traffic_live?: number;
  venue_foot_traffic_forecast?: number;
  venue_live_busyness?: number;
  venue_live_busyness_available?: boolean;
  venue_forecasted_busyness?: number;
}

function parseVenues(raw: unknown): CrowdVenue[] {
  const list = (raw as { venues?: BestTimeVenue[] }).venues ?? [];
  return list
    .map((v): CrowdVenue | null => {
      const live = v.venue_live_busyness ?? v.venue_foot_traffic_live;
      const usual = v.venue_forecasted_busyness ?? v.venue_foot_traffic_forecast;
      if (live == null) return null;
      return {
        name: v.venue_name ?? "Venue",
        address: v.venue_address,
        liveBusyness: live,
        usualBusyness: usual,
        unusuallyBusy: usual != null ? live >= usual + 15 : live >= 75,
        estimated: false,
      };
    })
    .filter((v): v is CrowdVenue => v !== null)
    .sort((a, b) => (b.liveBusyness ?? 0) - (a.liveBusyness ?? 0));
}

/**
 * BestTime.app live foot traffic. Venue Search is asynchronous: kick off a job,
 * poll its progress link, then read live busyness per venue. Costs credits, so
 * a monthly KV budget guard throws QuotaError → the free heuristic takes over.
 */
export async function besttimeCrowds(
  privateKey: string,
  kv: KVLike,
  lat: number,
  lon: number,
): Promise<CrowdData> {
  await chargeBudget(kv);

  const params = new URLSearchParams({
    api_key_private: privateKey,
    q: "busy restaurants, malls, cafes and attractions",
    lat: String(lat),
    lng: String(lon),
    radius: "1500",
    num: String(VENUES_PER_SEARCH),
    fast: "true",
    live: "true",
    format: "raw",
  });
  const start = await fetch(`https://besttime.app/api/v1/venues/search?${params}`, {
    method: "POST",
  });
  if (!start.ok) {
    if (start.status === 402 || start.status === 429) throw new QuotaError(`HTTP ${start.status}`);
    throw new Error(`HTTP ${start.status}`);
  }
  const job = (await start.json()) as {
    job_id?: string;
    collection_id?: string;
    _links?: { venue_search_progress?: string };
    venues?: unknown[];
  };

  // Some fast responses return venues immediately
  if (Array.isArray(job.venues) && job.venues.length > 0) {
    const venues = parseVenues(job);
    if (venues.length > 0) return { venues, estimated: false };
  }

  const progressUrl = job._links?.venue_search_progress;
  if (!progressUrl) throw new Error("no progress link from BestTime");

  for (let i = 0; i < 7; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(progressUrl);
    if (!res.ok) continue;
    const p = (await res.json()) as { job_finished?: boolean; venues?: unknown[] };
    if (p.job_finished) {
      const venues = parseVenues(p);
      if (venues.length === 0) throw new Error("no live crowd data for nearby venues");
      return { venues, estimated: false };
    }
  }
  throw new Error("BestTime search did not finish in time");
}
