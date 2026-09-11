import { fetchOk } from "../../core/fallback";
import { bboxAround } from "../../core/geo";
import type { TrafficData, TrafficIncident } from "../../types";

const ICON_CATEGORY: Record<number, string> = {
  1: "Accident",
  2: "Fog",
  3: "Dangerous conditions",
  4: "Rain",
  5: "Ice",
  6: "Jam",
  7: "Lane closed",
  8: "Road closed",
  9: "Road works",
  10: "Wind",
  11: "Flooding",
  14: "Broken-down vehicle",
};

export async function tomtomTraffic(key: string, lat: number, lon: number): Promise<TrafficData> {
  const flowUrl =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?point=${lat},${lon}&unit=KMPH&key=${key}`;
  const flowRes = await fetchOk(flowUrl);
  const flow = (await flowRes.json()) as {
    flowSegmentData: { currentSpeed: number; freeFlowSpeed: number };
  };
  const { currentSpeed, freeFlowSpeed } = flow.flowSegmentData;

  const b = bboxAround(lat, lon, 2.5);
  const fields =
    "{incidents{properties{iconCategory,delay,from,to,events{description}}}}";
  const incUrl =
    `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?key=${key}&bbox=${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}` +
    `&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`;

  let incidents: TrafficIncident[] = [];
  try {
    const incRes = await fetchOk(incUrl);
    const inc = (await incRes.json()) as {
      incidents?: Array<{
        properties?: {
          iconCategory?: number;
          delay?: number;
          from?: string;
          to?: string;
          events?: Array<{ description?: string }>;
        };
      }>;
    };
    incidents = (inc.incidents ?? []).slice(0, 5).map((i) => {
      const p = i.properties ?? {};
      const kind =
        p.events?.[0]?.description ?? ICON_CATEGORY[p.iconCategory ?? -1] ?? "Incident";
      return {
        description: kind,
        road: p.from && p.to ? `${p.from} → ${p.to}` : p.from,
        delaySec: p.delay,
      };
    });
  } catch {
    // incident endpoint failing shouldn't sink the whole provider — flow is the core signal
  }

  return {
    flowRatio: freeFlowSpeed > 0 ? Math.min(1, currentSpeed / freeFlowSpeed) : 1,
    currentSpeedKmh: currentSpeed,
    freeFlowSpeedKmh: freeFlowSpeed,
    incidents,
  };
}
