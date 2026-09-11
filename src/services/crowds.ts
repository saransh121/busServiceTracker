import type { Env } from "../config";
import { cached, type KVLike } from "../core/cache";
import { withFallback, type FallbackResult, type Provider } from "../core/fallback";
import { geohash } from "../core/geo";
import { besttimeCrowds } from "../providers/crowds/besttime";
import { heuristicCrowds } from "../providers/crowds/heuristic";
import type { CrowdData, TrafficData } from "../types";

export async function getCrowds(
  env: Env,
  kv: KVLike,
  lat: number,
  lon: number,
  traffic?: TrafficData,
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
    if (env.GEOAPIFY_KEY) {
      providers.push({
        name: "Estimated (Geoapify + traffic)",
        fn: () => heuristicCrowds(env.GEOAPIFY_KEY!, lat, lon, traffic),
      });
    }
    if (providers.length === 0) throw new Error("no crowd data keys configured");
    // BestTime polls its async job, so allow a generous timeout
    return withFallback(providers, 25000);
  });
}
