import { fetchOk } from "../../core/fallback";

/**
 * Live-traffic map snapshot (Google-Maps-style colored roads) using Mapbox's
 * navigation style, which renders real-time congestion. Returns PNG bytes.
 */
export async function mapboxTrafficImage(
  token: string,
  lat: number,
  lon: number,
): Promise<Uint8Array> {
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/static/` +
    `pin-l+e02020(${lon},${lat})/${lon},${lat},13.2,0/700x500` +
    `?access_token=${token}&attribution=false&logo=false`;
  const res = await fetchOk(url);
  return new Uint8Array(await res.arrayBuffer());
}
