export const equipmentImages = {
  kiosk: '/equipment/kiosk.webp',
  'self-service-kiosk': '/equipment/self-service-kiosk.webp',
  display: '/equipment/display.webp',
  'service-point': '/equipment/service-point.webp',
  'media-controller': '/equipment/media-controller.webp',
} as const;

export type EquipmentIconKind = keyof typeof equipmentImages;

const equipmentFields = new Map<string, EquipmentIconKind>([
  ['kiosk_type', 'kiosk'],
  ['kiosk_count', 'kiosk'],
  ['screen_with_size', 'display'],
  ['screen_count', 'display'],
  ['digital_signage_system', 'display'],
  ['led_count', 'service-point'],
  ['counter_count', 'service-point'],
  ['service_points', 'service-point'],
  ['media_controllers', 'media-controller'],
]);

const equipmentFamilies = new Map<string, EquipmentIconKind>([
  ['QMS', 'kiosk'],
  ['SSK', 'self-service-kiosk'],
  ['DS', 'display'],
  ['LED', 'service-point'],
  ['MC', 'media-controller'],
]);

export function equipmentIconKind(field?: string | null, family?: string | null) {
  const familyKind = equipmentFamilies.get(family ?? '');
  if (familyKind === 'self-service-kiosk') return familyKind;
  return equipmentFields.get(field ?? '') ?? familyKind;
}

export function installationEquipmentIconKind(field: string, kioskType?: string | null) {
  const kind = equipmentIconKind(field);
  return kind === 'kiosk' && /^self[-\s]service(?:\s+kiosk)?$/i.test(kioskType?.trim() ?? '')
    ? 'self-service-kiosk'
    : kind;
}
