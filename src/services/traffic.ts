import type { Env } from "../config";
import { cached, type KVLike } from "../core/cache";
import { withFallback, type FallbackResult, type Provider } from "../core/fallback";
import { geohash } from "../core/geo";
import { hereTraffic } from "../providers/traffic/here";
import { tomtomTraffic } from "../providers/traffic/tomtom";
import { mapboxTrafficImage } from "../providers/map/mapboxStatic";
import { tomtomStaticImage } from "../providers/map/tomtomStatic";
import type { TrafficData } from "../types";

export async function getTraffic(
  env: Env,
  kv: KVLike,
  lat: number,
  lon: number,
): Promise<FallbackResult<TrafficData>> {
  const key = `cache:traffic:${geohash(lat, lon)}`;
  return cached(kv, key, 300, () => {
    const providers: Provider<TrafficData>[] = [];
    if (env.TOMTOM_KEY) {
      providers.push({ name: "TomTom", fn: () => tomtomTraffic(env.TOMTOM_KEY!, lat, lon) });
    }
    if (env.HERE_KEY) {
      providers.push({ name: "HERE", fn: () => hereTraffic(env.HERE_KEY!, lat, lon) });
    }
    if (providers.length === 0) throw new Error("no traffic API keys configured");
    return withFallback(providers);
  });
}

/** Map snapshot with live congestion coloring; null if no image source succeeds. */
export async function getTrafficMapImage(
  env: Env,
  lat: number,
  lon: number,
): Promise<{ provider: string; bytes: Uint8Array } | null> {
  const providers: Provider<Uint8Array>[] = [];
  if (env.MAPBOX_TOKEN) {
    providers.push({
      name: "Mapbox live traffic",
      fn: () => mapboxTrafficImage(env.MAPBOX_TOKEN!, lat, lon),
    });
  }
  if (env.TOMTOM_KEY) {
    providers.push({
      name: "TomTom map",
      fn: () => tomtomStaticImage(env.TOMTOM_KEY!, lat, lon),
    });
  }
  if (providers.length === 0) return null;
  try {
    const r = await withFallback(providers, 8000);
    return { provider: r.provider, bytes: r.data };
  } catch {
    return null;
  }
}
