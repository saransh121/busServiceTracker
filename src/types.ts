export interface UserLocation {
  lat: number;
  lon: number;
  ts: number; // epoch ms when shared
  live?: boolean; // came from a Telegram live-location stream
}

// ---- Traffic ----
export interface TrafficIncident {
  description: string;
  road?: string;
  delaySec?: number;
}

export interface TrafficData {
  /** currentSpeed / freeFlowSpeed on the nearest road, 0..1 (lower = worse). */
  flowRatio: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  incidents: TrafficIncident[];
}

// ---- Transit ----
export interface Departure {
  route: string;
  headsign?: string;
  /** "HH:MM" local (Asia/Dubai) */
  time: string;
  minutesAway?: number;
  mode?: string;
  realtime: boolean;
}

export interface StopBoard {
  stopName: string;
  distanceM?: number;
  departures: Departure[];
}

export interface TransitData {
  kind: "departures" | "stops-only";
  boards: StopBoard[];
  note?: string;
}

// ---- Crowds ----
export interface CrowdVenue {
  name: string;
  address?: string;
  /** 0-100 live busyness if known */
  liveBusyness?: number;
  /** 0-100 typical busyness for this hour if known */
  usualBusyness?: number;
  unusuallyBusy: boolean;
  estimated: boolean;
}

export interface CrowdData {
  venues: CrowdVenue[];
  estimated: boolean;
  note?: string;
}

// ---- Geocode ----
export interface PlaceInfo {
  area?: string;
  city?: string;
  emirate: string;
}
