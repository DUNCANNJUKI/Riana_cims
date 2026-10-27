import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hardwareActorKey, hardwareGet, hardwarePost } from "./hardwareApi";
import type { User } from "@/types";
export type EquipmentRequirementsData = {
  subsidiaries: Array<{
    id: string;
    subsidiary_name: string;
    can_edit: boolean;
    equipment: Array<{
      field: string;
      label: string;
      serial_required: boolean;
      model_numbers: string[];
    }>;
  }>;
};
export function EquipmentRequirements({ user }: { user: User }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const data = useQuery<EquipmentRequirementsData>({
    queryKey: ["hardware", "requirements", hardwareActorKey(user), "all"],
    queryFn: () => hardwareGet("/equipment-requirements"),
    refetchInterval: 15000,
    retry: false,
  });
  const save = async (
    subsidiaryId: string,
    field: string,
    required: boolean,
  ) => {
    setBusy(`${subsidiaryId}:${field}`);
    setError("");
    client.setQueryData<EquipmentRequirementsData>(
      ["hardware", "requirements", hardwareActorKey(user), "all"],
      (current) =>
        current
          ? {
              subsidiaries: current.subsidiaries.map((subsidiary) =>
                subsidiary.id === subsidiaryId
                  ? {
                      ...subsidiary,
                      equipment: subsidiary.equipment.map((item) =>
                        item.field === field
                          ? { ...item, serial_required: required }
                          : item,
                      ),
                    }
                  : subsidiary,
              ),
            }
          : current,
    );
    try {
      await hardwarePost("/equipment_requirement", {
        subsidiary_id: subsidiaryId,
        equipment_field: field,
        serial_required: required,
      });
      await client.invalidateQueries({ queryKey: ["hardware"] });
    } catch (e) {
      setError((e as Error).message);
      await client.invalidateQueries({
        queryKey: ["hardware", "requirements"],
      });
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="flex flex-col gap-3">
      {(error || data.error) && (
        <Alert variant="destructive">
          <AlertDescription>{error || data.error?.message}</AlertDescription>
        </Alert>
      )}
      {data.isLoading && <p role="status">Loading equipment requirements...</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subsidiary</TableHead>
              <TableHead>Installation Equipment</TableHead>
              <TableHead>Mapped Models</TableHead>
              <TableHead>Serial Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data?.subsidiaries.flatMap((subsidiary) =>
              subsidiary.equipment.map((item) => (
                <TableRow key={`${subsidiary.id}:${item.field}`}>
                  <TableCell>{subsidiary.subsidiary_name}</TableCell>
                  <TableCell>{item.label}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal break-words">
                    {item.model_numbers.join(", ") || "No model mapped"}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      aria-label={`Serial required for ${item.label} in ${subsidiary.subsidiary_name}`}
                      checked={item.serial_required}
                      disabled={
                        !!busy ||
                        !subsidiary.can_edit
                      }
                      onCheckedChange={(v) =>
                        void save(subsidiary.id, item.field, v === true)
                      }
                    />
                  </TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
