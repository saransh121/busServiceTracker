import { describe, expect, it } from "vitest";
import { bboxAround, emirateFromCoords, geohash, haversineKm } from "../src/core/geo";

describe("geohash", () => {
  it("encodes the canonical reference point correctly", () => {
    // Well-known geohash test vector
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });
  it("groups nearby points into the same cell", () => {
    expect(geohash(25.1972, 55.2744)).toBe(geohash(25.1975, 55.2748));
  });
});

describe("bboxAround", () => {
  it("produces a box containing the center", () => {
    const b = bboxAround(25.2, 55.27, 2);
    expect(b.minLat).toBeLessThan(25.2);
    expect(b.maxLat).toBeGreaterThan(25.2);
    expect(b.minLon).toBeLessThan(55.27);
    expect(b.maxLon).toBeGreaterThan(55.27);
  });
});

describe("haversineKm", () => {
  it("Dubai → Abu Dhabi is roughly 125 km", () => {
    const d = haversineKm(25.1972, 55.2744, 24.4539, 54.3773);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(140);
  });
});

describe("emirateFromCoords", () => {
  it("detects the main emirates", () => {
    expect(emirateFromCoords(25.1972, 55.2744)).toBe("Dubai");
    expect(emirateFromCoords(24.4539, 54.3773)).toBe("Abu Dhabi");
    expect(emirateFromCoords(25.3463, 55.4209)).toBe("Sharjah");
    expect(emirateFromCoords(25.4052, 55.5136)).toBe("Ajman");
  });
});
