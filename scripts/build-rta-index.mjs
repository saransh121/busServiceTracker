/**
 * Builds a compact departure index (data/rta-index.json.gz) from the Dubai RTA
 * GTFS feed, so the bot can serve Dubai departures with zero API keys.
 *
 * Get the feed (openly republished from Dubai Pulse open data):
 *   curl -L -o gtfs.zip "https://gitlab.com/Lach-anonym/dubai-gtfs/-/jobs/artifacts/main/raw/gtfs.zip?job=download-republish-gtfs"
 *   unzip gtfs.zip -d gtfs/
 *   node scripts/build-rta-index.mjs gtfs/
 *
 * Index format (arrays for compactness):
 *   stops:     [[name, lat, lon], ...]
 *   routes:    ["F11", ...]
 *   headsigns: ["Gold Souq", ...]
 *   deps:      per stop, flat quadruples [dowMask, minuteOfDay, routeIdx, headsignIdx, ...]
 *   dowMask bit0 = Monday ... bit6 = Sunday
 */
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/build-rta-index.mjs <extracted-gtfs-dir>");
  process.exit(1);
}

/** Minimal CSV line parser (handles quoted fields with commas). */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  const text = readFileSync(`${dir}/${file}`, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const vals = parseCsvLine(l);
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = vals[i]));
    return row;
  });
}

console.log("reading calendar.txt / routes.txt / trips.txt / stops.txt …");

// service_id -> weekday bitmask (bit0=Monday)
const serviceMask = new Map();
for (const r of readCsv("calendar.txt")) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  let mask = 0;
  days.forEach((d, i) => {
    if (r[d] === "1") mask |= 1 << i;
  });
  serviceMask.set(r.service_id, mask);
}

const routeName = new Map();
for (const r of readCsv("routes.txt")) {
  routeName.set(r.route_id, r.route_short_name || r.route_long_name || "Bus");
}

// trip_id -> [routeIdx, serviceMask, headsignIdx]
const routes = [];
const routeIdx = new Map();
const headsigns = [];
const headsignIdx = new Map();
const intern = (arr, map, v) => {
  if (!map.has(v)) {
    map.set(v, arr.length);
    arr.push(v);
  }
  return map.get(v);
};
const trips = new Map();
for (const t of readCsv("trips.txt")) {
  const mask = serviceMask.get(t.service_id) ?? 0;
  if (mask === 0) continue;
  trips.set(t.trip_id, [
    intern(routes, routeIdx, routeName.get(t.route_id) ?? "Bus"),
    mask,
    intern(headsigns, headsignIdx, t.trip_headsign ?? ""),
  ]);
}

const stops = [];
const stopIdx = new Map();
for (const s of readCsv("stops.txt")) {
  const lat = Number(s.stop_lat);
  const lon = Number(s.stop_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  stopIdx.set(s.stop_id, stops.length);
  stops.push([s.stop_name ?? "Stop", Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
}
console.log(`${stops.length} stops, ${trips.size} trips, ${routes.length} routes`);

console.log("streaming stop_times.txt …");
const deps = stops.map(() => []);
let header = null;
let col = {};
let rows = 0;

const rl = createInterface({ input: createReadStream(`${dir}/stop_times.txt`) });
for await (const raw of rl) {
  const line = raw.replace(/^﻿/, "");
  if (!header) {
    header = parseCsvLine(line);
    header.forEach((h, i) => (col[h.trim()] = i));
    continue;
  }
  if (!line) continue;
  const v = parseCsvLine(line);
  const tripInfo = trips.get(v[col.trip_id]);
  const si = stopIdx.get(v[col.stop_id]);
  const time = v[col.departure_time];
  if (!tripInfo || si === undefined || !time) continue;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
  let minute = h * 60 + m;
  let mask = tripInfo[1];
  if (minute >= 1440) {
    // "25:10" = next calendar day — shift the weekday mask forward one day
    minute -= 1440;
    mask = ((mask << 1) | (mask >> 6)) & 0x7f;
  }
  deps[si].push(mask, minute, tripInfo[0], tripInfo[2]);
  if (++rows % 500000 === 0) console.log(`  ${rows} rows`);
}
console.log(`${rows} stop_times processed`);

// sort each stop's quadruples by minute for fast scanning
for (const d of deps) {
  const quads = [];
  for (let i = 0; i < d.length; i += 4) quads.push(d.slice(i, i + 4));
  quads.sort((a, b) => a[1] - b[1]);
  d.length = 0;
  for (const q of quads) d.push(...q);
}

const index = {
  builtAt: new Date().toISOString(),
  source: "Dubai RTA GTFS (Dubai Pulse open data, unofficial republish)",
  stops,
  routes,
  headsigns,
  deps,
};

mkdirSync("data", { recursive: true });
const gz = gzipSync(JSON.stringify(index), { level: 9 });
writeFileSync("data/rta-index.json.gz", gz);
console.log(`wrote data/rta-index.json.gz (${(gz.length / 1e6).toFixed(1)} MB gzipped)`);

// ── Per-area shards for the Cloudflare Workers deployment ────────────────────
// Cell key = floor(lat*20)_floor(lon*20) (0.05° ≈ 5.5 km squares). The Worker
// fetches the 3x3 cells around the user from GitHub raw — each shard is small
// enough to parse within Workers CPU limits, unlike the full index.
rmSync("data/shards", { recursive: true, force: true });
mkdirSync("data/shards", { recursive: true });
const cells = new Map(); // key -> stop indices
stops.forEach(([, lat, lon], i) => {
  if (deps[i].length === 0) return;
  const key = `${Math.floor(lat * 20)}_${Math.floor(lon * 20)}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(i);
});
let shardCount = 0;
for (const [key, stopIdxs] of cells) {
  // re-intern routes/headsigns locally so each shard is self-contained
  const localRoutes = [];
  const localRouteIdx = new Map();
  const localHeads = [];
  const localHeadIdx = new Map();
  const shardStops = [];
  const shardDeps = [];
  for (const i of stopIdxs) {
    shardStops.push(stops[i]);
    const d = deps[i];
    const out = [];
    for (let k = 0; k < d.length; k += 4) {
      out.push(
        d[k],
        d[k + 1],
        intern(localRoutes, localRouteIdx, routes[d[k + 2]]),
        intern(localHeads, localHeadIdx, headsigns[d[k + 3]]),
      );
    }
    shardDeps.push(out);
  }
  writeFileSync(
    `data/shards/${key}.json`,
    JSON.stringify({ routes: localRoutes, headsigns: localHeads, stops: shardStops, deps: shardDeps }),
  );
  shardCount++;
}
console.log(`wrote ${shardCount} shards to data/shards/`);
