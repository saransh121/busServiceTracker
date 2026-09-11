const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash encode — precision 6 ≈ 1.2 km cell, good cache granularity. */
export function geohash(lat: number, lon: number, precision = 6): string {
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        lonMin = mid;
      } else {
        ch = ch << 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** Bounding box of `radiusKm` around a point. */
export function bboxAround(lat: number, lon: number, radiusKm: number): BBox {
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, minLon: lon - dLon, maxLat: lat + dLat, maxLon: lon + dLon };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type Emirate =
  | "Dubai"
  | "Abu Dhabi"
  | "Sharjah"
  | "Ajman"
  | "Umm Al Quwain"
  | "Ras Al Khaimah"
  | "Fujairah"
  | "UAE";

/**
 * Offline rough emirate detection (bbox order matters: small emirates first).
 * Used when reverse geocoding is unavailable; good enough to route transit providers.
 */
export function emirateFromCoords(lat: number, lon: number): Emirate {
  const boxes: Array<[Emirate, BBox]> = [
    ["Ajman", { minLat: 25.36, minLon: 55.4, maxLat: 25.46, maxLon: 55.56 }],
    ["Umm Al Quwain", { minLat: 25.46, minLon: 55.5, maxLat: 25.65, maxLon: 55.75 }],
    ["Sharjah", { minLat: 25.27, minLon: 55.35, maxLat: 25.42, maxLon: 55.65 }],
    ["Ras Al Khaimah", { minLat: 25.55, minLon: 55.75, maxLat: 26.1, maxLon: 56.15 }],
    ["Fujairah", { minLat: 25.0, minLon: 56.15, maxLat: 25.65, maxLon: 56.4 }],
    ["Dubai", { minLat: 24.79, minLon: 54.89, maxLat: 25.36, maxLon: 55.56 }],
    ["Abu Dhabi", { minLat: 22.6, minLon: 51.5, maxLat: 25.0, maxLon: 55.55 }],
  ];
  for (const [name, b] of boxes) {
    if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return name;
  }
  return "UAE";
}
