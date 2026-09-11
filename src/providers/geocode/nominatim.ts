import { USER_AGENT } from "../../config";
import type { PlaceInfo } from "../../types";

export async function nominatimReverse(lat: number, lon: number): Promise<PlaceInfo> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=en`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    address?: {
      suburb?: string;
      neighbourhood?: string;
      city?: string;
      town?: string;
      state?: string;
    };
  };
  const a = json.address ?? {};
  return {
    area: a.suburb ?? a.neighbourhood,
    city: a.city ?? a.town,
    emirate: a.state ?? "UAE",
  };
}
