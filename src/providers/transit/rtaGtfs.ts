import { haversineKm } from "../../core/geo";
import type { Departure, StopBoard, TransitData } from "../../types";

/**
 * Keyless Dubai departures from a locally built RTA GTFS index
 * (data/rta-index.json.gz — see scripts/build-rta-index.mjs). Node-only:
 * on Cloudflare Workers the dynamic import of node:fs fails and the chain
 * simply moves on to the next provider.
 */
interface RtaIndex {
  builtAt: string;
  stops: Array<[string, number, number]>;
  routes: string[];
  headsigns: string[];
  deps: number[][];
}

let index: RtaIndex | null | undefined; // undefined = not tried, null = unavailable

// Constructed import keeps bundlers (wrangler/esbuild) from resolving node builtins
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

async function loadIndex(): Promise<RtaIndex | null> {
  if (index !== undefined) return index;
  try {
    const fs = await dynamicImport("node:fs");
    const zlib = await dynamicImport("node:zlib");
    const gz = fs.readFileSync("data/rta-index.json.gz");
    index = JSON.parse(zlib.gunzipSync(gz).toString("utf8")) as RtaIndex;
  } catch {
    index = null;
  }
  return index;
}

export async function rtaGtfsDepartures(lat: number, lon: number): Promise<TransitData> {
  const idx = await loadIndex();
  if (!idx) throw new Error("local RTA GTFS index not available");

  // "now" in Asia/Dubai (UTC+4, no DST); dow bit0 = Monday
  const dubaiNow = new Date(Date.now() + 4 * 3600_000);
  const dow = (dubaiNow.getUTCDay() + 6) % 7;
  const nowMin = dubaiNow.getUTCHours() * 60 + dubaiNow.getUTCMinutes();
  const windowEnd = nowMin + 60;

  const nearby = idx.stops
    .map((s, i) => ({ i, name: s[0], distanceM: Math.round(haversineKm(lat, lon, s[1], s[2]) * 1000) }))
    .filter((s) => s.distanceM <= 700)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);
  if (nearby.length === 0) throw new Error("no RTA stops within 700 m");

  const boards: StopBoard[] = [];
  for (const stop of nearby) {
    const d = idx.deps[stop.i] ?? [];
    const departures: Departure[] = [];
    for (let k = 0; k < d.length && departures.length < 3; k += 4) {
      const [mask, minute, r, h] = [d[k], d[k + 1], d[k + 2], d[k + 3]];
      if (minute < nowMin || minute > windowEnd) continue;
      if (!(mask & (1 << dow))) continue;
      departures.push({
        route: idx.routes[r] ?? "Bus",
        headsign: idx.headsigns[h] || undefined,
        time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
        minutesAway: minute - nowMin,
        mode: "bus",
        realtime: false,
      });
    }
    if (departures.length > 0) {
      boards.push({ stopName: stop.name, distanceM: stop.distanceM, departures });
    }
    if (boards.length >= 3) break;
  }
  if (boards.length === 0) throw new Error("no scheduled departures in the next hour");

  const vintage = idx.builtAt?.slice(0, 4) ?? "";
  return {
    kind: "departures",
    boards,
    note: `RTA scheduled times from open GTFS data (2025 timetable${vintage ? `, indexed ${vintage}` : ""}) — not live, may have changed.`,
  };
}
