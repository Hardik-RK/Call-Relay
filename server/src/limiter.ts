// Fixed-window rate limiter keyed by an arbitrary string (client address, device id).
// In memory on purpose: the server is a single local process.

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Returns 0 when the hit is allowed, otherwise the number of seconds until retry. */
  hit(key: string): number {
    const t = this.now();
    if (this.windows.size > 5000) this.prune(t);
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return 0;
    }
    if (w.count >= this.limit) return Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000));
    w.count += 1;
    return 0;
  }

  /** Seconds until retry if the key is already over its limit, else 0. Does not count a hit. */
  blocked(key: string): number {
    const w = this.windows.get(key);
    const t = this.now();
    if (!w || t - w.start >= this.windowMs || w.count < this.limit) return 0;
    return Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000));
  }

  private prune(t: number): void {
    for (const [k, w] of this.windows) {
      if (t - w.start >= this.windowMs) this.windows.delete(k);
    }
  }
}
