import { bboxAround } from "../../core/geo";
import type { TrafficData, TrafficIncident } from "../../types";

/**
 * Keyless traffic from Waze's public live-map feed (unofficial — the same JSON
 * the waze.com live map loads; may change without notice). Jams carry a
 * severity `level` 0-5 and current speed; alerts become incidents.
 */
export async function wazeTraffic(lat: number, lon: number): Promise<TrafficData> {
  const b = bboxAround(lat, lon, 2.5);
  const url =
    `https://www.waze.com/live-map/api/georss` +
    `?bottom=${b.minLat}&left=${b.minLon}&right=${b.maxLon}&top=${b.maxLat}` +
    `&env=row&types=alerts,traffic`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      Referer: "https://www.waze.com/live-map",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    jams?: Array<{ speedKMH?: number; level?: number; street?: string; delay?: number }>;
    alerts?: Array<{ type?: string; subtype?: string; street?: string }>;
  };

  const jams = json.jams ?? [];
  const alerts = json.alerts ?? [];

  let flowRatio = 1;
  let currentSpeedKmh = 0;
  let freeFlowSpeedKmh = 0;
  if (jams.length > 0) {
    const avg = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
    const avgLevel = avg(jams.map((j) => j.level ?? 2));
    flowRatio = Math.max(0.1, 1 - avgLevel * 0.18);
    const speeds = jams.map((j) => j.speedKMH ?? 0).filter((s) => s > 0);
    if (speeds.length > 0) {
      currentSpeedKmh = Math.round(avg(speeds));
      freeFlowSpeedKmh = Math.round(currentSpeedKmh / flowRatio);
    }
  }

  const prettify = (s: string) =>
    s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const incidents: TrafficIncident[] = [
    ...jams
      .filter((j) => (j.level ?? 0) >= 3)
      .slice(0, 3)
      .map((j) => ({
        description: `Traffic jam (level ${j.level}/5)`,
        road: j.street,
        delaySec: j.delay && j.delay > 0 ? j.delay : undefined,
      })),
    ...alerts
      .filter((a) => a.type !== "JAM")
      .slice(0, 3)
      .map((a) => ({
        description: prettify(a.subtype || a.type || "Alert"),
        road: a.street,
      })),
  ].slice(0, 5);

  if (jams.length === 0 && alerts.length === 0) {
    // Feed answered but reported nothing at all — treat as clear roads
    return { flowRatio: 1, currentSpeedKmh: 0, freeFlowSpeedKmh: 0, incidents: [] };
  }
  return { flowRatio, currentSpeedKmh, freeFlowSpeedKmh, incidents };
}
