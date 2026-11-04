export type HardwarePolicy = {
  issuance_approved: number;
  field_approval_required: number;
  sequence_partition: string;
  approval_reference: string | null;
};

export type NormalizedHardwareCatalog<T extends Record<string, unknown>> = T & {
  policy: HardwarePolicy;
  policy_available: boolean;
};

const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);

/**
 * Normalizes catalog payloads without converting missing approval data into an
 * approval. This is intentionally fail-closed because issuance is a governed
 * inventory action.
 */
export const normalizeHardwareCatalog = <T extends Record<string, unknown>>(
  value: T,
): NormalizedHardwareCatalog<T> => {
  const source = value && typeof value === "object" ? value : ({} as T);
  const rawPolicy =
    source.policy && typeof source.policy === "object"
      ? (source.policy as Record<string, unknown>)
      : null;
  const policyAvailable =
    rawPolicy !== null &&
    (rawPolicy.issuance_approved === 0 ||
      rawPolicy.issuance_approved === 1 ||
      typeof rawPolicy.issuance_approved === "boolean");

  return {
    ...source,
    variants: safeArray(source.variants),
    models: safeArray(source.models),
    locations: safeArray(source.locations),
    subsidiaries: safeArray(source.subsidiaries),
    statuses: safeArray(source.statuses),
    conditions: safeArray(source.conditions),
    policy_available: policyAvailable,
    policy: {
      issuance_approved: policyAvailable && rawPolicy?.issuance_approved ? 1 : 0,
      field_approval_required:
        rawPolicy?.field_approval_required === 1 ||
        rawPolicy?.field_approval_required === true
          ? 1
          : 0,
      sequence_partition:
        typeof rawPolicy?.sequence_partition === "string"
          ? rawPolicy.sequence_partition
          : "",
      approval_reference:
        typeof rawPolicy?.approval_reference === "string"
          ? rawPolicy.approval_reference
          : null,
    },
  } as NormalizedHardwareCatalog<T>;
};
