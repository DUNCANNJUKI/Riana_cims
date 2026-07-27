import {
  HandoverEquipmentField,
  HandoverEquipmentItem,
  Installation,
} from '@/types';
import { equipmentInstallationStatus } from '@/utils/equipmentStatus';

export const HANDOVER_EQUIPMENT_CATALOG: ReadonlyArray<HandoverEquipmentItem> = [
  { field: 'kiosk_type', label: 'Kiosk Type', installed_status: 'Configured' },
  { field: 'kiosk_count', label: 'Kiosk Count', installed_status: 'Installed' },
  { field: 'counter_count', label: 'Tripleplay/Counters', installed_status: 'Installed' },
  { field: 'led_count', label: 'LED Displays', installed_status: 'Installed' },
  { field: 'screen_with_size', label: 'Screen Size', installed_status: 'Configured' },
  { field: 'screen_count', label: 'Number of TVs', installed_status: 'Installed' },
  { field: 'service_points', label: 'Service Points', installed_status: 'Active' },
  { field: 'ups_count', label: 'UPS Units', installed_status: 'Installed' },
  { field: 'speakers', label: 'Speakers', installed_status: 'Installed' },
  { field: 'amplifiers', label: 'Amplifiers', installed_status: 'Configured' },
  { field: 'media_controllers', label: 'Media Controllers', installed_status: 'Configured' },
  { field: 'tablets', label: 'Tablets', installed_status: 'Setup Complete' },
  { field: 'digital_signage_system', label: 'Digital Signage', installed_status: 'Operational' },
  { field: 'hdmis', label: 'HDMI Cables', installed_status: 'Connected' },
  { field: 'splitters', label: 'Splitters', installed_status: 'Installed' },
  { field: 'staff_trained', label: 'Staff Trained', installed_status: 'Completed' },
];

const catalogByField = new Map(HANDOVER_EQUIPMENT_CATALOG.map((item) => [item.field, item]));
const supportedFields = new Set<HandoverEquipmentField>(catalogByField.keys());

export const defaultHandoverEquipmentConfiguration = (): HandoverEquipmentItem[] =>
  HANDOVER_EQUIPMENT_CATALOG.map((item) => ({ ...item }));

export const normalizeHandoverEquipmentConfiguration = (
  value: unknown,
  fallbackToDefault = true,
): HandoverEquipmentItem[] => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (!Array.isArray(source)) return fallbackToDefault ? defaultHandoverEquipmentConfiguration() : [];

  const seen = new Set<HandoverEquipmentField>();
  const normalized: HandoverEquipmentItem[] = [];
  source.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    const field = String((candidate as HandoverEquipmentItem).field) as HandoverEquipmentField;
    if (!supportedFields.has(field) || seen.has(field)) return;
    const fallback = catalogByField.get(field)!;
    const label = String((candidate as HandoverEquipmentItem).label || fallback.label).trim().slice(0, 80);
    const installedStatus = String((candidate as HandoverEquipmentItem).installed_status || fallback.installed_status).trim().slice(0, 40);
    seen.add(field);
    normalized.push({
      field,
      label: label || fallback.label,
      installed_status: installedStatus || fallback.installed_status,
    });
  });
  if (fallbackToDefault && seen.has('screen_with_size') && !seen.has('screen_count')) {
    const fallback = catalogByField.get('screen_count')!;
    const screenIndex = normalized.findIndex((item) => item.field === 'screen_with_size');
    const screenCountItem = { ...fallback };
    if (screenIndex >= 0) normalized.splice(screenIndex + 1, 0, screenCountItem);
    else normalized.push(screenCountItem);
  }
  return normalized;
};

export interface HandoverEquipmentRow {
  field: HandoverEquipmentField;
  label: string;
  value: number | string;
  displayValue: string;
  status: string;
}

export const buildHandoverEquipmentRows = (
  installation: Installation,
  configuration: HandoverEquipmentItem[] | string | null | undefined,
): HandoverEquipmentRow[] => normalizeHandoverEquipmentConfiguration(configuration).map((item) => {
  const value = installation[item.field] ?? (typeof installation[item.field] === 'number' ? 0 : '');
  const isTextValue = item.field === 'kiosk_type' || item.field === 'screen_with_size';
  const displayValue = item.field === 'staff_trained'
    ? `${Number(value) || 0} personnel`
    : isTextValue
      ? String(value || 'N/A')
      : String(Number(value) || 0);
  const status = isTextValue
    ? (String(value || '').trim() ? item.installed_status : 'Not configured')
    : equipmentInstallationStatus(value, item.installed_status);
  return { ...item, value: value as number | string, displayValue, status };
});
