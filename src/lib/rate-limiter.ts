import { prisma } from '@/db/client';

export interface RateLimiter {
  acquire(provider: string, intervalMs: number): Promise<void>;
}

/**
 * Database-backed rate limiter using the rate_limit table (§3.4).
 * Serialises access per provider so only one request proceeds at a time.
 */
export class PostgresRateLimiter implements RateLimiter {
  async acquire(provider: string, intervalMs: number): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = new Date();

      const row = await prisma.rateLimit.findUnique({ where: { provider } });

      if (!row || row.nextAllowedAt <= now) {
        const nextAllowedAt = new Date(now.getTime() + intervalMs);

        await prisma.rateLimit.upsert({
          where: { provider },
          create: { provider, nextAllowedAt },
          update: { nextAllowedAt },
        });

        return;
      }

      // Wait until the slot opens
      const waitMs = row.nextAllowedAt.getTime() - now.getTime();
      await sleep(waitMs);
    }
  }
}

/**
 * Simple in-memory rate limiter for local development without a database.
 */
export class LocalRateLimiter implements RateLimiter {
  private slots = new Map<string, number>();

  async acquire(provider: string, intervalMs: number): Promise<void> {
    const now = Date.now();
    const nextAllowed = this.slots.get(provider) ?? 0;

    if (nextAllowed > now) {
      await sleep(nextAllowed - now);
    }

    this.slots.set(provider, Date.now() + intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
