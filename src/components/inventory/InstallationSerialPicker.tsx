import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, X } from "lucide-react";
import { can } from "@/security/accessControl";
import type { Installation, User } from "@/types";
import { normalizeHandoverEquipmentConfiguration, equipmentQuantity, isCustomEquipment } from "@/utils/equipmentConfiguration";
import {
  hardwareActorKey,
  hardwareGet,
  hardwareQuery,
  type HardwareAsset,
  type HardwareCatalog,
} from "./hardwareApi";
import type { HandoverHardware } from "./InstallationHardware";
import type { EquipmentRequirementsData } from "./EquipmentRequirements";

export type InstallationSerialSelection = {
  assets: Array<{ asset_id: string; equipment_field: string }>;
  physical_confirmed: boolean;
  mark_installed: boolean;
  validation_error?: string;
};
export function InstallationSerialPicker({
  user,
  installation,
  subsidiaryId,
  equipmentConfiguration,
  value,
  onChange,
}: {
  user: User;
  installation: Partial<Installation>;
  subsidiaryId: string;
  value: InstallationSerialSelection | undefined;
  onChange: (value: InstallationSerialSelection) => void;
  equipmentConfiguration?: unknown;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [chosen, setChosen] = useState<HardwareAsset[]>([]);
  const actor = hardwareActorKey(user);
  const allowed =
    can(user, "inventory.view") &&
    can(user, "inventory.assign") &&
    !!subsidiaryId &&
    installation.status !== "completed" &&
    installation.handover_status !== "signed";
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const catalog = useQuery<HardwareCatalog>({
    queryKey: ["hardware", "catalog", actor],
    queryFn: () => hardwareGet("/catalog"),
    enabled: allowed,
    retry: false,
  });
  const requirements = useQuery<EquipmentRequirementsData>({
    queryKey: ["hardware", "requirements", actor, subsidiaryId],
    queryFn: () =>
      hardwareGet(
        `/equipment-requirements?${hardwareQuery({ subsidiary_id: subsidiaryId })}`,
      ),
    enabled: allowed,
    refetchInterval: 15000,
    retry: false,
  });
  const linked = useQuery<{ rows: HandoverHardware[] }>({
    queryKey: ["hardware", "installation", actor, installation.id],
    queryFn: () => hardwareGet(`/installations/${installation.id}`),
    enabled: allowed && !!installation.id,
    retry: false,
  });
  const available = useQuery<{ rows: HardwareAsset[] }>({
    queryKey: [
      "hardware",
      "formSerials",
      actor,
      subsidiaryId,
      installation.id,
      query,
    ],
    queryFn: () =>
      hardwareGet(
        `/assets?${hardwareQuery({ subsidiary_id: subsidiaryId, q: query, suggestions: "true", limit: 100, ...(installation.id ? { selection_installation_id: installation.id } : { eligible: "true" }) })}`,
      ),
    enabled: allowed && !!catalog.data && installation.status !== "completed",
    retry: false,
  });
  const configuredLabels = normalizeHandoverEquipmentConfiguration(
    equipmentConfiguration,
  );
  const fields = [...normalizeHandoverEquipmentConfiguration(undefined),...configuredLabels.filter((item)=>isCustomEquipment(item.field))]
    .map((item) => ({
      ...item,
      label:
        configuredLabels.find((configured) => configured.field === item.field)
          ?.label || item.label,
    }))
    .filter(
      (item) =>
        equipmentQuantity(installation,item.field) > 0 &&
        (catalog.data?.equipment_fields?.some(
          (field) => field.field === item.field,
        ) ||
          item.field === "kiosk_count" || isCustomEquipment(item.field) ||
          catalog.data?.models.some(
            (model) => model.equipment_field === item.field,
          )),
    );
  useEffect(() => {
    if (allowed && !value && linked.data?.rows.length)
      onChange({
        assets: linked.data.rows
          .filter((a) => a.equipment_field)
          .map((a) => ({
            asset_id: a.id,
            equipment_field: a.equipment_field!,
          })),
        physical_confirmed: false,
        mark_installed: false,
      });
  }, [allowed, linked.data, value, onChange]);
  const selected = value?.assets || [];
  const requiredItems = requirements.data?.subsidiaries[0]?.equipment.filter(
    (item) => item.serial_required,
  ) || [];
  const missing = requiredItems.find(
    (item) =>
      equipmentQuantity(installation,item.field) > 0 &&
      selected.filter((asset) => asset.equipment_field === item.field)
        .length !== equipmentQuantity(installation,item.field),
  );
  const validationError =
    user.role === "User"
      ? requirements.error
        ? "Unable to load serial requirements. Refresh before saving."
        : missing
          ? `Select ${equipmentQuantity(installation,missing.field)} ${missing.label} serial(s); this equipment is compulsory.`
          : ""
      : "";
  useEffect(() => {
    if (allowed && (value?.validation_error || "") !== validationError)
      onChange({
        assets: selected,
        physical_confirmed: value?.physical_confirmed || false,
        mark_installed: value?.mark_installed || false,
        validation_error: validationError,
      });
  }, [allowed, validationError, value, onChange]);
  const activeField = fields.some((item) => item.field === field)
    ? field
    : fields[0]?.field;
  const update = (patch: Partial<InstallationSerialSelection>) =>
    onChange({
      assets: selected,
      physical_confirmed: value?.physical_confirmed || false,
      mark_installed: value?.mark_installed || false,
      ...patch,
    });
  if (
    !allowed ||
    (catalog.error as Error & { status?: number })?.status === 503 ||
    (!fields.length && !selected.length && !catalog.error)
  )
    return null;
  const selectedCount = selected.filter(
    (a) => a.equipment_field === activeField,
  ).length;
  const add = (asset: HardwareAsset) => {
    if (!asset.equipment_field || selected.some((a) => a.asset_id === asset.id))
      return;
    setChosen((items) => [...items, asset]);
    update({
      assets: [
        ...selected,
        { asset_id: asset.id, equipment_field: asset.equipment_field },
      ],
    });
  };
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-base font-semibold">Equipment Serials</h3>
      {(catalog.error || linked.error || available.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {(catalog.error || linked.error || available.error)?.message}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {fields.map((item) => (
          <Button
            key={item.field}
            type="button"
            size="sm"
            variant={item.field === activeField ? "default" : "outline"}
            onClick={() => setField(item.field)}
          >
            {item.label}{" "}
            {requiredItems.some((r) => r.field === item.field) && (
              <span className="text-xs">Required</span>
            )}
            <span>
              {selected.filter((a) => a.equipment_field === item.field).length}/
              {equipmentQuantity(installation,item.field)}
            </span>
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="installation-equipment-serial">
          Search Serial / Manufacturer Serial
        </Label>
        <Input
          id="installation-equipment-serial"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={150}
        />
      </div>
      <ul className="max-h-48 overflow-auto divide-y rounded-md border">
        {available.data?.rows
          .filter(
            (a) =>
              (a.equipment_field === activeField || !!query) &&
              !selected.some((s) => s.asset_id === a.id),
          )
          .map((asset) => (
            <li
              key={asset.id}
              className="flex items-center justify-between gap-3 p-2"
            >
              <div className="min-w-0">
                <span className="block break-words text-sm font-medium">
                  {asset.serial_number}
                </span>
                <span className="text-xs text-muted-foreground">
                  {asset.model_number} / {asset.location_name || asset.status}
                </span>
                {(asset.unavailable_reason ||
                  (asset.equipment_field !== activeField
                    ? "Mapped to a different equipment item."
                    : null)) && (
                  <p className="text-xs text-muted-foreground">
                    {asset.unavailable_reason ||
                      "Mapped to a different equipment item."}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                title={`Select ${asset.serial_number}`}
                aria-label={`Select ${asset.serial_number}`}
                disabled={
                  asset.selectable === false ||
                  asset.equipment_field !== activeField ||
                  selectedCount >=
                    equipmentQuantity(installation,activeField || '')
                }
                onClick={() => add(asset)}
              >
                <Plus />
              </Button>
            </li>
          ))}
      </ul>
      {available.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading serials...
        </p>
      )}
      {!available.isFetching &&
        !available.error &&
        !available.data?.rows.some(
          (a) => a.equipment_field === activeField || !!query,
        ) && (
          <p className="text-sm text-muted-foreground">
            No matching stock found in this subsidiary.
          </p>
        )}
      <div className="flex flex-wrap gap-2">
        {selected.map((item) => {
          const existing = linked.data?.rows.find(
            (a) => a.id === item.asset_id,
          );
          const asset = existing || chosen.find((a) => a.id === item.asset_id);
          return (
            <Badge
              key={item.asset_id}
              variant="outline"
              className="gap-2 max-w-full"
            >
              <span className="break-words">
                {asset?.serial_number || item.asset_id}
              </span>
              {!existing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={`Remove ${asset?.serial_number || item.asset_id}`}
                  title="Remove selection"
                  onClick={() =>
                    update({
                      assets: selected.filter(
                        (a) => a.asset_id !== item.asset_id,
                      ),
                    })
                  }
                >
                  <X />
                </Button>
              )}
            </Badge>
          );
        })}
      </div>
      {selected.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value?.physical_confirmed || false}
            onCheckedChange={(v) => update({ physical_confirmed: v === true })}
          />
          Physical devices match the selected serials
        </label>
      )}
      {selected.length > 0 && can(user, "inventory.install") && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value?.mark_installed || false}
            onCheckedChange={(v) => update({ mark_installed: v === true })}
          />
          Selected equipment is physically installed
        </label>
      )}
    </section>
  );
}
