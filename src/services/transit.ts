import type { Env } from "../config";
import { cached, type KVLike } from "../core/cache";
import { withFallback, type FallbackResult, type Provider } from "../core/fallback";
import { geohash } from "../core/geo";
import { hereTransitDepartures } from "../providers/transit/hereTransit";
import { osmNearbyStops } from "../providers/transit/osmStops";
import { transitlandDepartures } from "../providers/transit/transitland";
import type { TransitData } from "../types";

/**
 * Provider order depends on the emirate: Dubai has an open GTFS feed served by
 * Transitland; everywhere else HERE Transit leads. OSM stop names are the
 * universal last resort.
 */
export async function getTransit(
  env: Env,
  kv: KVLike,
  lat: number,
  lon: number,
  emirate: string,
): Promise<FallbackResult<TransitData>> {
  const key = `cache:transit:${geohash(lat, lon, 7)}`;
  return cached(kv, key, 600, () => {
    const providers: Provider<TransitData>[] = [];
    const transitland: Provider<TransitData> | null = env.TRANSITLAND_KEY
      ? { name: "Transitland (RTA GTFS)", fn: () => transitlandDepartures(env.TRANSITLAND_KEY!, lat, lon) }
      : null;
    const here: Provider<TransitData> | null = env.HERE_KEY
      ? { name: "HERE Transit", fn: () => hereTransitDepartures(env.HERE_KEY!, lat, lon) }
      : null;

    if (/dubai/i.test(emirate)) {
      if (transitland) providers.push(transitland);
      if (here) providers.push(here);
    } else {
      if (here) providers.push(here);
      if (transitland) providers.push(transitland);
    }
    providers.push({ name: "OpenStreetMap", fn: () => osmNearbyStops(lat, lon) });
    return withFallback(providers, 8000);
  });
}
