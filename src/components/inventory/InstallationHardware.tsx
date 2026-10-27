import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { can } from "@/security/accessControl";
import type { User, Installation } from "@/types";
import {
  hardwareGet,
  hardwarePost,
  hardwareQuery,
  hardwareActorKey,
  type HardwareAsset,
  type HardwareCatalog,
} from "./hardwareApi";
import { HardwareSelect } from "./HardwareInventoryModule";
import { QrScanner } from "./QrScanner";
import { Plus, CheckCircle2, Loader2 } from "lucide-react";

export type HandoverHardware = {
  id: string;
  equipment_type: string;
  equipment_field?: string;
  model_number: string;
  serial_number: string | null;
  manufacturer_serial: string | null;
  condition_grade: string;
  installation_location: string;
  installation_date: string;
  installed_by: string;
  status: string;
  approval_status: string;
};

export function InstallationHardware({
  user,
  installation,
  subsidiaryId,
}: {
  user: User;
  installation: Installation;
  subsidiaryId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const actorKey = hardwareActorKey(user);
  const [q, setQ] = useState("");
  const [model, setModel] = useState("");
  const [family, setFamily] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [physical, setPhysical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [configuration, setConfiguration] = useState("");
  const [condition, setCondition] = useState("Good");
  const allowed = can(user, "inventory.view");
  const catalog = useQuery<HardwareCatalog>({
    queryKey: ["hardware", "catalog", actorKey],
    queryFn: () => hardwareGet("/catalog"),
    enabled: allowed,
    retry: false,
  });
  const linked = useQuery<{ rows: HandoverHardware[] }>({
    queryKey: ["hardware", "installation", actorKey, installation.id],
    queryFn: () => hardwareGet(`/installations/${installation.id}`),
    enabled: allowed,
    retry: false,
  });
  const available = useQuery<{ rows: HardwareAsset[] }>({
    queryKey: [
      "hardware",
      "eligible",
      actorKey,
      installation.id,
      subsidiaryId,
      q,
      model,
      family,
    ],
    queryFn: () =>
      hardwareGet(
        `/assets?${hardwareQuery({ subsidiary_id: subsidiaryId, q, suggestions:'true',model_id: model, family, selection_installation_id: installation.id, limit: 30 })}`,
      ),
    enabled:
      allowed &&
      !!catalog.data &&
      installation.status !== "completed" &&
      can(user, "inventory.assign"),
    retry: false,
  });
  const scan = useCallback((value: string) => setQ(value), []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["hardware"] });
      toast({ title: "Installation hardware updated" });
    } catch (e) {
      toast({
        title: "Hardware operation failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  if (!allowed) return null;
  if (
    catalog.error &&
    (catalog.error as Error & { status: number }).status === 503
  )
    return null;
  return (
    <section className="space-y-4 border-t pt-4">
      <h2 className="text-lg font-semibold">Serialized Hardware</h2>
      {(catalog.error || linked.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(catalog.error || linked.error)?.message}
        </p>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial / Model</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linked.data?.rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {a.serial_number || "Unknown"}
                  <div className="text-xs text-muted-foreground">
                    {a.model_number}
                  </div>
                </TableCell>
                <TableCell>{a.condition_grade}</TableCell>
                <TableCell>
                  <Badge variant="outline">{a.status}</Badge>
                </TableCell>
                <TableCell>{a.approval_status}</TableCell>
                <TableCell>
                  {a.status === "Assigned" &&
                    a.approval_status === "Approved" &&
                    can(user, "inventory.install") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Confirm the physical serial ${a.serial_number} is installed at this site?`,
                            )
                          )
                            void run(() =>
                              hardwarePost(`/assets/${a.id}/install`, {
                                physical_confirmed: true,
                                serial_number: a.serial_number,
                              }),
                            );
                        }}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Confirm Installed
                      </Button>
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {installation.status !== "completed" && catalog.data && (
        <>
          <div>
            <Label htmlFor="installation-hardware-configuration">
              Installation Hardware Configuration
            </Label>
            <Input
              id="installation-hardware-configuration"
              value={configuration}
              onChange={(e) => setConfiguration(e.target.value)}
              maxLength={2000}
            />
          </div>
          <Tabs defaultValue="existing">
            <TabsList className="max-w-full h-auto flex-wrap">
              <TabsTrigger value="existing">Select Existing Serial</TabsTrigger>
              {can(user, "inventory.field_register") && (
                <TabsTrigger value="new">Register & Generate</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="existing" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="installation-serial-search">
                    Serial / QR Asset ID
                  </Label>
                  <Input
                    id="installation-serial-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <HardwareSelect
                  label="Hardware Family"
                  value={family}
                  onChange={(v) => {
                    setFamily(v);
                    setModel("");
                  }}
                  options={[
                    ...new Set(catalog.data.variants.map((v) => v.family)),
                  ].map((v) => ({ value: v, label: v }))}
                  empty="All Families"
                />
                <HardwareSelect
                  label="Installation Model"
                  value={model}
                  onChange={setModel}
                  options={catalog.data.models
                    .filter((m) => !family || m.family === family)
                    .map((m) => ({ value: m.id, label: m.model_number }))}
                  empty="All Models"
                />
              </div>
              <QrScanner onScan={scan} />
              <div className="max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Available Serial</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {available.data?.rows.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.serial_number}</TableCell>
                        <TableCell>{a.model_number}</TableCell>
                        <TableCell>{a.location_name}<p className="text-xs text-muted-foreground">{a.unavailable_reason}</p></TableCell>
                        <TableCell>
                          {can(user, "inventory.assign") && (
                            <Button
                              size="sm"
                              disabled={busy || a.selectable===false}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Confirm this physical device matches ${a.serial_number}?`,
                                  )
                                )
                                  void run(() =>
                                    hardwarePost(`/assets/${a.id}/assign`, {
                                      installation_id: installation.id,
                                      technician_id:
                                        user.role === "User"
                                          ? user.id
                                          : installation.hardware_technician_id ||
                                            installation.assigned_technician_id,
                                      physical_confirmed: true,
                                      configuration: {
                                        installation_notes: configuration,
                                      },
                                    }),
                                  );
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Equipment
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!available.data?.rows.length && (
                <p className="text-sm text-muted-foreground">
                  No verified eligible equipment found.
                </p>
              )}
            </TabsContent>
            <TabsContent value="new" className="space-y-3">
              <HardwareSelect
                label="Field Registration Model"
                value={model}
                onChange={setModel}
                options={catalog.data.models
                  .filter(
                    (m) =>
                      m.approval_status === "Approved" && !m.historical_only,
                  )
                  .map((m) => ({ value: m.id, label: m.model_number }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="field-manufacturer">
                    Manufacturer Serial
                  </Label>
                  <Input
                    id="field-manufacturer"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    maxLength={150}
                  />
                </div>
                <div>
                  <Label htmlFor="field-year">Actual Manufacturing Year</Label>
                  <Input
                    id="field-year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              </div>
              <HardwareSelect
                label="Field Device Condition"
                value={condition}
                onChange={setCondition}
                options={catalog.data.conditions.map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <label className="flex gap-2 items-center text-sm">
                <Checkbox
                  checked={physical}
                  onCheckedChange={(v) => setPhysical(v === true)}
                />
                Physical equipment identity verified
              </label>
              <Button
                disabled={
                  busy ||
                  !model ||
                  !manufacturer ||
                  !physical ||
                  !catalog.data.policy.issuance_approved
                }
                onClick={() =>
                  void run(() =>
                    hardwarePost("/generate", {
                      source: "Field",
                      model_id: model,
                      subsidiary_id: subsidiaryId,
                      serial_year: catalog.data?.models.find(
                        (m) => m.id === model,
                      )?.model_year,
                      manufacturing_year: Number(year),
                      manufacturer_serial: manufacturer,
                      physical_confirmed: physical,
                      installation_id: installation.id,
                      quantity: 1,
                      condition_grade: condition,
                      configuration: { installation_notes: configuration },
                    }),
                  )
                }
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Register & Generate
              </Button>
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
