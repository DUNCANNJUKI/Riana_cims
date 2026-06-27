export const equipmentInstallationStatus = (
  quantity: number | string | null | undefined,
  installedStatus: string,
): string => {
  const normalized = typeof quantity === 'number'
    ? quantity
    : typeof quantity === 'string' && quantity.trim() !== ''
      ? Number(quantity)
      : Number.NaN;

  return Number.isFinite(normalized) && normalized === 0 ? 'Not installed' : installedStatus;
};
