import { fetchOk } from "../../core/fallback";
import type { PlaceInfo } from "../../types";

export async function tomtomReverse(key: string, lat: number, lon: number): Promise<PlaceInfo> {
  const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${key}`;
  const res = await fetchOk(url);
  const json = (await res.json()) as {
    addresses?: Array<{
      address?: {
        municipalitySubdivision?: string;
        municipality?: string;
        countrySubdivision?: string;
      };
    }>;
  };
  const a = json.addresses?.[0]?.address ?? {};
  return {
    area: a.municipalitySubdivision,
    city: a.municipality,
    emirate: a.countrySubdivision ?? "UAE",
  };
}
