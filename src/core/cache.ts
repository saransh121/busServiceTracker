/** Minimal KV interface satisfied by Cloudflare Workers KV and by MemoryKV below. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** In-memory stand-in for local polling dev / when no KV namespace is bound. */
export class MemoryKV implements KVLike {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== 0 && Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0;
    this.store.set(key, { value, expiresAt });
  }
}

/** JSON read-through cache. On fetcher failure nothing is cached. */
export async function cached<T>(
  kv: KVLike,
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await kv.get(key).catch(() => null);
  if (hit !== null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      /* corrupt entry — refetch */
    }
  }
  const value = await fetcher();
  // KV minimum TTL is 60s
  await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) }).catch(() => {});
  return value;
}
