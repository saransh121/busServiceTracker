import { fetchOk } from "../../core/fallback";
import type { Departure, StopBoard, TransitData } from "../../types";

const TZ = "Asia/Dubai";

function toLocalHHMM(serviceDate: string, hms: string): { time: string; minutesAway?: number } {
  // GTFS times can exceed 24h ("25:10:00" = 1:10 AM next day)
  const [h, m] = hms.split(":").map(Number);
  const [y, mo, d] = serviceDate.split("-").map(Number);
  // service date is in Gulf Standard Time (UTC+4, no DST)
  const utcMs = Date.UTC(y, mo - 1, d, h - 4, m);
  const dt = new Date(utcMs);
  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const minutesAway = Math.round((utcMs - Date.now()) / 60000);
  return { time, minutesAway: minutesAway >= 0 && minutesAway < 24 * 60 ? minutesAway : undefined };
}

/** Dubai RTA scheduled departures via Transitland (static GTFS — labeled as scheduled). */
export async function transitlandDepartures(
  apiKey: string,
  lat: number,
  lon: number,
): Promise<TransitData> {
  const stopsUrl =
    `https://transit.land/api/v2/rest/stops` +
    `?lat=${lat}&lon=${lon}&radius=700&limit=6&apikey=${apiKey}`;
  const stopsRes = await fetchOk(stopsUrl);
  const stopsJson = (await stopsRes.json()) as {
    stops?: Array<{ onestop_id?: string; id?: number; stop_name?: string }>;
  };
  const stops = (stopsJson.stops ?? []).filter((s) => s.onestop_id || s.id).slice(0, 4);
  if (stops.length === 0) throw new Error("no stops nearby");

  const boards: StopBoard[] = [];
  for (const stop of stops) {
    const key = stop.onestop_id ?? String(stop.id);
    try {
      const depUrl =
        `https://transit.land/api/v2/rest/stops/${encodeURIComponent(key)}/departures` +
        `?next=3600&limit=5&apikey=${apiKey}`;
      const depRes = await fetchOk(depUrl);
      const depJson = (await depRes.json()) as {
        stops?: Array<{
          stop_name?: string;
          departures?: Array<{
            service_date?: string;
            departure_time?: string;
            departure?: { scheduled?: string };
            trip?: {
              trip_headsign?: string;
              route?: { route_short_name?: string; route_long_name?: string };
            };
          }>;
        }>;
      };
      const s = depJson.stops?.[0];
      const departures: Departure[] = (s?.departures ?? [])
        .map((d): Departure | null => {
          const hms = d.departure_time ?? d.departure?.scheduled;
          if (!hms || !d.service_date) return null;
          const { time, minutesAway } = toLocalHHMM(d.service_date, hms);
          return {
            route:
              d.trip?.route?.route_short_name ?? d.trip?.route?.route_long_name ?? "Bus",
            headsign: d.trip?.trip_headsign,
            time,
            minutesAway,
            mode: "bus",
            realtime: false,
          };
        })
        .filter((d): d is Departure => d !== null)
        .slice(0, 3);
      if (departures.length > 0) {
        boards.push({ stopName: s?.stop_name ?? stop.stop_name ?? "Stop", departures });
      }
    } catch {
      // skip stop on error
    }
    if (boards.length >= 3) break;
  }

  if (boards.length === 0) throw new Error("no departures in the next hour");
  return { kind: "departures", boards, note: "Scheduled times (Dubai RTA GTFS) — not live." };
}
