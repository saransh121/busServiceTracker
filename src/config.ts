import type { KVLike } from "./core/cache";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TOMTOM_KEY?: string;
  HERE_KEY?: string;
  TRANSITLAND_KEY?: string;
  BESTTIME_KEY?: string;
  GEOAPIFY_KEY?: string;
  MAPBOX_TOKEN?: string;
  PULSE_KV?: KVLike;
}

/** Monthly cap on BestTime credit spend before switching to the free heuristic. */
export const BESTTIME_MONTHLY_BUDGET = 90;

export const LOCATION_TTL_SEC = 60 * 60; // shared location considered fresh for 1h
export const USER_AGENT = "uae-pulse-bot/1.0 (github.com/saransh121/busServiceTracker)";
