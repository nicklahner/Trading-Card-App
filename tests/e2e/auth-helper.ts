import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Playwright runs outside Next.js, so .env.local isn't auto-loaded.
// Load .env (which has DATABASE_URL) before Prisma validates the schema.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../.env.local'), override: true });

const prisma = new PrismaClient();

/**
 * Seed a test user and session in the database.
 *
 * IMPORTANT: The ALLOWED_EMAILS env var in .env.local must include
 * 'test@example.com' for NextAuth to accept sign-in. Current value
 * only has the owner's email, but since we bypass sign-in and write
 * the session directly, the allow-list is not checked during E2E.
 */
export async function seedTestAuth() {
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: { email: 'test@example.com', name: 'Test User' },
  });

  const token = 'e2e-test-session-token';
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.session.upsert({
    where: { sessionToken: token },
    update: { expires },
    create: { sessionToken: token, userId: user.id, expires },
  });

  return { token, userId: user.id };
}

export async function cleanupTestAuth() {
  await prisma.session.deleteMany({
    where: { sessionToken: 'e2e-test-session-token' },
  });
  await prisma.$disconnect();
}
