import type { TransitData } from "../../types";
import { computeBoards, type RtaData } from "./rtaIndexCore";

/**
 * Keyless Dubai departures from the locally built RTA GTFS index
 * (data/rta-index.json.gz — see scripts/build-rta-index.mjs). Node-only:
 * on Cloudflare Workers the dynamic import of node:fs fails and the chain
 * moves on to the shard-based remote provider.
 */
let index: RtaData | null | undefined; // undefined = not tried, null = unavailable

// Constructed import keeps bundlers (wrangler/esbuild) from resolving node builtins
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

async function loadIndex(): Promise<RtaData | null> {
  if (index !== undefined) return index;
  try {
    const fs = await dynamicImport("node:fs");
    const zlib = await dynamicImport("node:zlib");
    const gz = fs.readFileSync("data/rta-index.json.gz");
    index = JSON.parse(zlib.gunzipSync(gz).toString("utf8")) as RtaData;
  } catch {
    index = null;
  }
  return index;
}

export async function rtaGtfsDepartures(lat: number, lon: number): Promise<TransitData> {
  const idx = await loadIndex();
  if (!idx) throw new Error("local RTA GTFS index not available");
  return computeBoards(idx, lat, lon);
}
