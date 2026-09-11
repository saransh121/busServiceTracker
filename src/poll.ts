/**
 * Local development entry: long-polling mode, in-memory KV.
 * Reads .dev.vars (same file wrangler uses) so one config serves both modes.
 *   npm run dev:poll
 */
import { readFileSync } from "node:fs";
import { createBot } from "./bot/handlers";
import type { Env } from "./config";
import { MemoryKV } from "./core/cache";

function loadDevVars(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("No .dev.vars file found — copy .dev.vars.example and fill in keys.");
  }
  return out;
}

const vars = { ...loadDevVars(), ...process.env } as Record<string, string>;
if (!vars.BOT_TOKEN) {
  console.error("BOT_TOKEN missing (set it in .dev.vars). Exiting.");
  process.exit(1);
}

const env: Env = {
  BOT_TOKEN: vars.BOT_TOKEN,
  TOMTOM_KEY: vars.TOMTOM_KEY,
  HERE_KEY: vars.HERE_KEY,
  TRANSITLAND_KEY: vars.TRANSITLAND_KEY,
  BESTTIME_KEY: vars.BESTTIME_KEY,
  GEOAPIFY_KEY: vars.GEOAPIFY_KEY,
  MAPBOX_TOKEN: vars.MAPBOX_TOKEN,
};

const bot = createBot(env, new MemoryKV());
console.log("UAE Pulse bot running in polling mode — press Ctrl+C to stop.");
bot.start({ onStart: (me) => console.log(`Logged in as @${me.username}`) });
