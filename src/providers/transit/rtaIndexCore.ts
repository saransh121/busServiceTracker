import { haversineKm } from "../../core/geo";
import type { Departure, StopBoard, TransitData } from "../../types";

/** Shared shape of the local full index and the per-area shards. */
export interface RtaData {
  stops: Array<[string, number, number]>; // [name, lat, lon]
  routes: string[];
  headsigns: string[];
  deps: number[][]; // per stop: flat quadruples [dowMask, minute, routeIdx, headsignIdx, ...]
}

/**
 * Computes departure boards near a point from RTA index data.
 * dowMask bit0 = Monday; minutes are Asia/Dubai local (UTC+4, no DST).
 */
export function computeBoards(data: RtaData, lat: number, lon: number): TransitData {
  const dubaiNow = new Date(Date.now() + 4 * 3600_000);
  const dow = (dubaiNow.getUTCDay() + 6) % 7;
  const nowMin = dubaiNow.getUTCHours() * 60 + dubaiNow.getUTCMinutes();
  const windowEnd = nowMin + 60;

  const nearby = data.stops
    .map((s, i) => ({ i, name: s[0], distanceM: Math.round(haversineKm(lat, lon, s[1], s[2]) * 1000) }))
    .filter((s) => s.distanceM <= 700)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);
  if (nearby.length === 0) throw new Error("no RTA stops within 700 m");

  const boards: StopBoard[] = [];
  for (const stop of nearby) {
    const d = data.deps[stop.i] ?? [];
    const departures: Departure[] = [];
    for (let k = 0; k < d.length && departures.length < 3; k += 4) {
      const [mask, minute, r, h] = [d[k], d[k + 1], d[k + 2], d[k + 3]];
      if (minute < nowMin || minute > windowEnd) continue;
      if (!(mask & (1 << dow))) continue;
      departures.push({
        route: data.routes[r] ?? "Bus",
        headsign: data.headsigns[h] || undefined,
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

  return {
    kind: "departures",
    boards,
    note: "RTA scheduled times from open GTFS data (2025 timetable) — not live, may have changed.",
  };
}
