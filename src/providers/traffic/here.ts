import { fetchOk } from "../../core/fallback";
import type { TrafficData, TrafficIncident } from "../../types";

export async function hereTraffic(key: string, lat: number, lon: number): Promise<TrafficData> {
  const flowUrl =
    `https://data.traffic.hereapi.com/v7/flow` +
    `?locationReferencing=none&in=circle:${lat},${lon};r=2000&apiKey=${key}`;
  const flowRes = await fetchOk(flowUrl);
  const flow = (await flowRes.json()) as {
    results?: Array<{ currentFlow?: { speed?: number; freeFlow?: number } }>;
  };
  const segs = (flow.results ?? [])
    .map((r) => r.currentFlow)
    .filter((f): f is { speed: number; freeFlow: number } => !!f && f.speed != null && !!f.freeFlow);
  if (segs.length === 0) throw new Error("no flow data in area");

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const currentSpeedKmh = Math.round(avg(segs.map((s) => s.speed)) * 3.6);
  const freeFlowSpeedKmh = Math.round(avg(segs.map((s) => s.freeFlow)) * 3.6);

  let incidents: TrafficIncident[] = [];
  try {
    const incUrl =
      `https://data.traffic.hereapi.com/v7/incidents` +
      `?locationReferencing=none&in=circle:${lat},${lon};r=2500&apiKey=${key}`;
    const incRes = await fetchOk(incUrl);
    const inc = (await incRes.json()) as {
      results?: Array<{
        incidentDetails?: { description?: { value?: string }; roadNumbers?: string[] };
      }>;
    };
    incidents = (inc.results ?? []).slice(0, 5).map((r) => ({
      description: r.incidentDetails?.description?.value ?? "Incident",
      road: r.incidentDetails?.roadNumbers?.join(", "),
    }));
  } catch {
    // flow alone is enough
  }

  return {
    flowRatio: freeFlowSpeedKmh > 0 ? Math.min(1, currentSpeedKmh / freeFlowSpeedKmh) : 1,
    currentSpeedKmh,
    freeFlowSpeedKmh,
    incidents,
  };
}
