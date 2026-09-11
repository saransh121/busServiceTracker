/**
 * Local development entry: long-polling mode, in-memory KV.
 * Reads .dev.vars (same file wrangler uses) so one config serves both modes.
 *   npm run dev:poll
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createBot } from "./bot/handlers";
import type { Env } from "./config";
import { MemoryKV, type KVLike } from "./core/cache";

/** MemoryKV that survives restarts by mirroring to a local JSON file. */
class FileKV extends MemoryKV implements KVLike {
  private file = ".kv-store.json";

  constructor() {
    super();
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as Record<
        string,
        { value: string; expiresAt: number }
      >;
      for (const [k, e] of Object.entries(saved)) {
        if (e.expiresAt === 0 || Date.now() < e.expiresAt) {
          void super.put(k, e.value, {
            expirationTtl: e.expiresAt ? Math.ceil((e.expiresAt - Date.now()) / 1000) : undefined,
          });
        }
      }
    } catch {
      /* first run */
    }
  }

  override async put(key: string, value: string, opts?: { expirationTtl?: number }) {
    await super.put(key, value, opts);
    try {
      writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.store)));
    } catch {
      /* persistence is best-effort */
    }
  }
}

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
  WINDY_KEY: vars.WINDY_KEY,
};

const bot = createBot(env, new FileKV());
console.log("UAE Pulse bot running in polling mode — press Ctrl+C to stop.");
bot.start({ onStart: (me) => console.log(`Logged in as @${me.username}`) });
