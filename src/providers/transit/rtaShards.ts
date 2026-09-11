import type { TransitData } from "../../types";
import { computeBoards, type RtaData } from "./rtaIndexCore";

const SHARD_BASE =
  "https://raw.githubusercontent.com/saransh121/busServiceTracker/main/data/shards";

/**
 * Dubai departures for the Cloudflare Workers deployment: fetches the 3x3
 * 0.05°-grid shards around the user from this repo's GitHub raw (kept fresh by
 * the monthly refresh workflow), merges them, and computes boards. Small
 * per-shard payloads keep JSON parsing within Workers CPU limits.
 */
export async function rtaShardDepartures(lat: number, lon: number): Promise<TransitData> {
  const cy = Math.floor(lat * 20);
  const cx = Math.floor(lon * 20);
  const keys: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) keys.push(`${cy + dy}_${cx + dx}`);
  }

  const shards = await Promise.all(
    keys.map(async (k) => {
      try {
        const res = await fetch(`${SHARD_BASE}/${k}.json`);
        if (!res.ok) return null; // 404 = no stops in that cell
        return (await res.json()) as RtaData;
      } catch {
        return null;
      }
    }),
  );

  const merged: RtaData = { stops: [], routes: [], headsigns: [], deps: [] };
  for (const s of shards) {
    if (!s) continue;
    const routeOffset = merged.routes.length;
    const headOffset = merged.headsigns.length;
    merged.routes.push(...s.routes);
    merged.headsigns.push(...s.headsigns);
    for (let i = 0; i < s.stops.length; i++) {
      merged.stops.push(s.stops[i]);
      const d = s.deps[i] ?? [];
      const out: number[] = [];
      for (let k = 0; k < d.length; k += 4) {
        out.push(d[k], d[k + 1], d[k + 2] + routeOffset, d[k + 3] + headOffset);
      }
      merged.deps.push(out);
    }
  }
  if (merged.stops.length === 0) throw new Error("no RTA shard data for this area");
  return computeBoards(merged, lat, lon);
}
