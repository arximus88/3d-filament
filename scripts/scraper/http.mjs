// Polite HTTP client shared by every adapter: one request at a time per
// client, a jittered pause between requests, a timeout, and a couple of
// retries on 429 / 5xx / network errors.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "uk,en;q=0.8",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} ${url}`);
    this.status = status;
    this.url = url;
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.minDelayMs]  lower bound of the pause between requests
 * @param {number} [opts.maxDelayMs]  upper bound of the pause between requests
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.retries]     extra attempts after the first one
 */
export function createClient({
  minDelayMs = 800,
  maxDelayMs = 1600,
  timeoutMs = 25_000,
  retries = 2,
} = {}) {
  let nextAllowedAt = 0;
  let requests = 0;

  async function pace() {
    const wait = nextAllowedAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextAllowedAt =
      Date.now() + minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
  }

  /** Fetch `url` and return the response body as text. */
  async function get(url, { headers = {} } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await pace();
      requests++;
      try {
        const res = await fetch(url, {
          headers: { ...BASE_HEADERS, ...headers },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "follow",
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new HttpError(res.status, url);
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(
            Math.min(retryAfter > 0 ? retryAfter * 1000 : 5000 * (attempt + 1), 30_000),
          );
          continue;
        }
        if (!res.ok) throw new HttpError(res.status, url);
        return await res.text();
      } catch (err) {
        if (err instanceof HttpError) throw err; // 4xx — retrying won't help
        lastErr = err;
      }
    }
    throw lastErr;
  }

  return { get, get requests() { return requests; } };
}
