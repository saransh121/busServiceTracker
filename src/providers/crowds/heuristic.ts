import { fetchOk } from "../../core/fallback";
import type { CrowdData, CrowdVenue, TrafficData } from "../../types";

/**
 * Free estimated crowding: popular POIs nearby (Geoapify) ranked by how likely
 * they are busy right now, boosted when live traffic around the user is
 * congested and when it's a UAE peak window (evenings, weekends).
 * Always labeled "estimated".
 */
export async function heuristicCrowds(
  geoapifyKey: string,
  lat: number,
  lon: number,
  traffic?: TrafficData,
): Promise<CrowdData> {
  const categories =
    "commercial.shopping_mall,catering.restaurant,catering.cafe,entertainment,tourism.attraction";
  const url =
    `https://api.geoapify.com/v2/places` +
    `?categories=${categories}&filter=circle:${lon},${lat},1800&limit=10&apiKey=${geoapifyKey}`;
  const res = await fetchOk(url);
  const json = (await res.json()) as {
    features?: Array<{
      properties?: { name?: string; address_line2?: string; categories?: string[] };
    }>;
  };

  // UAE rhythm: evenings busy every day; Fri/Sat are the weekend
  const now = new Date();
  const dubaiHour = (now.getUTCHours() + 4) % 24;
  const dubaiDay = new Date(now.getTime() + 4 * 3600_000).getUTCDay(); // 5=Fri 6=Sat
  const eveningBoost = dubaiHour >= 17 && dubaiHour <= 23 ? 25 : dubaiHour >= 12 ? 10 : 0;
  const weekendBoost = dubaiDay === 5 || dubaiDay === 6 ? 15 : 0;
  const congestionBoost = traffic ? Math.round((1 - traffic.flowRatio) * 40) : 0;
  const base = 30 + eveningBoost + weekendBoost + congestionBoost;

  const venues: CrowdVenue[] = (json.features ?? [])
    .filter((f) => f.properties?.name)
    .slice(0, 6)
    .map((f, i) => {
      const score = Math.min(95, base - i * 3);
      return {
        name: f.properties!.name!,
        address: f.properties?.address_line2,
        liveBusyness: score,
        unusuallyBusy: score >= 70,
        estimated: true,
      };
    });

  if (venues.length === 0) throw new Error("no notable venues nearby");
  return {
    venues,
    estimated: true,
    note: "Estimated from local traffic + time of day (no live venue data available).",
  };
}
