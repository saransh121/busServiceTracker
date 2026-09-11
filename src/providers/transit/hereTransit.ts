import { fetchOk } from "../../core/fallback";
import type { Departure, StopBoard, TransitData } from "../../types";

/** Next departures from HERE Public Transit API v8 (coverage varies by city). */
export async function hereTransitDepartures(
  key: string,
  lat: number,
  lon: number,
): Promise<TransitData> {
  const url =
    `https://transit.hereapi.com/v8/departures` +
    `?in=${lat},${lon};r=700&maxPlaces=4&maxPerBoard=3&apiKey=${key}`;
  const res = await fetchOk(url);
  const json = (await res.json()) as {
    boards?: Array<{
      place?: { name?: string; distance?: number };
      departures?: Array<{
        time?: string;
        delay?: number;
        transport?: { mode?: string; name?: string; headsign?: string };
      }>;
    }>;
  };
  const boards: StopBoard[] = (json.boards ?? [])
    .map((b) => {
      const departures: Departure[] = (b.departures ?? [])
        .map((d): Departure | null => {
          if (!d.time) return null;
          const dt = new Date(d.time);
          const minutesAway = Math.round((dt.getTime() - Date.now()) / 60000);
          return {
            route: d.transport?.name ?? d.transport?.mode ?? "Transit",
            headsign: d.transport?.headsign,
            time: dt.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Dubai",
            }),
            minutesAway: minutesAway >= 0 ? minutesAway : undefined,
            mode: d.transport?.mode,
            realtime: d.delay != null,
          };
        })
        .filter((d): d is Departure => d !== null);
      return { stopName: b.place?.name ?? "Stop", distanceM: b.place?.distance, departures };
    })
    .filter((b) => b.departures.length > 0);

  if (boards.length === 0) throw new Error("no departures found");
  return { kind: "departures", boards };
}
