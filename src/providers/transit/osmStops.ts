import { USER_AGENT } from "../../config";
import { haversineKm } from "../../core/geo";
import type { StopBoard, TransitData } from "../../types";

/**
 * Last-resort transit info: nearest stops/stations from OpenStreetMap (Overpass).
 * No times available — the bot pairs this with links to official apps.
 */
export async function osmNearbyStops(lat: number, lon: number): Promise<TransitData> {
  const query = `[out:json][timeout:8];(
    node(around:800,${lat},${lon})[highway=bus_stop];
    node(around:800,${lat},${lon})[public_transport=platform];
    node(around:1500,${lat},${lon})[railway=station];
  );out body 12;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    elements?: Array<{ lat: number; lon: number; tags?: { name?: string; railway?: string } }>;
  };
  const seen = new Set<string>();
  const boards: StopBoard[] = (json.elements ?? [])
    .map((e) => ({
      stopName: e.tags?.name ?? (e.tags?.railway ? "Station" : "Bus stop"),
      distanceM: Math.round(haversineKm(lat, lon, e.lat, e.lon) * 1000),
      departures: [],
    }))
    .filter((b) => {
      if (seen.has(b.stopName)) return false;
      seen.add(b.stopName);
      return true;
    })
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, 5);

  if (boards.length === 0) throw new Error("no stops in OSM nearby");
  return {
    kind: "stops-only",
    boards,
    note: "Live departure times unavailable — check S'hail (Dubai) or Darb (Abu Dhabi) apps.",
  };
}
