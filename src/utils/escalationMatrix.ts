import { EscalationMatrix, EscalationTier } from '@/types';

export const emptyEscalationTier = (): EscalationTier => ({
  name: '',
  role: '',
  phone_number: '',
  email: '',
});

export const emptyEscalationMatrix = (): EscalationMatrix => ({
  tier1: emptyEscalationTier(),
  tier2: emptyEscalationTier(),
  tier3: emptyEscalationTier(),
});

export const escalationTierEntries = (matrix?: EscalationMatrix | null) =>
  Object.entries(matrix || {})
    .filter(([key, value]) => /^tier\d+$/.test(key) && value && typeof value === 'object')
    .sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4))) as [string, EscalationTier][];

export const normalizeEscalationMatrix = (matrix?: EscalationMatrix | null): EscalationMatrix => {
  const normalized = emptyEscalationMatrix();
  escalationTierEntries(matrix).forEach(([key, tier]) => {
    normalized[key] = {
      name: String(tier.name || '').trim(),
      role: String(tier.role || '').trim(),
      phone_number: String(tier.phone_number || '').trim(),
      email: String(tier.email || '').trim(),
    };
  });
  return normalized;
};
