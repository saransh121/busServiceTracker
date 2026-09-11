import type { CrowdData, CrowdVenue } from "../../types";
import { nearbyVenues } from "./venues";

/**
 * NUKE OPTION — unofficial scrape of Google's "how busy is it now" numbers
 * from the public search results page ("Currently X% busy" / "Usually X% busy"
 * aria labels). No API key, but it violates Google's ToS and can break or get
 * rate-limited at any time, so it sits at the very end of the crowd chain and
 * is clearly labeled in the reply. Personal-use scale only: max 4 lookups per
 * request, results cached like every other provider.
 */
class BlockedError extends Error {}

export async function googleBusyCrowds(
  geoapifyKey: string | undefined,
  lat: number,
  lon: number,
  cityHint?: string,
): Promise<CrowdData> {
  const venues = (await nearbyVenues(geoapifyKey, lat, lon, 6)).slice(0, 4);

  const results: CrowdVenue[] = [];
  for (const v of venues) {
    try {
      const q = encodeURIComponent(`${v.name} ${cityHint ?? "UAE"}`);
      const res = await fetch(`https://www.google.com/search?q=${q}&hl=en&gl=ae`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      // Google serves a CAPTCHA "sorry" page to suspected bots — when that
      // happens no venue will succeed, so bail out to the next provider fast.
      if (res.status === 429 || res.url.includes("/sorry")) {
        throw new BlockedError("Google is captcha-blocking this network");
      }
      if (!res.ok) continue;
      const html = await res.text();

      const liveMatch = html.match(/Currently (\d{1,3})% busy/i);
      const usualMatch = html.match(/Usually (\d{1,3})% busy/i);
      const busierText = /busier than usual/i.test(html);
      const live = liveMatch ? Number(liveMatch[1]) : undefined;
      const usual = usualMatch ? Number(usualMatch[1]) : undefined;
      if (live == null && !busierText) continue;

      results.push({
        name: v.name,
        address: v.address,
        liveBusyness: live,
        usualBusyness: usual,
        unusuallyBusy:
          busierText || (live != null && usual != null ? live >= usual + 15 : (live ?? 0) >= 75),
        estimated: false,
      });
    } catch (e) {
      // a network-wide captcha block means no venue will succeed — give up now
      if (e instanceof BlockedError) throw e;
      // otherwise one venue failing is fine — keep scanning
    }
    // be gentle: small gap between lookups
    await new Promise((r) => setTimeout(r, 700));
  }

  if (results.length === 0) throw new Error("no live busyness found on Google");
  results.sort((a, b) => (b.liveBusyness ?? 0) - (a.liveBusyness ?? 0));
  return {
    venues: results,
    estimated: false,
    note: "Unofficial Google busyness (scraped) — best effort, may break anytime.",
  };
}
