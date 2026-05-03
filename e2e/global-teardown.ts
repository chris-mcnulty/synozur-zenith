/**
 * Playwright global teardown — runs once after all E2E tests.
 *
 * Cleans up the notification rows seeded by global-setup (only the E2E-seeded
 * ones).  The test user and organisation are intentionally left in place to
 * make re-runs faster (global-setup is idempotent).
 */
import { type FullConfig } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { users, notifications } from "../shared/schema";

const E2E_EMAIL = "e2etest@synozur.demo";

export default async function globalTeardown(_config: FullConfig) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  const sql = postgres(dbUrl, { max: 1 });
  const db = drizzle(sql);

  const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
  if (user) {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.title, "[E2E] Test notification — safe to dismiss"),
        ),
      );
  }

  await sql.end();
}
