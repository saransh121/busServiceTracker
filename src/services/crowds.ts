import type { Env } from "../config";
import { cached, type KVLike } from "../core/cache";
import { withFallback, type FallbackResult, type Provider } from "../core/fallback";
import { geohash } from "../core/geo";
import { besttimeCrowds } from "../providers/crowds/besttime";
import { googleBusyCrowds } from "../providers/crowds/googleBusy";
import { heuristicCrowds } from "../providers/crowds/heuristic";
import { windyWebcams } from "../providers/crowds/windy";
import type { CrowdData, PlaceInfo, TrafficData } from "../types";

/**
 * Chain: BestTime live (real, budget-guarded) → Google busyness scrape
 * (real but unofficial "nuke option") → labeled estimate (Geoapify or keyless
 * OSM venues + traffic + time-of-day). Works with zero API keys.
 */
export async function getCrowds(
  env: Env,
  kv: KVLike,
  lat: number,
  lon: number,
  traffic?: TrafficData,
  place?: PlaceInfo,
): Promise<FallbackResult<CrowdData>> {
  const key = `cache:crowds:${geohash(lat, lon)}`;
  return cached(kv, key, 900, () => {
    const providers: Provider<CrowdData>[] = [];
    if (env.BESTTIME_KEY) {
      providers.push({
        name: "BestTime live",
        fn: () => besttimeCrowds(env.BESTTIME_KEY!, kv, lat, lon),
      });
    }
    providers.push({
      name: "Google busyness (unofficial)",
      fn: () => googleBusyCrowds(env.GEOAPIFY_KEY, lat, lon, place?.city ?? place?.emirate),
    });
    providers.push({
      name: "Estimated",
      fn: () => heuristicCrowds(env.GEOAPIFY_KEY, lat, lon, traffic),
    });
    // BestTime polls an async job and the scraper visits several pages
    return (async () => {
      const [result, webcams] = await Promise.all([
        withFallback(providers, 25000),
        windyWebcams(env.WINDY_KEY, lat, lon),
      ]);
      if (webcams.length > 0) result.data.webcams = webcams;
      return result;
    })();
  });
}
