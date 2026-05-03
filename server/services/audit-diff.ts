export const REDACTED_PLACEHOLDER = "***REDACTED***";

const DEFAULT_REDACTED_FIELDS = [
  "clientsecret",
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "secret",
];

const REDACTED_PATTERN = /(password|secret|token|apikey)/i;

export type AuditChange = { from: unknown; to: unknown };
export type AuditChanges = Record<string, AuditChange>;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function shouldRedact(field: string, redactedSet: Set<string>): boolean {
  if (redactedSet.has(field.toLowerCase())) return true;
  return REDACTED_PATTERN.test(field);
}

/**
 * Normalize an undefined value to `null` so that JSON.stringify preserves the
 * `from`/`to` keys when the diff is persisted to a JSONB column. `undefined`
 * properties are silently dropped by JSON serialization, which would cause the
 * viewer to lose "added" or "cleared" field changes.
 */
function jsonSafe(value: unknown): unknown {
  return value === undefined ? null : value;
}

function redactValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return REDACTED_PLACEHOLDER;
}

/**
 * Compute a per-field diff between two records and return a `{ field: { from, to } }` map.
 *
 * - Only considers fields that are present in `next` (i.e. fields the caller intended to change).
 * - Equal values (deep) are skipped.
 * - Missing values (e.g. a field added or cleared) are normalized to `null` so the
 *   `from`/`to` keys survive JSONB persistence.
 * - Sensitive fields are replaced with a constant placeholder. By default this includes
 *   common credential-like names (clientSecret, password, token, apiKey, ...). Callers
 *   can extend the list via the `redactedFields` argument.
 */
export function auditDiff(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  redactedFields: string[] = [],
): AuditChanges {
  const result: AuditChanges = {};
  if (!next) return result;
  const redactedSet = new Set<string>([
    ...DEFAULT_REDACTED_FIELDS,
    ...redactedFields.map((f) => f.toLowerCase()),
  ]);
  for (const key of Object.keys(next)) {
    const before = prev ? (prev as Record<string, unknown>)[key] : undefined;
    const after = (next as Record<string, unknown>)[key];
    if (deepEqual(before, after)) continue;
    if (shouldRedact(key, redactedSet)) {
      result[key] = { from: redactValue(before), to: redactValue(after) };
    } else {
      result[key] = { from: jsonSafe(before), to: jsonSafe(after) };
    }
  }
  return result;
}
