import type { CrowdData, PlaceInfo, TrafficData, TransitData } from "./types";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function placeLine(place: PlaceInfo): string {
  const parts = [place.area, place.city, place.emirate].filter(Boolean);
  return escapeHtml(parts.join(", ") || "your location");
}

export function congestionLabel(flowRatio: number): { emoji: string; label: string } {
  if (flowRatio >= 0.85) return { emoji: "🟢", label: "Smooth" };
  if (flowRatio >= 0.65) return { emoji: "🟡", label: "Moderate" };
  if (flowRatio >= 0.4) return { emoji: "🟠", label: "Heavy" };
  return { emoji: "🔴", label: "Severe congestion" };
}

export function formatTraffic(data: TrafficData, place: PlaceInfo, provider: string): string {
  const { emoji, label } = congestionLabel(data.flowRatio);
  const speeds =
    data.freeFlowSpeedKmh > 0
      ? ` — ${Math.round(data.currentSpeedKmh)} km/h now vs ${Math.round(
          data.freeFlowSpeedKmh,
        )} km/h free-flow`
      : "";
  const lines = [
    `🚦 <b>Traffic near ${placeLine(place)}</b>`,
    `${emoji} <b>${label}</b>${speeds} (${Math.round(data.flowRatio * 100)}% of normal speed)`,
  ];
  if (data.incidents.length > 0) {
    lines.push("", "<b>Incidents nearby:</b>");
    for (const i of data.incidents) {
      const delay = i.delaySec && i.delaySec > 60 ? ` (+${Math.round(i.delaySec / 60)} min)` : "";
      const road = i.road ? ` — ${escapeHtml(i.road)}` : "";
      lines.push(`⚠️ ${escapeHtml(i.description)}${road}${delay}`);
    }
  } else {
    lines.push("✅ No incidents reported nearby.");
  }
  lines.push("", `<i>Live data · ${escapeHtml(provider)}</i>`);
  return lines.join("\n");
}

const MODE_EMOJI: Record<string, string> = {
  bus: "🚌",
  subway: "🚇",
  metro: "🚇",
  lightrail: "🚊",
  tram: "🚊",
  ferry: "⛴️",
  train: "🚆",
  regionaltrain: "🚆",
};

export function formatTransit(data: TransitData, place: PlaceInfo, provider: string): string {
  const lines = [`🚌 <b>Public transport near ${placeLine(place)}</b>`, ""];
  if (data.kind === "stops-only") {
    lines.push("Nearest stops/stations:");
    for (const b of data.boards) {
      const dist = b.distanceM != null ? ` — ${b.distanceM} m` : "";
      lines.push(`📍 ${escapeHtml(b.stopName)}${dist}`);
    }
  } else {
    for (const b of data.boards) {
      const dist = b.distanceM != null ? ` (${b.distanceM} m)` : "";
      lines.push(`📍 <b>${escapeHtml(b.stopName)}</b>${dist}`);
      for (const d of b.departures) {
        const emoji = MODE_EMOJI[(d.mode ?? "bus").toLowerCase()] ?? "🚌";
        const head = d.headsign ? ` → ${escapeHtml(d.headsign)}` : "";
        const mins =
          d.minutesAway != null
            ? d.minutesAway <= 0
              ? " — <b>now</b>"
              : ` — in <b>${d.minutesAway} min</b>`
            : "";
        const live = d.realtime ? " 🔴" : "";
        lines.push(`  ${emoji} <b>${escapeHtml(d.route)}</b>${head} · ${d.time}${mins}${live}`);
      }
      lines.push("");
    }
  }
  if (data.note) lines.push(`<i>${escapeHtml(data.note)}</i>`);
  lines.push(`<i>Source: ${escapeHtml(provider)}</i>`);
  return lines.join("\n");
}

export function formatCrowds(data: CrowdData, place: PlaceInfo, provider: string): string {
  const lines = [`👥 <b>Crowds near ${placeLine(place)}</b>`, ""];
  const unusual = data.venues.filter((v) => v.unusuallyBusy);
  if (unusual.length > 0) {
    lines.push("<b>Unusually busy right now:</b>");
    for (const v of unusual) {
      const pct = v.liveBusyness != null ? ` — ${v.liveBusyness}% busy` : "";
      const vs =
        v.usualBusyness != null ? ` (usually ${v.usualBusyness}% at this hour)` : "";
      lines.push(`🔥 <b>${escapeHtml(v.name)}</b>${pct}${vs}`);
    }
    lines.push("");
  }
  const rest = data.venues.filter((v) => !v.unusuallyBusy).slice(0, 4);
  if (rest.length > 0) {
    lines.push("Other spots:");
    for (const v of rest) {
      const pct = v.liveBusyness != null ? ` — ${v.liveBusyness}%` : "";
      lines.push(`· ${escapeHtml(v.name)}${pct}`);
    }
  }
  if (unusual.length === 0) lines.push("😌 Nothing looks unusually crowded right now.");
  if (data.note) lines.push("", `<i>${escapeHtml(data.note)}</i>`);
  lines.push(`<i>Source: ${escapeHtml(provider)}${data.estimated ? " · estimated" : ""}</i>`);
  return lines.join("\n");
}
