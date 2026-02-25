import { createHash } from 'crypto';

const WRITEBACK_DB_FIELDS = ['sensitivityLabelId', 'department', 'costCenter', 'projectCode'] as const;

const WRITEBACK_PROPERTYBAG_KEYS = ['Department', 'CostCenter', 'ProjectCode', 'ZenithAI'] as const;

export function computeWritebackHash(data: {
  sensitivityLabelId?: string | null;
  department?: string | null;
  costCenter?: string | null;
  projectCode?: string | null;
  propertyBag?: Record<string, string> | null;
}): string {
  const hashInput: Record<string, string> = {};

  for (const field of WRITEBACK_DB_FIELDS) {
    hashInput[`db:${field}`] = data[field] ?? '';
  }

  const bag = data.propertyBag || {};
  for (const key of WRITEBACK_PROPERTYBAG_KEYS) {
    hashInput[`pb:${key}`] = bag[key] ?? '';
  }

  const sortedKeys = Object.keys(hashInput).sort();
  const canonical = sortedKeys.map(k => `${k}=${hashInput[k]}`).join('|');

  return createHash('sha256').update(canonical).digest('hex');
}

export function computeSpoSyncHash(spoData: {
  sensitivityLabelId?: string | null;
  propertyBag?: Record<string, string> | null;
}): string {
  const hashInput: Record<string, string> = {};

  hashInput['db:sensitivityLabelId'] = spoData.sensitivityLabelId ?? '';

  const bag = spoData.propertyBag || {};

  hashInput['db:department'] = bag['Department'] ?? '';
  hashInput['db:costCenter'] = bag['CostCenter'] ?? '';
  hashInput['db:projectCode'] = bag['ProjectCode'] ?? '';

  for (const key of WRITEBACK_PROPERTYBAG_KEYS) {
    hashInput[`pb:${key}`] = bag[key] ?? '';
  }

  const sortedKeys = Object.keys(hashInput).sort();
  const canonical = sortedKeys.map(k => `${k}=${hashInput[k]}`).join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
