import { Bot, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { LOCATION_TTL_SEC, type Env } from "../config";
import type { KVLike } from "../core/cache";
import { formatCrowds, formatTraffic, formatTransit } from "../format";
import { getCrowds } from "../services/crowds";
import { getPlace } from "../services/geocode";
import { getTraffic, getTrafficMapImage } from "../services/traffic";
import { getTransit } from "../services/transit";
import type { UserLocation } from "../types";

const shareKeyboard = new Keyboard().requestLocation("📍 Share my location").resized();

const menuKeyboard = new InlineKeyboard()
  .text("🚦 Traffic", "traffic")
  .text("🚌 Transport", "transit")
  .row()
  .text("👥 Crowds", "crowds")
  .text("🔄 Everything", "all");

async function saveLocation(kv: KVLike, chatId: number, lat: number, lon: number, live: boolean) {
  const loc: UserLocation = { lat, lon, ts: Date.now(), live };
  await kv.put(`loc:${chatId}`, JSON.stringify(loc), { expirationTtl: LOCATION_TTL_SEC });
}

async function loadLocation(kv: KVLike, chatId: number): Promise<UserLocation | null> {
  const raw = await kv.get(`loc:${chatId}`);
  if (!raw) return null;
  try {
    const loc = JSON.parse(raw) as UserLocation;
    if (Date.now() - loc.ts > LOCATION_TTL_SEC * 1000) return null;
    return loc;
  } catch {
    return null;
  }
}

export function createBot(env: Env, kv: KVLike): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.command("start", (ctx) =>
    ctx.reply(
      "👋 <b>UAE Pulse</b> — your on-demand local radar.\n\n" +
        "Tap the button below and press <b>Allow</b> when your phone asks — " +
        "I'll instantly know where you are (nothing to type).\n\n" +
        "Then ask me for:\n" +
        "🚦 live traffic (with a live map)\n" +
        "🚌 upcoming public transport\n" +
        "👥 unusually crowded places\n\n" +
        "I only answer when you ask — no notifications, no spam.",
      { parse_mode: "HTML", reply_markup: shareKeyboard },
    ),
  );

  bot.command("help", (ctx) =>
    ctx.reply(
      "ℹ️ <b>How it works</b>\n\n" +
        "1. Tap <b>📍 Share my location</b> (or attach → Location → Share Live Location for continuous tracking).\n" +
        "2. Pick what you want from the menu. That's it.\n\n" +
        "<b>Data honesty:</b>\n" +
        "· Traffic + map colors are <b>live</b> (TomTom/HERE/Mapbox probe data — same class Google uses).\n" +
        "· Bus/metro times are <b>scheduled</b> — no UAE authority publishes an open real-time feed yet.\n" +
        "· Crowd levels are live where BestTime covers the venue, otherwise estimated and labeled so.\n\n" +
        "Your location is kept for 1 hour, then forgotten.",
      { parse_mode: "HTML" },
    ),
  );

  bot.command("menu", async (ctx) => {
    const loc = await loadLocation(kv, ctx.chat.id);
    if (!loc) {
      return ctx.reply("Share your location first 👇", { reply_markup: shareKeyboard });
    }
    return ctx.reply("What do you want to know?", { reply_markup: menuKeyboard });
  });

  bot.on("message:location", async (ctx) => {
    const { latitude, longitude, live_period } = ctx.message.location;
    await saveLocation(kv, ctx.chat.id, latitude, longitude, live_period != null);
    const place = await getPlace(env, kv, latitude, longitude).catch(() => null);
    const where = place ? `📍 Got it — ${place.area ?? place.city ?? place.emirate}.` : "📍 Got it.";
    const liveNote = live_period != null ? " I'll follow your live location as it updates." : "";
    await ctx.reply(`${where}${liveNote}\nWhat do you want to know?`, {
      reply_markup: menuKeyboard,
    });
  });

  // Live-location streams arrive as edited messages — refresh silently.
  bot.on("edited_message:location", async (ctx) => {
    const { latitude, longitude } = ctx.editedMessage.location;
    await saveLocation(kv, ctx.editedMessage.chat.id, latitude, longitude, true);
  });

  bot.on("callback_query:data", async (ctx) => {
    const action = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id;
    if (!chatId) return ctx.answerCallbackQuery();

    const loc = await loadLocation(kv, chatId);
    if (!loc) {
      await ctx.answerCallbackQuery({ text: "Your location expired — share it again." });
      await ctx.reply("Share your location again 👇 (kept only 1 hour)", {
        reply_markup: shareKeyboard,
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: "⏳ Fetching live data…" });

    const wants = action === "all" ? ["traffic", "transit", "crowds"] : [action];
    const place = await getPlace(env, kv, loc.lat, loc.lon).catch(() => ({ emirate: "UAE" }));

    if (wants.includes("traffic")) {
      try {
        await ctx.replyWithChatAction("upload_photo");
        const [traffic, image] = await Promise.all([
          getTraffic(env, kv, loc.lat, loc.lon),
          getTrafficMapImage(env, loc.lat, loc.lon),
        ]);
        const caption = formatTraffic(traffic.data, place, traffic.provider);
        if (image) {
          await ctx.replyWithPhoto(new InputFile(image.bytes, "traffic.png"), {
            caption,
            parse_mode: "HTML",
          });
        } else {
          await ctx.reply(caption, { parse_mode: "HTML" });
        }
      } catch (e) {
        await ctx.reply(`🚦 Traffic data is temporarily unavailable (${errMsg(e)}). Try again in a minute.`);
      }
    }

    if (wants.includes("transit")) {
      try {
        await ctx.replyWithChatAction("typing");
        const transit = await getTransit(env, kv, loc.lat, loc.lon, place.emirate);
        await ctx.reply(formatTransit(transit.data, place, transit.provider), {
          parse_mode: "HTML",
        });
      } catch (e) {
        await ctx.reply(
          `🚌 No transit data available here (${errMsg(e)}). ` +
            `Try the official apps: S'hail (Dubai) or Darb (Abu Dhabi).`,
        );
      }
    }

    if (wants.includes("crowds")) {
      try {
        await ctx.replyWithChatAction("typing");
        const traffic = await getTraffic(env, kv, loc.lat, loc.lon).catch(() => null);
        const crowds = await getCrowds(env, kv, loc.lat, loc.lon, traffic?.data, place);
        await ctx.reply(formatCrowds(crowds.data, place, crowds.provider), {
          parse_mode: "HTML",
        });
      } catch (e) {
        await ctx.reply(`👥 Crowd data is unavailable right now (${errMsg(e)}).`);
      }
    }
  });

  // Any other text → gentle nudge to the flow (still no spam: replies only to the user's message)
  bot.on("message:text", (ctx) =>
    ctx.reply("Tap 📍 to share your location, then pick from the menu. /help for details.", {
      reply_markup: shareKeyboard,
    }),
  );

  bot.catch((err) => console.error("bot error:", err.error));
  return bot;
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 120 ? m.slice(0, 120) + "…" : m;
}
