import { describe, expect, it } from "vitest";
import { congestionLabel, escapeHtml, formatCrowds, formatTraffic, formatTransit, mapsUrl } from "../src/format";
import type { CrowdData, PlaceInfo, TrafficData, TransitData } from "../src/types";

const place: PlaceInfo = { area: "Downtown", city: "Dubai", emirate: "Dubai" };

describe("congestionLabel", () => {
  it("classifies flow ratios", () => {
    expect(congestionLabel(0.95).label).toBe("Smooth");
    expect(congestionLabel(0.7).label).toBe("Moderate");
    expect(congestionLabel(0.5).label).toBe("Heavy");
    expect(congestionLabel(0.2).label).toBe("Severe congestion");
  });
});

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("formatTraffic", () => {
  const data: TrafficData = {
    flowRatio: 0.5,
    currentSpeedKmh: 40,
    freeFlowSpeedKmh: 80,
    incidents: [{ description: "Accident", road: "E11", delaySec: 300 }],
  };
  it("includes congestion, speeds, and incidents", () => {
    const s = formatTraffic(data, place, "TomTom");
    expect(s).toContain("Heavy");
    expect(s).toContain("40 km/h");
    expect(s).toContain("Accident");
    expect(s).toContain("+5 min");
    expect(s).toContain("TomTom");
  });
});

describe("formatTransit", () => {
  it("renders departure boards", () => {
    const data: TransitData = {
      kind: "departures",
      boards: [
        {
          stopName: "Financial Centre",
          departures: [{ route: "27", headsign: "Gold Souq", time: "18:05", minutesAway: 7, realtime: false }],
        },
      ],
      note: "Scheduled times",
    };
    const s = formatTransit(data, place, "Transitland");
    expect(s).toContain("Financial Centre");
    expect(s).toContain("27");
    expect(s).toContain("in <b>7 min</b>");
    expect(s).toContain("Scheduled times");
  });

  it("renders stops-only fallback", () => {
    const data: TransitData = {
      kind: "stops-only",
      boards: [{ stopName: "Al Ain St", distanceM: 120, departures: [] }],
    };
    const s = formatTransit(data, place, "OpenStreetMap");
    expect(s).toContain("Nearest stops");
    expect(s).toContain("120 m");
  });
});

describe("mapsUrl", () => {
  it("pins exact coordinates when available", () => {
    expect(mapsUrl({ name: "Dubai Mall", lat: 25.1975, lon: 55.2796, unusuallyBusy: false, estimated: false })).toBe(
      "https://www.google.com/maps/search/?api=1&query=25.1975%2C55.2796",
    );
  });
  it("falls back to a name+city search", () => {
    const url = mapsUrl({ name: "Dubai Mall", unusuallyBusy: false, estimated: false }, place);
    expect(url).toContain("query=Dubai%20Mall%20Dubai");
  });
});

describe("formatCrowds", () => {
  it("highlights unusually busy venues with Google Maps links and webcams", () => {
    const data: CrowdData = {
      estimated: false,
      venues: [
        { name: "Dubai Mall", lat: 25.1975, lon: 55.2796, liveBusyness: 92, usualBusyness: 60, unusuallyBusy: true, estimated: false },
        { name: "Quiet Cafe", liveBusyness: 20, unusuallyBusy: false, estimated: false },
      ],
      webcams: [{ title: "Downtown Cam", url: "https://windy.com/webcams/123" }],
    };
    const s = formatCrowds(data, place, "BestTime live");
    expect(s).toContain("Unusually busy");
    expect(s).toContain('<a href="https://www.google.com/maps/search/?api=1&amp;query=25.1975%2C55.2796">Dubai Mall</a>');
    expect(s).toContain("usually 60%");
    expect(s).toContain("Downtown Cam");
  });

  it("says so when nothing is unusual", () => {
    const data: CrowdData = { estimated: true, venues: [{ name: "Park", unusuallyBusy: false, estimated: true }] };
    const s = formatCrowds(data, place, "Estimated");
    expect(s).toContain("Nothing looks unusually crowded");
    expect(s).toContain("estimated");
  });
});
