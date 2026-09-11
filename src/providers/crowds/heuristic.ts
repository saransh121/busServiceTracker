import type { CrowdData, CrowdVenue, TrafficData } from "../../types";
import { nearbyVenues } from "./venues";

/**
 * Free estimated crowding: popular POIs nearby (Geoapify, or keyless OSM)
 * ranked by how likely they are busy right now, boosted when live traffic
 * around the user is congested and when it's a UAE peak window (evenings,
 * Fri/Sat weekend). Always labeled "estimated".
 */
export async function heuristicCrowds(
  geoapifyKey: string | undefined,
  lat: number,
  lon: number,
  traffic?: TrafficData,
): Promise<CrowdData> {
  const found = await nearbyVenues(geoapifyKey, lat, lon, 10);

  // UAE rhythm: evenings busy every day; Fri/Sat are the weekend
  const now = new Date();
  const dubaiHour = (now.getUTCHours() + 4) % 24;
  const dubaiDay = new Date(now.getTime() + 4 * 3600_000).getUTCDay(); // 5=Fri 6=Sat
  const eveningBoost = dubaiHour >= 17 && dubaiHour <= 23 ? 25 : dubaiHour >= 12 ? 10 : 0;
  const weekendBoost = dubaiDay === 5 || dubaiDay === 6 ? 15 : 0;
  const congestionBoost = traffic ? Math.round((1 - traffic.flowRatio) * 40) : 0;
  const base = 30 + eveningBoost + weekendBoost + congestionBoost;

  const venues: CrowdVenue[] = found.slice(0, 6).map((v, i) => {
    const score = Math.min(95, base - i * 3);
    return {
      name: v.name,
      address: v.address,
      lat: v.lat,
      lon: v.lon,
      liveBusyness: score,
      unusuallyBusy: score >= 70,
      estimated: true,
    };
  });

  return {
    venues,
    estimated: true,
    note: "Estimated from local traffic + time of day (no live venue data available).",
  };
}
