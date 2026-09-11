import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { createBot } from "./bot/handlers";
import type { Env } from "./config";
import { MemoryKV, type KVLike } from "./core/cache";

// Cached across requests within the same Workers isolate — avoids a getMe per update.
let bot: Bot | undefined;
let handler: ((request: Request) => Promise<Response>) | undefined;
let memoryKv: KVLike | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("uae-pulse-bot ok");
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!bot || !handler) {
        const kv = env.PULSE_KV ?? (memoryKv ??= new MemoryKV());
        bot = createBot(env, kv);
        handler = webhookCallback(bot, "cloudflare-mod", {
          secretToken: env.WEBHOOK_SECRET || undefined,
          timeoutMilliseconds: 30_000,
        }) as (request: Request) => Promise<Response>;
      }
      try {
        return await handler(request);
      } catch (e) {
        console.error("webhook error:", e);
        // Always 200 so Telegram doesn't retry a poison update forever
        return new Response("ok");
      }
    }

    return new Response("not found", { status: 404 });
  },
};
