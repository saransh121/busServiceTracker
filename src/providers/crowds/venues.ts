import { fetchOk } from "../../core/fallback";
import { USER_AGENT } from "../../config";

export interface VenueLite {
  name: string;
  address?: string;
  lat?: number;
  lon?: number;
}

/**
 * Nearby notable venues: Geoapify when a key exists, otherwise keyless
 * OpenStreetMap (Overpass). Shared by the crowd providers.
 */
export async function nearbyVenues(
  geoapifyKey: string | undefined,
  lat: number,
  lon: number,
  limit = 10,
): Promise<VenueLite[]> {
  if (geoapifyKey) {
    try {
      const categories =
        "commercial.shopping_mall,catering.restaurant,catering.cafe,entertainment,tourism.attraction";
      const url =
        `https://api.geoapify.com/v2/places` +
        `?categories=${categories}&filter=circle:${lon},${lat},1800&limit=${limit}&apiKey=${geoapifyKey}`;
      const res = await fetchOk(url);
      const json = (await res.json()) as {
        features?: Array<{
          properties?: { name?: string; address_line2?: string; lat?: number; lon?: number };
        }>;
      };
      const venues = (json.features ?? [])
        .filter((f) => f.properties?.name)
        .map((f) => ({
          name: f.properties!.name!,
          address: f.properties?.address_line2,
          lat: f.properties?.lat,
          lon: f.properties?.lon,
        }));
      if (venues.length > 0) return venues;
    } catch {
      // fall through to OSM
    }
  }

  const query = `[out:json][timeout:8];(
    nwr(around:1800,${lat},${lon})[shop=mall][name];
    nwr(around:1800,${lat},${lon})[amenity~"^(restaurant|cafe|food_court)$"][name];
    nwr(around:1800,${lat},${lon})[tourism~"^(attraction|museum|theme_park)$"][name];
  );out center ${limit * 2};`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: { name?: string; shop?: string; tourism?: string };
    }>;
  };
  const seen = new Set<string>();
  const venues: VenueLite[] = [];
  // malls and attractions first — they are the crowd magnets
  const els = (json.elements ?? []).sort((a, b) => {
    const rank = (t?: { shop?: string; tourism?: string }) => (t?.shop || t?.tourism ? 0 : 1);
    return rank(a.tags) - rank(b.tags);
  });
  for (const e of els) {
    const name = e.tags?.name;
    if (name && !seen.has(name)) {
      seen.add(name);
      venues.push({ name, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon });
      if (venues.length >= limit) break;
    }
  }
  if (venues.length === 0) throw new Error("no notable venues nearby");
  return venues;
}
