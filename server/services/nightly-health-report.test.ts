/**
 * Tests for `collectHealthSnapshot` in the nightly health report.
 *
 * Two complementary layers:
 *
 * 1. SQL INSPECTION (no database rows required)
 *    Calls the exported `overQuotaWhereClause` production helper and inspects
 *    its `.toSQL()` output to assert both storage columns carry `::numeric`
 *    casts.  Because the test imports and invokes the real helper, removing
 *    either cast from the production code causes this test to fail
 *    immediately — no rows need to exist.
 *
 * 2. READ-ONLY INTEGRATION (application database, no data mutations)
 *    Calls `collectHealthSnapshot` against the real database with a
 *    phantom tenant ID that will match no rows.  The query executes
 *    end-to-end so PostgreSQL parse/plan errors surface here, and the
 *    empty-result shape is verified.  No rows are inserted or deleted.
 *
 * Run with:
 *   tsx --test server/services/nightly-health-report.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { db } from "../db";
import { workspaces } from "@shared/schema";
import {
  collectHealthSnapshot,
  overQuotaWhereClause,
} from "./nightly-health-report";

// ── 1. SQL inspection ────────────────────────────────────────────────────────

describe("overQuotaWhereClause / SQL type-safety", () => {
  /**
   * PRIMARY CAST-REGRESSION GUARD
   *
   * Calls the same `overQuotaWhereClause` function used by
   * `collectHealthSnapshot` and inspects the generated SQL for the
   * `::numeric` casts on both storage columns.
   *
   * The over-quota predicate multiplies a bigint column by the 0.75
   * float threshold.  Without `::numeric` the expression is
   * `bigint * <driver-type>`, which PostgreSQL rejects when the driver
   * binds the parameter as float8 ("operator does not exist:
   * bigint * double precision").  The casts make the expression safe
   * regardless of driver type-binding behaviour.
   *
   * If either cast is accidentally removed from the source, the SQL
   * string produced by the real helper no longer matches the pattern and
   * this test fails.
   */
  it("produces ::numeric casts on both storageAllocatedBytes and storageUsedBytes", () => {
    const condition = overQuotaWhereClause("__sql_inspection__");

    // Build a minimal SELECT to get a compilable SQL string from the real condition.
    const { sql: generatedSql } = db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(condition)
      .toSQL();

    assert.match(
      generatedSql,
      /"storage_allocated_bytes"::numeric/,
      "storageAllocatedBytes must be cast ::numeric (prevents bigint × float type error)",
    );
    assert.match(
      generatedSql,
      /"storage_used_bytes"::numeric/,
      "storageUsedBytes must be cast ::numeric (prevents bigint × float type error)",
    );
  });

  it("filters out sites with zero allocated quota (storageAllocatedBytes::numeric > 0)", () => {
    const { sql: generatedSql } = db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(overQuotaWhereClause("__sql_inspection__"))
      .toSQL();

    // The predicate must include the zero-quota guard so sites with no
    // quota configured are excluded from storage-pressure reporting.
    assert.match(
      generatedSql,
      /"storage_allocated_bytes"::numeric > 0/,
      "WHERE clause must exclude sites where storageAllocatedBytes is 0",
    );
  });

  it("applies the 75% threshold as a multiplier on the allocated quota", () => {
    const { sql: generatedSql, params } = db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(overQuotaWhereClause("__sql_inspection__"))
      .toSQL();

    // The inequality compares used bytes against allocated * threshold.
    assert.match(
      generatedSql,
      /storage_used_bytes"::numeric >= .*storage_allocated_bytes"::numeric \*/,
      "WHERE clause must compare storageUsedBytes against storageAllocatedBytes * threshold",
    );

    // 0.75 (WARN_THRESHOLD) must appear in the bound parameters.
    assert.ok(
      params.includes(0.75),
      "0.75 (WARN_THRESHOLD) must be a bound parameter in the over-quota condition",
    );
  });

  it("excludes soft-deleted sites from the condition", () => {
    const { sql: generatedSql } = db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(overQuotaWhereClause("__sql_inspection__"))
      .toSQL();

    assert.match(
      generatedSql,
      /coalesce.*is_deleted.*false/i,
      "WHERE clause must exclude soft-deleted workspaces",
    );
  });

  it("excludes archived sites from the condition", () => {
    const { sql: generatedSql } = db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(overQuotaWhereClause("__sql_inspection__"))
      .toSQL();

    assert.match(
      generatedSql,
      /coalesce.*is_archived.*false/i,
      "WHERE clause must exclude archived workspaces",
    );
  });
});

// ── 2. Read-only integration ─────────────────────────────────────────────────

describe("collectHealthSnapshot / read-only integration — phantom tenant", () => {
  // A tenant ID that is guaranteed to match no rows in any environment.
  const PHANTOM_TENANT = `phantom-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  /**
   * Executes the full collectHealthSnapshot query path against the real
   * PostgreSQL database.  If the `::numeric` casts are removed AND the
   * database driver serialises the 0.75 threshold as float8, PostgreSQL
   * raises "operator does not exist: bigint * double precision" and this
   * test fails with a database error.
   *
   * No rows are inserted or deleted — the test is entirely read-only.
   */
  it("executes without error and returns a valid empty snapshot", async () => {
    const snapshot = await collectHealthSnapshot(PHANTOM_TENANT, null);

    assert.ok(typeof snapshot.generatedAt === "string");
    assert.ok(Array.isArray(snapshot.issues));
    assert.ok(Array.isArray(snapshot.storage.topSites));
    assert.equal(snapshot.storage.sitesOver75, 0);
    assert.equal(snapshot.storage.sitesOver90, 0);
    assert.equal(snapshot.storage.topSites.length, 0);
    assert.equal(snapshot.totals.sitesEvaluated, 0);
  });

  it("sets refreshedAt to null when not provided", async () => {
    const snapshot = await collectHealthSnapshot(PHANTOM_TENANT, null);
    assert.equal(snapshot.refreshedAt, null);
  });

  it("includes a data caveat when refreshedAt is null", async () => {
    const snapshot = await collectHealthSnapshot(PHANTOM_TENANT, null);
    assert.ok(
      snapshot.dataCaveats.some((c) => /refresh|sync/i.test(c)),
      "Expected a caveat about missing refresh data",
    );
  });

  it("sets refreshedAt as an ISO string matching the provided Date", async () => {
    const now = new Date();
    const snapshot = await collectHealthSnapshot(PHANTOM_TENANT, now);
    assert.equal(typeof snapshot.refreshedAt, "string");
    assert.ok(snapshot.refreshedAt!.startsWith(now.toISOString().slice(0, 19)));
  });
});
