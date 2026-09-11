import type { Webcam } from "../../types";

/**
 * Live webcams near the location via Windy's free webcams API v3 — the one
 * genuinely free real-world crowd signal: users can see the place with their
 * own eyes. Optional; returns [] when no key is configured or nothing found.
 */
export async function windyWebcams(
  key: string | undefined,
  lat: number,
  lon: number,
): Promise<Webcam[]> {
  if (!key) return [];
  try {
    const url =
      `https://api.windy.com/webcams/api/v3/webcams` +
      `?nearby=${lat},${lon},20&limit=3&include=urls,location&sortKey=distance`;
    const res = await fetch(url, { headers: { "x-windy-api-key": key } });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      webcams?: Array<{
        title?: string;
        webcamId?: number;
        urls?: { detail?: string };
        location?: { city?: string };
      }>;
    };
    return (json.webcams ?? [])
      .map((w) => ({
        title: w.title ?? w.location?.city ?? "Webcam",
        url: w.urls?.detail ?? (w.webcamId ? `https://windy.com/webcams/${w.webcamId}` : ""),
      }))
      .filter((w) => w.url !== "");
  } catch {
    return [];
  }
}
