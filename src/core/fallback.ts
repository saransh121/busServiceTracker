export interface Provider<T> {
  name: string;
  fn: () => Promise<T>;
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface FallbackResult<T> {
  provider: string;
  data: T;
}

/**
 * Try providers in order. A provider is skipped on any throw (HTTP failure,
 * quota, timeout) and the next one is tried. Throws only if every provider fails.
 */
export async function withFallback<T>(
  providers: Provider<T>[],
  timeoutMs = 6000,
): Promise<FallbackResult<T>> {
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const data = await withTimeout(p.fn(), timeoutMs);
      return { provider: p.name, data };
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`all providers failed (${errors.join(" | ")})`);
}

/** fetch that throws on non-2xx, tagging quota-style statuses distinctly. */
export async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const msg = `HTTP ${res.status}`;
    if (res.status === 402 || res.status === 403 || res.status === 429) {
      throw new QuotaError(msg);
    }
    throw new Error(msg);
  }
  return res;
}
