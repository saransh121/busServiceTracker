import type { Env } from "../config";
import { cached, type KVLike } from "../core/cache";
import { withFallback, type Provider } from "../core/fallback";
import { emirateFromCoords, geohash } from "../core/geo";
import { nominatimReverse } from "../providers/geocode/nominatim";
import { tomtomReverse } from "../providers/geocode/tomtomReverse";
import type { PlaceInfo } from "../types";

export async function getPlace(env: Env, kv: KVLike, lat: number, lon: number): Promise<PlaceInfo> {
  const key = `cache:place:${geohash(lat, lon)}`;
  return cached(kv, key, 7 * 24 * 3600, async () => {
    const providers: Provider<PlaceInfo>[] = [
      { name: "Nominatim", fn: () => nominatimReverse(lat, lon) },
    ];
    if (env.TOMTOM_KEY) {
      providers.push({ name: "TomTom", fn: () => tomtomReverse(env.TOMTOM_KEY!, lat, lon) });
    }
    try {
      const r = await withFallback(providers, 5000);
      return r.data;
    } catch {
      return { emirate: emirateFromCoords(lat, lon) };
    }
  });
}
