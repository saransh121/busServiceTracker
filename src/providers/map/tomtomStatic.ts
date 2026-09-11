import { fetchOk } from "../../core/fallback";

/** Base-map snapshot from TomTom (no traffic overlay — used as visual fallback). */
export async function tomtomStaticImage(
  key: string,
  lat: number,
  lon: number,
): Promise<Uint8Array> {
  const url =
    `https://api.tomtom.com/map/1/staticimage` +
    `?key=${key}&center=${lon},${lat}&zoom=13&width=700&height=500&format=png&view=Unified`;
  const res = await fetchOk(url);
  return new Uint8Array(await res.arrayBuffer());
}
