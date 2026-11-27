import { equipmentImages, type EquipmentIconKind } from '@/utils/equipmentImages';

export function EquipmentIcon({ kind }: { kind?: EquipmentIconKind }) {
  if (!kind) return null;

  return (
    <img
      src={equipmentImages[kind]}
      width={40}
      height={40}
      alt=""
      decoding="async"
      className="size-10 shrink-0 object-contain"
    />
  );
}
