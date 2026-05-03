/**
 * Playwright global setup — runs once before all E2E tests.
 *
 * Responsibilities:
 *  1. Ensure the e2etest@synozur.demo organisation exists (ENTERPRISE plan).
 *  2. Ensure the test user exists and is bound to that org (idempotent, always updates
 *     organizationId so stale tenant state from prior runs cannot cause failures).
 *  3. Seed at least one unread notification for that user so the bell-dropdown
 *     test always exercises the "Mark all read" path deterministically.
 */
import { type FullConfig } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { users, organizations, notifications } from "../shared/schema";
import bcrypt from "bcryptjs";

const E2E_EMAIL = "e2etest@synozur.demo";
const E2E_PASSWORD = "Zenith2025!";
const E2E_ORG_DOMAIN = "synozur.demo";

export default async function globalSetup(_config: FullConfig) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL must be set for E2E global setup");

  const sql = postgres(dbUrl, { max: 1 });
  const db = drizzle(sql);

  // 1. Ensure the organisation exists (ENTERPRISE plan so all features are available).
  let [org] = await db.select().from(organizations).where(eq(organizations.domain, E2E_ORG_DOMAIN));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        name: "The Synozur Alliance",
        domain: E2E_ORG_DOMAIN,
        servicePlan: "ENTERPRISE",
      })
      .returning();
  }

  // 2. Ensure the test user exists and is always bound to the E2E org.
  //    Using upsert so stale organizationId from prior runs is always corrected.
  const hashed = await bcrypt.hash(E2E_PASSWORD, 10);
  const [user] = await db
    .insert(users)
    .values({
      email: E2E_EMAIL,
      password: hashed,
      role: "platform_owner",
      organizationId: org.id,
      emailVerified: true,
      authProvider: "local",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        organizationId: org.id,
        role: "platform_owner",
        emailVerified: true,
        authProvider: "local",
      },
    })
    .returning();

  // 3. Seed an unread notification so the bell test is always deterministic.
  await db.insert(notifications).values({
    userId: user.id,
    organizationId: org.id,
    category: "system",
    severity: "info",
    title: "[E2E] Test notification — safe to dismiss",
    body: "Seeded by global-setup.ts for bell-dropdown E2E coverage.",
    readAt: null,
  });

  await sql.end();
}
