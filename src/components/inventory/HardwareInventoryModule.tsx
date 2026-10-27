import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { can, type Capability } from "@/security/accessControl";
import type { User } from "@/types";
import {
  Plus,
  Download,
  Printer,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  PackageCheck,
  Upload,
  ShieldCheck,
  SlidersHorizontal,
  MoreHorizontal,
  X,
} from "lucide-react";
import {
  assetQrUrl,
  hardwareGet,
  hardwarePost,
  hardwareQuery,
  hardwareActorKey,
  type HardwareAsset,
  type HardwareCatalog,
} from "./hardwareApi";
import { QrScanner } from "./QrScanner";
import { HardwareTour } from "./HardwareTour";
import { EquipmentRequirements } from './EquipmentRequirements';
import { VariantManager } from './VariantManager';
import { InventoryReportSummary, type InventorySummary } from './InventoryReportSummary';
import {HardwareSelect} from './HardwareSelect';
import {StocktakeDialog,StocktakeSummary,type StocktakeResult} from './StocktakeDialog';
import {
  FileList,
  SecureFileUploader,
} from "@/components/files/FileComponents";
import { apiClient } from "@/integrations/apiClient";
import type { SecureFileMetadata } from "@/integrations/filesApi";

const controlClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50";
export {HardwareSelect} from './HardwareSelect';
const reportTypes = [
  ["", "All Assets"],
  ["in_stock", "In Stock (Available / Reserved / Returned)"],
  ["out", "Out / Issued (Assigned / Installed / In Transit)"],
  ["Installed", "Installed"],
  ["Available", "Available"],
  ["Generated", "Generated / Unverified"],
  ["Reserved", "Reserved"],
  ["Assigned", "Assigned"],
  ["Faulty", "Faulty"],
  ["Under Maintenance", "Maintenance"],
  ["Returned", "Returned"],
  ["In Transit", "In Transit"],
  ["Retired", "Retired"],
  ["Disposed", "Disposed"],
  ["replacement", "Replacements"],
  ["movement", "Stock Movements"],
  ["technician", "Technician Equipment"],
  ["uninstalled", "Uninstalled"],
  ["legacy", "Legacy Backfill"],
  ["reconciliation", "Stock Reconciliation"],
  ["warranty", "Warranty"],
  ["lifecycle", "Asset Lifecycle"],
];
const actionDefinitions: Array<{
  key: string;
  label: string;
  permission: Capability;
}> = [
  {
    key: "identity",
    label: "Reconcile Legacy Identity",
    permission: "inventory.modify_identity",
  },
  { key: "verify", label: "Receive & Verify", permission: "inventory.receive" },
  {
    key: "approve",
    label: "Approve Field Registration",
    permission: "inventory.approve_field_registration",
  },
  { key: "reserve", label: "Reserve", permission: "inventory.reserve" },
  { key: "assign", label: "Assign", permission: "inventory.assign" },
  {
    key: "release",
    label: "Release Reservation",
    permission: "inventory.reserve",
  },
  {
    key: "install",
    label: "Confirm Installation",
    permission: "inventory.install",
  },
  {
    key: "return",
    label: "Acknowledge Return",
    permission: "inventory.receive",
  },
  { key: "fault", label: "Report Fault", permission: "inventory.edit" },
  {
    key: "maintenance",
    label: "Start Maintenance",
    permission: "inventory.edit",
  },
  { key: "repair", label: "Complete Repair", permission: "inventory.edit" },
  {
    key: "transfer",
    label: "Dispatch Transfer",
    permission: "inventory.transfer",
  },
  {
    key: "receive_transfer",
    label: "Receive Transfer",
    permission: "inventory.receive",
  },
  { key: "replace", label: "Replace Hardware", permission: "inventory.assign" },
  {
    key: "retire",
    label: "Approve Retirement",
    permission: "inventory.retire_approve",
  },
  {
    key: "dispose",
    label: "Approve Disposal",
    permission: "inventory.retire_approve",
  },
  { key: "edit", label: "Edit Details", permission: "inventory.edit" },
  { key: "archive", label: "Archive", permission: "inventory.archive" },
  {
    key: "delete_draft",
    label: "Delete Unissued Draft",
    permission: "inventory.delete_draft",
  },
];
const lifecycleActions: Record<string, string[]> = {
  Generated: ["verify", "retire"],
  Available: ["reserve", "assign", "fault", "transfer", "retire"],
  Reserved: ["release", "assign", "fault", "return"],
  Assigned: ["install", "return", "fault", "transfer"],
  Installed: ["fault", "return", "transfer", "replace"],
  Faulty: ["maintenance", "return", "retire", "replace"],
  "Under Maintenance": ["repair", "retire"],
  "In Transit": ["receive_transfer"],
  Returned: ["verify", "maintenance", "fault", "retire"],
  Retired: ["dispose"],
  Disposed: [],
};
const saveFile = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const safeSpreadsheet = (value: unknown) => {
  const str = String(value ?? "");
  return /^(?:\s*[=+@-]|[\t\r\n])/.test(str) ? `'${str}` : str;
};
const fieldLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const serialLabel = (asset: HardwareAsset) =>
  asset.serial_number ||
  (asset.registration_source === "Legacy" || asset.status === "Installed"
    ? "Serial Pending Reconciliation"
    : "Not Issued");
const localDate = (value: string) =>
  new Date(value).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "")
    return "Not recorded";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${fieldLabel(key)}: ${displayValue(item)}`)
      .join("; ");
  return String(value);
};
const modelEventLabel: Record<string, string> = {
  model_propose: "Model submitted",
  model_approve: "Model decision recorded",
  model_edit: "Specifications revised",
};
const assetEventLabel: Record<string, string> = {
  generated: "Serial issued",
  generate: "Serial issued",
  verify: "Physical stock verified",
  assigned: "Equipment allocated",
  assign: "Allocation confirmed",
  reserved: "Equipment reserved",
  reservation_allocated: "Reservation allocated",
  allocation_linked: "Linked to installation",
  install: "Installation confirmed",
  fault: "Fault reported",
  maintenance: "Maintenance started",
  repair: "Repair completed",
  replace: "Hardware replaced",
  transfer: "Transfer dispatched",
  receive_transfer: "Transfer received",
  return: "Equipment returned",
  retire: "Equipment retired",
  dispose: "Equipment disposed",
  approve: "Registration reviewed",
  print: "QR label printed",
};

export function HardwareInventoryModule({ user }: { user: User }) {
  const { toast, dismiss } = useToast();
  const qc = useQueryClient();
  const actorKey = hardwareActorKey(user);
  const [tab, setTab] = useState("registry");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [advanced, setAdvanced] = useState(false);
  const [moreMetrics, setMoreMetrics] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(filters.q || ""), 300);
    return () => clearTimeout(timer);
  }, [filters.q]);
  const [selected, setSelected] = useState<string[]>([]);
  const [profile, setProfile] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("hardware"),
  );
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [physical, setPhysical] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [approval, setApproval] = useState(false);
  const [fieldApproval, setFieldApproval] = useState(true);
  const [labels, setLabels] = useState<
    Array<{ asset: HardwareAsset; image: string }>
  >([]);
  const [labelLayout, setLabelLayout] = useState("a4");
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importPreview, setImportPreview] = useState<
    Array<{ row: number; valid: boolean; error?: string }>
  >([]);
  const [stockResult, setStockResult] = useState<StocktakeResult | null>(null);
  const [modelProfile, setModelProfile] = useState("");
  const catalog = useQuery<HardwareCatalog>({
    queryKey: ["hardware", "catalog", actorKey],
    queryFn: () => hardwareGet("/catalog"),
    enabled: can(user, "inventory.view"),
    refetchInterval: 30000,
    retry: false,
  });
  const modelHistory = useQuery<{
    model: { model_number: string; specifications: unknown };
    events: Array<{
      id: string;
      action: string;
      created_at: string;
      details: unknown;
      actor_id?: string;
      actor_name?: string;
    }>;
  }>({
    queryKey: ["hardware", "modelHistory", actorKey, modelProfile],
    queryFn: () => hardwareGet(`/models/${modelProfile}`),
    enabled: !!modelProfile && can(user, "inventory.manage_models"),
    retry: false,
  });
  const queryFilters = { ...filters, q: searchQuery };
  const request = hardwareQuery({ ...queryFilters, page, limit: pageSize });
  const assets = useQuery<{ rows: HardwareAsset[]; total: number }>({
    queryKey: ["hardware", "assets", actorKey, request],
    queryFn: () => hardwareGet(`/assets?${request}`),
    enabled: can(user, "inventory.view"),
    refetchInterval: 15000,
    retry: false,
  });
  const metrics = useQuery<InventorySummary>({
    queryKey: ["hardware", "summary", actorKey, queryFilters],
    queryFn: () =>
      hardwareGet(
        `/summary?${hardwareQuery({ ...queryFilters, status: undefined, report: undefined })}`,
      ),
    enabled: !!catalog.data,
    refetchInterval: 15000,
    retry: false,
  });
  const details = useQuery<HardwareAsset>({
    queryKey: ["hardware", "detail", actorKey, profile],
    queryFn: () => hardwareGet(`/assets/${encodeURIComponent(profile!)}`),
    enabled: !!profile && !!catalog.data,
    refetchInterval: 15000,
    retry: false,
  });
  const documents = useQuery<{ data: SecureFileMetadata[] }>({
    queryKey: ["hardware", "documents", actorKey, profile],
    queryFn: () =>
      apiClient.get(
        `/files?${hardwareQuery({ relatedEntityType: "hardware_asset", relatedEntityId: profile || "", limit: 100 })}`,
      ),
    enabled: !!details.data,
    retry: false,
  });
  const profileQr = useQuery<string>({
    queryKey: ["hardware", "qr", profile],
    queryFn: async () => {
      const { default: QR } = await import("qrcode");
      return QR.toDataURL(assetQrUrl(profile!), { width: 200, margin: 2 });
    },
    enabled: !!details.data && details.data.registration_source !== "Draft",
  });
  const alerts = useQuery<{
    rules: Array<{
      id: string;
      model_number: string;
      location_name: string;
      minimum_stock: number;
      available: number;
      warranty_days: number;
      aging_days: number;
    }>;
    low_stock: Array<{
      id: string;
      model_number: string;
      location_name: string;
      minimum_stock: number;
      available: number;
    }>;
    assets: HardwareAsset[];
  }>({
    queryKey: ["hardware", "alerts", actorKey],
    queryFn: () => hardwareGet("/alerts"),
    enabled: !!catalog.data,
    retry: false,
  });
  const [report, setReport] = useState("");
  const eventReport = ["replacement", "movement", "lifecycle"].includes(report);
  const movements = useQuery<{
    rows: Array<{
      id: string;
      serial_number: string;
      action: string;
      created_at: string;
      details: Record<string, unknown>;
      actor_id?: string;
      actor_name?: string;
    }>;
    total: number;
  }>({
    queryKey: [
      "hardware",
      "movements",
      actorKey,
      report,
      queryFilters,
      page,
      pageSize,
    ],
    queryFn: () =>
      hardwareGet(
        `/movements?${hardwareQuery({ ...queryFilters, page, limit: pageSize, action: report === "replacement" ? "replace" : undefined })}`,
      ),
    enabled:
      tab === "reports" && eventReport && can(user, "inventory.view_reports"),
    retry: false,
  });
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const filter = (key: string, value: string) => {
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "client_id" ? { branch_id: "" } : {}),
      ...(key === "subsidiary_id"
        ? { location_id: "", client_id: "", branch_id: "", technician_id: "" }
        : {}),
      ...(key === "family" ? { model_id: "" } : {}),
      ...(key === "status"
        ? { eligible: value === "Available" ? "true" : "" }
        : {}),
    }));
    setPage(1);
    setSelected([]);
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["hardware"] });
  const open = (name: string) => {
    dismiss();
    setOperationError("");
    setForm({
      subsidiary_id:
        user.subsidiary_id || catalog.data?.subsidiaries[0]?.id || "",
      serial_year: String(new Date().getFullYear()),
      model_year: String(new Date().getFullYear()),
      manufacturing_year: String(new Date().getFullYear()),
      quantity: "1",
      condition_grade: "Good",
      approval_status: "Approved",
      reservation_days: "7",
    });
    setPhysical(false);
    setHistorical(false);
    setModal(name);
  };
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setOperationError("");
    try {
      await work();
      await refresh();
      toast({ title: "Hardware operation completed" });
      setModal("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to complete the hardware operation.";
      setOperationError(message);
      toast({
        title: "Hardware operation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const rows = assets.data?.rows || [];
  const c = catalog.data;
  const options = (
    items: Array<{
      id: string;
      name?: string;
      model_number?: string;
      subsidiary_name?: string;
    }>,
  ) =>
    items.map((x) => ({
      value: x.id,
      label: x.name || x.model_number || x.subsidiary_name || x.id,
    }));
  const input = (key: string, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`hw-${key}`}>{label}</Label>
      <Input
        id={`hw-${key}`}
        type={type}
        value={form[key] || ""}
        onChange={(e) => set(key, e.target.value)}
        maxLength={
          key === "reason" || key === "notes" || key === "service_details"
            ? 5000
            : 255
        }
      />
    </div>
  );
  const subsidiary = (
    <HardwareSelect
      label="Owning Subsidiary"
      value={form.subsidiary_id || ""}
      onChange={(v) => {
        set("subsidiary_id", v);
        set("location_id", "");
      }}
      options={options(c?.subsidiaries || [])}
    />
  );
  const model = (
    <HardwareSelect
      label="Approved Model"
      value={form.model_id || ""}
      onChange={(v) => {
        set("model_id", v);
        const selected = c?.models.find((m) => m.id === v);
        if (selected) set("serial_year", String(selected.model_year));
        set("equipment_field", selected?.equipment_field || "");
      }}
      options={options(
        c?.models.filter((m) =>
          modal === "generate"
            ? m.approval_status === "Approved" && !m.historical_only
            : ["Approved", "Retired"].includes(m.approval_status),
        ) || [],
      )}
    />
  );
  const loc = (
    <HardwareSelect
      label="Inventory Location"
      value={form.location_id || ""}
      onChange={(v) => set("location_id", v)}
      options={options(
        c?.locations.filter((l) => l.subsidiary_id === form.subsidiary_id) ||
          [],
      )}
    />
  );
  const condition = (
    <HardwareSelect
      label="Physical Condition"
      value={form.condition_grade || "Good"}
      onChange={(v) => set("condition_grade", v)}
      options={(c?.conditions || []).map((v) => ({ value: v, label: v }))}
    />
  );
  const installationSelect = (
    <HardwareSelect
      label="Client / Branch Installation"
      value={form.installation_id || ""}
      onChange={(v) => set("installation_id", v)}
      options={(c?.installations || [])
        .filter(
          (i) =>
            i.subsidiary_id === form.subsidiary_id &&
            (!form.client_id || i.client_id === form.client_id) &&
            (modal === "legacy" || i.status !== "completed"),
        )
        .map((i) => ({
          value: i.id,
          label: `${i.client_name} / ${i.branch_name || "MAIN"} / ${i.id.slice(0, 8)}`,
        }))}
    />
  );
  const allocationClient = (
    <HardwareSelect
      label="Client"
      value={form.client_id || ""}
      onChange={(v) => {
        set("client_id", v);
        set("installation_id", "");
      }}
      empty="All Clients / Technician Only"
      options={(c?.clients || [])
        .filter((client) =>
          c?.installations?.some(
            (i) =>
              i.client_id === client.id &&
              i.subsidiary_id === form.subsidiary_id &&
              i.status !== "completed",
          ),
        )
        .map((client) => ({ value: client.id, label: client.client_name }))}
    />
  );
  const technicianSelect = (
    <HardwareSelect
      label="Receiving Technician"
      value={form.technician_id || ""}
      onChange={(v) => set("technician_id", v)}
      options={(c?.technicians || [])
        .filter((t) => t.subsidiary_id === form.subsidiary_id)
        .map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` }))}
    />
  );
  const confirm = (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={physical}
        onCheckedChange={(v) => setPhysical(v === true)}
      />
      Physical identity and serial confirmed
    </label>
  );
  const onScan = useCallback(
    (value: string) => {
      dismiss();
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      ) {
        setProfile(value);
        return;
      }
      void hardwareGet(`/assets?${hardwareQuery({ q: value, limit: 2 })}`)
        .then((result: { rows: HardwareAsset[] }) => {
          const match = result.rows.find(
            (asset) =>
              asset.id === value ||
              asset.serial_number?.toUpperCase() === value.toUpperCase(),
          );
          if (match) setProfile(match.id);
          else {
            setFilters({ q: value });
            setPage(1);
            setTab("registry");
            toast({
              title: "No matching hardware found",
              variant: "destructive",
            });
          }
        })
        .catch((error: Error) =>
          toast({
            title: "Unable to open hardware history",
            description: error.message,
            variant: "destructive",
          }),
        );
    },
    [dismiss, toast],
  );
  const submit = () =>
    run(async () => {
      const b = {
        ...form,
        physical_confirmed: physical,
        historical_only: historical,
        quantity: Number(form.quantity || 1),
      };
      if (modal === "generate") {
        const result = await hardwarePost("/generate", b);
        setFilters({
          model_id: form.model_id,
          subsidiary_id: form.subsidiary_id,
          status: "Generated",
        });
        setPage(1);
        setSelected(result.assets.map((asset: { id: string }) => asset.id));
        return result;
      }
      if (
        ["assign", "reserve"].includes(modal) &&
        user.role === "User" &&
        !physical
      )
        throw new Error(
          "Confirm the physical serial and device identity before selection.",
        );
      if (
        ["assign", "reserve"].includes(modal) &&
        form.client_id &&
        !form.installation_id
      )
        throw new Error(
          "Select the client's branch installation before allocation.",
        );
      if (modal === "legacy" || modal === "draft")
        return hardwarePost("/register", {
          ...b,
          source: modal === "legacy" ? "Legacy" : "Draft",
          manufacturing_year: form.manufacturing_year || null,
        });
      if (modal === "model")
        return hardwarePost("/model_propose", {
          ...b,
          specifications: { summary: form.specifications || "" },
        });
      if (modal === "location") return hardwarePost("/location", b);
      if (modal === "equipment_map") return hardwarePost("/equipment_map", b);
      if (modal === "alert_rule") return hardwarePost("/alert_rule", b);
      if (modal === "model_approve") return hardwarePost("/model_approve", b);
      if (modal === "model_edit")
        return hardwarePost("/model_edit", {
          ...b,
          specifications: { summary: form.specifications || "" },
        });
      if (modal === "reconcile") {
        const observed = (form.observed_ids || "")
          .split(/[\s,]+/)
          .filter(Boolean);
        const result = await hardwarePost("/reconcile", {
          ...b,
          observed_ids: observed,
        });
        setStockResult(result);
        return result;
      }
      if (modal === "import") {
        if (!importPreview.length || importPreview.some((r) => !r.valid))
          throw new Error("Resolve all import preview errors first.");
        const result = await hardwarePost("/import", {
          rows: importRows,
          commit: true,
          approval_reference: form.approval_reference,
        });
        setImportPreview(result.rows);
        if (result.rows.some((r: { valid: boolean }) => !r.valid))
          throw new Error(
            "Some rows were rejected. Review row results; successful rows remain registered.",
          );
        return result;
      }
      return hardwarePost(`/assets/${profile}/${modal}`, {
        ...b,
        serial_number: details.data?.serial_number,
      });
    });
  const exportRows = async (format: string) =>
    run(async () => {
      if (tab === "reports" && eventReport) {
        const all: Array<{
          serial_number: string;
          action: string;
          created_at: string;
          details: Record<string, unknown>;
          actor_id?: string;
          actor_name?: string;
        }> = [];
        let p = 1;
        let total = 1;
        while (all.length < total) {
          const data = await hardwareGet(
            `/movements?${hardwareQuery({ ...filters, page: p++, limit: 100, action: report === "replacement" ? "replace" : undefined })}`,
          );
          all.push(...data.rows);
          total = data.total;
          if (!data.rows.length) break;
        }
        const data = all.map((e) => [
          e.serial_number || "",
          assetEventLabel[e.action] || fieldLabel(e.action),
          e.actor_name || e.actor_id || "Not recorded",
          localDate(e.created_at),
          displayValue(e.details),
        ]);
        if (format === "csv") {
          const { default: Papa } = await import("papaparse");
          saveFile(
            new Blob(
              [
                Papa.unparse({
                  fields: [
                    "Serial",
                    "Event",
                    "Performed By",
                    "Date / Time (EAT)",
                    "Details",
                  ],
                  data: data.map((row) => row.map(safeSpreadsheet)),
                }),
              ],
              { type: "text/csv;charset=utf-8" },
            ),
            "hardware-history.csv",
          );
        } else if (format === "xlsx") {
          const { default: writeXlsx } =
            await import("write-excel-file/browser");
          await writeXlsx(
            [
              [
                "Serial",
                "Event",
                "Performed By",
                "Date / Time (EAT)",
                "Details",
              ],
              ...data,
            ].map((row) =>
              row.map((value) => ({
                value: safeSpreadsheet(value),
                type: String,
              })),
            ),
          ).toFile("hardware-history.xlsx");
        } else {
          const [{ jsPDF }, { default: autoTable }] = await Promise.all([
            import("jspdf"),
            import("jspdf-autotable"),
          ]);
          const doc = new jsPDF({ orientation: "landscape" });
          doc.text("MAREZI | Hardware History", 14, 16);
          autoTable(doc, {
            startY: 22,
            head: [
              [
                "Serial",
                "Event",
                "Performed By",
                "Date / Time (EAT)",
                "Details",
              ],
            ],
            body: data,
            styles: { fontSize: 8 },
          });
          doc.save("hardware-history.pdf");
        }
        return;
      }
      const all: HardwareAsset[] = [];
      let p = 1;
      let total = 1;
      while (all.length < total) {
        const data = await hardwareGet(
          `/export?${hardwareQuery({ ...filters, page: p++, limit: 100 })}`,
        );
        all.push(...data.rows);
        total = data.total;
        if (!data.rows.length) break;
      }
      const columns = [
        "serial_number",
        "model_number",
        "family",
        "manufacturer_serial",
        "subsidiary_name",
        "location_name",
        "client_name",
        "branch_name",
        "custodian_id",
        "condition_grade",
        "status",
        "approval_status",
        "physical_verified",
        "reconciliation_status",
        "registration_source",
        "manufacturing_year",
        "warranty_expires",
        "created_at",
        "installed_at",
      ];
      if (format === "csv") {
        const { default: Papa } = await import("papaparse");
        saveFile(
          new Blob(
            [
              Papa.unparse({
                fields: columns,
                data: all.map((a) =>
                  columns.map((col) =>
                    safeSpreadsheet(a[col as keyof HardwareAsset]),
                  ),
                ),
              }),
            ],
            { type: "text/csv;charset=utf-8" },
          ),
          "hardware-inventory.csv",
        );
      } else if (format === "xlsx") {
        const { default: writeXlsx } = await import("write-excel-file/browser");
        await writeXlsx([
          columns.map((value) => ({ value, fontWeight: "bold" as const })),
          ...all.map((a) =>
            columns.map((col) => ({
              value: safeSpreadsheet(a[col as keyof HardwareAsset]),
              type: String,
            })),
          ),
        ]).toFile("hardware-inventory.xlsx");
      } else {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const doc = new jsPDF({ orientation: "landscape" });
        doc.text("MAREZI | Hardware Inventory", 14, 16);
        autoTable(doc, {
          startY: 22,
          head: [
            [
              "Serial",
              "Model",
              "Subsidiary",
              "Location",
              "Status",
              "Condition",
            ],
          ],
          body: all.map((a) => [
            a.serial_number || "Unknown",
            a.model_number,
            a.subsidiary_name,
            a.location_name || a.client_name || "",
            a.status,
            a.condition_grade,
          ]),
          styles: { fontSize: 8 },
        });
        doc.save("hardware-inventory.pdf");
      }
    });
  const prepareLabels = () =>
    run(async () => {
      const ids = profile ? [profile] : selected;
      if (!ids.length) throw new Error("Select assets for labels.");
      const { default: QR } = await import("qrcode");
      const next = [];
      for (const id of ids) {
        const a = await hardwareGet(`/assets/${id}`);
        if (a.registration_source === "Draft")
          throw new Error(
            "Unissued drafts cannot receive official hardware labels.",
          );
        next.push({
          asset: a,
          image: await QR.toDataURL(assetQrUrl(id), { width: 240, margin: 2 }),
        });
      }
      setLabels(next);
    });
  const printLabels = () =>
    run(async () => {
      const { jsPDF } = await import("jspdf");
      const thermal = labelLayout === "thermal";
      const doc = new jsPDF({ unit: "mm", format: thermal ? [100, 60] : "a4" });
      for (let i = 0; i < labels.length; i++) {
        if (i > 0 && (thermal || i % 8 === 0)) doc.addPage();
        const { asset, image } = labels[i];
        const x = thermal ? 3 : 10 + (i % 2) * 96;
        const y = thermal ? 3 : 12 + Math.floor((i % 8) / 2) * 67;
        doc.setFontSize(11);
        doc.text("MAREZI", x + 2, y + 5);
        doc.setFontSize(8);
        doc.text(`${asset.family} - ${asset.nickname}`, x + 2, y + 11);
        doc.text(`Model: ${asset.model_number}`, x + 2, y + 17);
        doc.setFontSize(7);
        doc.text(
          `Serial: ${asset.serial_number || "Unknown / Reconciliation"}`,
          x + 2,
          y + 22,
        );
        doc.addImage(image, "PNG", x + 2, y + 25, 30, 30);
        await hardwarePost(`/assets/${asset.id}/print`, {
          layout: labelLayout,
        });
      }
      doc.save("marezi-hardware-labels.pdf");
    });
  const loadImport = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Import files must be at most 5 MB.");
      let imported: Record<string, unknown>[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const { default: Papa } = await import("papaparse");
        const parsed = Papa.parse(await file.text(), {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        imported = parsed.data;
      } else {
        const { readSheet } = await import("read-excel-file/browser");
        const data = await readSheet(file);
        if (!data.length) throw new Error("Workbook is empty.");
        const headings = data[0].map(String);
        imported = data
          .slice(1)
          .map((row) =>
            Object.fromEntries(
              headings.map((key, col) => [
                key,
                row[col] == null ? "" : String(row[col]),
              ]),
            ),
          );
      }
      if (imported.length > 500)
        throw new Error("Import at most 500 rows per reviewed batch.");
      setImportRows(imported);
      const result = await hardwarePost("/import", {
        rows: imported,
        commit: false,
      });
      setImportPreview(result.rows);
    } catch (e) {
      setImportRows([]);
      setImportPreview([]);
      toast({
        title: "Import validation failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (profile) {
      setSelected([]);
      dismiss();
    }
  }, [profile, dismiss]);
  useEffect(() => {
    if (catalog.data) {
      setApproval(Boolean(catalog.data.policy.issuance_approved));
      setFieldApproval(Boolean(catalog.data.policy.field_approval_required));
    }
  }, [catalog.data]);
  if (!can(user, "inventory.view"))
    return (
      <Alert>
        <AlertDescription>
          Inventory access requires an authorized permission grant.
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-tour="inventory-header" className="text-2xl font-semibold">
          Hardware & Inventory
        </h1>
        <div className="flex flex-wrap gap-2">
          <HardwareTour user={user} tab={tab} onTabChange={setTab} />
          <Button
            variant="outline"
            size="icon"
            title="Refresh inventory"
            aria-label="Refresh inventory"
            onClick={() => void refresh()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {can(user, "inventory.generate_serial") && (
            <Button
              data-tour="inventory-generate"
              onClick={() => open("generate")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Generate Serials
            </Button>
          )}
          {can(user, "inventory.register") && (
            <Button variant="outline" onClick={() => open("legacy")}>
              <PackageCheck className="mr-2 h-4 w-4" />
              Register Legacy Hardware
            </Button>
          )}
        </div>
      </div>
      {catalog.error && (
        <Alert variant="destructive">
          <AlertDescription>{catalog.error.message}</AlertDescription>
        </Alert>
      )}
      {catalog.isLoading && (
        <p role="status" className="flex gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hardware registry...
        </p>
      )}
      {c && (
        <>
          {!c.policy.issuance_approved && (
            <Alert>
              <AlertDescription>
                Serial issuance awaits formal serialization policy approval.
              </AlertDescription>
            </Alert>
          )}
          <div
            data-tour="inventory-overview"
            className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5"
          >
            {[
              ["Total Registered Assets", metrics.data?.total || 0],
              ...c.statuses.map((s) => [s, metrics.data?.counts[s] || 0]),
              ["Pending Field Registrations", metrics.data?.pending || 0],
            ]
              .filter(
                ([label]) =>
                  moreMetrics ||
                  [
                    "Total Registered Assets",
                    "Available",
                    "Installed",
                    "Faulty",
                    "Under Maintenance",
                  ].includes(String(label)),
              )
              .map(([label, count]) => (
                <button
                  key={label}
                  className="min-h-20 bg-background p-3 text-left hover:bg-muted"
                  onClick={() => {
                    setFilters((f) => ({
                      ...f,
                      report: "",
                      status: c.statuses.includes(String(label))
                        ? String(label)
                        : "",
                      approval_status:
                        label === "Pending Field Registrations"
                          ? "Pending"
                          : "",
                      eligible: label === "Available" ? "true" : "",
                    }));
                    setPage(1);
                    setSelected([]);
                    setTab("registry");
                  }}
                >
                  <span className="block text-xs text-muted-foreground">
                    {label === "Generated" ? "Generated / Unverified" : label}
                  </span>
                  <span className="text-xl font-semibold">{count}</span>
                </button>
              ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={moreMetrics}
            onClick={() => setMoreMetrics(!moreMetrics)}
          >
            {moreMetrics ? "Fewer Stock Metrics" : "All Stock Metrics"}
          </Button>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="max-w-full overflow-x-auto h-auto justify-start flex-nowrap">
              <TabsTrigger value="registry">Registry</TabsTrigger>
              {['InventoryOfficer','SuperAdmin','Admin','Teamlead'].includes(user.role) && <TabsTrigger value="equipment-requirements">Equipment Requirements</TabsTrigger>}
              <TabsTrigger data-tour="inventory-models" value="models">
                Models
              </TabsTrigger>
              <TabsTrigger data-tour="inventory-locations" value="locations">
                Locations
              </TabsTrigger>
              <TabsTrigger data-tour="inventory-alerts" value="alerts">
                Stock Alerts
              </TabsTrigger>
              {can(user, "inventory.view_reports") && (
                <TabsTrigger value="reports">Reports</TabsTrigger>
              )}
              {can(user, "inventory.policy") && (
                <TabsTrigger data-tour="inventory-policy" value="policy">
                  Policy
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="equipment-requirements"><EquipmentRequirements user={user}/></TabsContent>
            <TabsContent value="alerts" className="space-y-4">
              {can(user, "inventory.edit") && (
                <Button variant="outline" onClick={() => open("alert_rule")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Configure Stock Alert
                </Button>
              )}
              {alerts.error && <p role="alert">{alerts.error.message}</p>}
              {alerts.data?.low_stock.map((a) => (
                <Alert key={a.id}>
                  <AlertDescription>
                    {a.model_number} / {a.location_name}: {a.available}{" "}
                    available; minimum {a.minimum_stock}.
                  </AlertDescription>
                </Alert>
              ))}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reconciliation</TableHead>
                      <TableHead>Warranty</TableHead>
                      <TableHead>Registered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.data?.assets.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <button
                            className="text-primary hover:underline"
                            onClick={() => setProfile(a.id)}
                          >
                            {a.serial_number || "Unknown"}
                          </button>
                        </TableCell>
                        <TableCell>{a.status}</TableCell>
                        <TableCell>{a.reconciliation_status}</TableCell>
                        <TableCell>
                          {a.warranty_expires?.slice(0, 10) || "-"}
                        </TableCell>
                        <TableCell>{a.created_at}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!alerts.data?.low_stock.length &&
                !alerts.data?.assets.length && (
                  <p className="text-sm text-muted-foreground">
                    No stock, warranty or reconciliation alerts.
                  </p>
                )}
            </TabsContent>
            <TabsContent value="models" className="space-y-3">
              {can(user,'inventory.approve_models') && <VariantManager variants={c?.variants || []}/>}
              <div className="flex flex-wrap gap-2">
                {can(user, "inventory.manage_models") && (
                  <Button onClick={() => open("model")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Propose Model
                  </Button>
                )}
                {can(user,"inventory.register") && <Button variant="outline" onClick={()=>open("equipment_map")}><PackageCheck className="mr-2 h-4 w-4"/>Map Equipment Item</Button>}
                {can(user, "inventory.approve_models") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => open("model_approve")}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Model Decision
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => open("model_edit")}
                    >
                      Amend Specifications
                    </Button>
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.models.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {can(user, "inventory.manage_models") ? (
                            <button
                              className="text-primary hover:underline"
                              onClick={() => setModelProfile(m.id)}
                            >
                              {m.model_number}
                            </button>
                          ) : (
                            m.model_number
                          )}
                        </TableCell>
                        <TableCell>{m.family}</TableCell>
                        <TableCell>{m.model_year}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.approval_status}</Badge>
                        </TableCell>
                        <TableCell>
                          {m.historical_only ? "Historical only" : "Current"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!c.models.length && (
                <p className="text-sm text-muted-foreground">
                  No hardware models registered.
                </p>
              )}
            </TabsContent>
            <TabsContent value="locations" className="space-y-3">
              {can(user, "inventory.register") && (
                <Button onClick={() => open("location")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Location
                </Button>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Subsidiary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.locations.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.name}</TableCell>
                      <TableCell>
                        {
                          c.subsidiaries.find((s) => s.id === l.subsidiary_id)
                            ?.subsidiary_name
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="policy" className="space-y-4 max-w-xl">
              <h2 className="text-lg font-medium">Serialization Approval</h2>
              <p className="text-sm">
                Per-model annual unit sequences, starting at 1001. Core / MC / M
                is the CIMS extension.
              </p>
              <label className="flex gap-2 items-center">
                <Checkbox
                  checked={approval}
                  onCheckedChange={(v) => setApproval(v === true)}
                />
                Approve serial issuance
              </label>
              <label className="flex gap-2 items-center">
                <Checkbox
                  checked={fieldApproval}
                  onCheckedChange={(v) => setFieldApproval(v === true)}
                />
                Require approval for field registrations
              </label>
              {input("approval_reference", "Organizational Approval Reference")}
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    hardwarePost("/policy", {
                      sequence_partition: "per_model_year",
                      issuance_approved: approval,
                      field_approval_required: fieldApproval,
                      approval_reference: form.approval_reference,
                    }),
                  )
                }
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Save Approval
              </Button>
            </TabsContent>
            {["registry", "reports"].map((view) => (
              <TabsContent key={view} value={view} className="space-y-4">
                {view === 'reports' && metrics.data && <InventoryReportSummary
                  data={metrics.data} canExport={can(user, 'inventory.export')}
                  onSelect={(v) => {
                    setReport(v);
                    setFilters((f) => ({...f, status: c.statuses.includes(v) ? v : '',
                      report: c.statuses.includes(v) ? '' : v, eligible: v === 'Available' ? 'true' : ''}));
                    setPage(1);
                  }}
                />}
                {view === 'reports' && metrics.isError && <Alert variant="destructive">
                  <AlertDescription>Inventory totals could not be loaded. Refresh to try again.</AlertDescription>
                </Alert>}
                {view === "reports" && (
                  <HardwareSelect
                    label="Hardware Report"
                    value={report}
                    onChange={(v) => {
                      setReport(v);
                      setFilters((f) => ({
                        ...f,
                        status: c.statuses.includes(v) ? v : "",
                        report: c.statuses.includes(v) ? "" : v,
                        eligible: v === "Available" ? "true" : "",
                      }));
                      setPage(1);
                    }}
                    options={reportTypes
                      .slice(1)
                      .map(([value, label]) => ({ value, label }))}
                    empty="All Assets"
                  />
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="hw-search">Serial, Model or Asset ID</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="hw-search"
                        data-tour="inventory-search"
                        className="pl-9"
                        placeholder="Search serial, model or asset ID..."
                        value={filters.q || ""}
                        onChange={(e) => filter("q", e.target.value)}
                      />
                    </div>
                  </div>
                  <HardwareSelect
                    label="Subsidiary Filter"
                    value={filters.subsidiary_id || ""}
                    onChange={(v) => filter("subsidiary_id", v)}
                    options={options(c.subsidiaries)}
                    empty="All Authorized"
                  />
                  <HardwareSelect
                    label="Status Filter"
                    value={filters.status || ""}
                    onChange={(v) => {
                      filter("status", v);
                      filter("eligible", v === "Available" ? "true" : "");
                    }}
                    options={c.statuses.map((v) => ({ value: v, label: v }))}
                    empty="All Statuses"
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      variant="outline"
                      aria-expanded={advanced}
                      aria-controls={`hardware-advanced-${view}`}
                      data-tour="inventory-filters"
                      onClick={() => setAdvanced(!advanced)}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Advanced Filters (
                      {
                        Object.entries(filters).filter(
                          ([key, value]) =>
                            value &&
                            ![
                              "q",
                              "status",
                              "eligible",
                              "report",
                              "subsidiary_id",
                            ].includes(key),
                        ).length
                      }
                      )
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Clear all filters"
                      aria-label="Clear all filters"
                      onClick={() => {
                        setFilters({});
                        setReport("");
                        setPage(1);
                        setSelected([]);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {advanced && (
                  <div
                    id={`hardware-advanced-${view}`}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-b pb-4"
                  >
                    <HardwareSelect
                      label="Model Filter"
                      value={filters.model_id || ""}
                      onChange={(v) => filter("model_id", v)}
                      options={options(
                        c.models.filter(
                          (m) => !filters.family || m.family === filters.family,
                        ),
                      )}
                      empty="All Models"
                    />
                    <HardwareSelect
                      label="Location Filter"
                      value={filters.location_id || ""}
                      onChange={(v) => filter("location_id", v)}
                      options={options(
                        c.locations.filter(
                          (l) =>
                            !filters.subsidiary_id ||
                            l.subsidiary_id === filters.subsidiary_id,
                        ),
                      )}
                      empty="All Locations"
                    />
                    <HardwareSelect
                      label="Family Filter"
                      value={filters.family || ""}
                      onChange={(v) => filter("family", v)}
                      options={[
                        ...new Set(c.variants.map((v) => v.family)),
                      ].map((v) => ({ value: v, label: v }))}
                      empty="All Families"
                    />
                    <HardwareSelect
                      label="Client Filter"
                      value={filters.client_id || ""}
                      onChange={(v) => filter("client_id", v)}
                      options={(c.clients || []).map((v) => ({
                        value: v.id,
                        label: v.client_name,
                      }))}
                      empty="All Clients"
                    />
                    <HardwareSelect
                      label="Branch Filter"
                      value={filters.branch_id || ""}
                      onChange={(v) => filter("branch_id", v)}
                      options={(c.branches || [])
                        .filter(
                          (v) =>
                            !filters.client_id ||
                            v.client_id === filters.client_id,
                        )
                        .map((v) => ({ value: v.id, label: v.branch_name }))}
                      empty="All Branches"
                    />
                    <HardwareSelect
                      label="Technician Filter"
                      value={filters.technician_id || ""}
                      onChange={(v) => filter("technician_id", v)}
                      options={(c.technicians || []).map((v) => ({
                        value: v.id,
                        label: `${v.first_name} ${v.last_name}`,
                      }))}
                      empty="All Technicians"
                    />
                    <div>
                      <Label htmlFor="hw-filter-from">From</Label>
                      <Input
                        id="hw-filter-from"
                        type="date"
                        value={filters.from || ""}
                        onChange={(e) => filter("from", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hw-filter-to">To</Label>
                      <Input
                        id="hw-filter-to"
                        type="date"
                        value={filters.to || ""}
                        onChange={(e) => filter("to", e.target.value)}
                      />
                    </div>
                    <HardwareSelect
                      label="Sort"
                      value={filters.sort || "created"}
                      onChange={(v) => filter("sort", v)}
                      options={[
                        "created",
                        "updated",
                        "serial",
                        "model",
                        "status",
                      ].map((v) => ({ value: v, label: v }))}
                    />
                    <HardwareSelect
                      label="Sort Direction"
                      value={filters.direction || "desc"}
                      onChange={(v) => filter("direction", v)}
                      options={[
                        { value: "asc", label: "Ascending" },
                        { value: "desc", label: "Descending" },
                      ]}
                    />
                    <label className="flex gap-2 items-center p-2 text-sm">
                      <Checkbox
                        checked={filters.archived === "true"}
                        onCheckedChange={(v) =>
                          filter("archived", v === true ? "true" : "")
                        }
                      />
                      Include Archived
                    </label>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 items-start">
                  <div data-tour="inventory-scan">
                    <QrScanner onScan={onScan} />
                  </div>
                  {can(user, "inventory.export") && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          data-tour="inventory-export"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["csv", "xlsx", "pdf"].map((fmt) => (
                          <DropdownMenuItem
                            key={fmt}
                            onSelect={() => void exportRows(fmt)}
                          >
                            Export{" "}
                            {fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {can(user, "inventory.print_qr") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !selected.length}
                      data-tour="inventory-labels"
                      onClick={() => void prepareLabels()}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Labels ({selected.length})
                    </Button>
                  )}
                  {can(user, "inventory.reconcile") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open("reconcile")}
                      data-tour="inventory-stocktake"
                    >
                      <PackageCheck className="mr-2 h-4 w-4" />
                      Stocktake
                    </Button>
                  )}
                  {can(user, "inventory.import") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        open("import");
                        setImportRows([]);
                        setImportPreview([]);
                      }}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      <span data-tour="inventory-import">Import</span>
                    </Button>
                  )}
                  {can(user, "inventory.register") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open("draft")}
                      data-tour="inventory-draft"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Draft
                    </Button>
                  )}
                  {!!selected.length && (
                    <div className="flex gap-2 items-center text-sm">
                      <span>{selected.length} selected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected([])}
                      >
                        Deselect All
                      </Button>
                    </div>
                  )}
                </div>
                {(assets.error || movements.error) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {(assets.error || movements.error)?.message}
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => {
                          void assets.refetch();
                          void movements.refetch();
                        }}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {view === "reports" && eventReport ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Serial</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Performed By</TableHead>
                            <TableHead>Date / Time (EAT)</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {movements.data?.rows.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>{e.serial_number}</TableCell>
                              <TableCell>
                                {assetEventLabel[e.action] ||
                                  fieldLabel(e.action)}
                              </TableCell>
                              <TableCell>
                                {e.actor_name || e.actor_id || "Not recorded"}
                              </TableCell>
                              <TableCell>{localDate(e.created_at)}</TableCell>
                              <TableCell className="max-w-xs whitespace-pre-wrap break-words">
                                {displayValue(e.details)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex gap-3 items-center">
                      <span className="text-sm">
                        {movements.data?.total || 0} events · Page {page}
                      </span>
                      <Button
                        aria-label="Previous events page"
                        variant="outline"
                        size="icon"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label="Next events page"
                        variant="outline"
                        size="icon"
                        disabled={
                          page * pageSize >= (movements.data?.total || 0)
                        }
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm:hidden divide-y border rounded-md">
                      <div className="flex items-center gap-3 p-3 text-sm">
                        <Checkbox
                          aria-label="Select all visible assets"
                          checked={
                            !!rows.length &&
                            rows.every((a) => selected.includes(a.id))
                          }
                          onCheckedChange={(v) =>
                            setSelected(v === true ? rows.map((a) => a.id) : [])
                          }
                        />
                        Select Visible Assets
                      </div>
                      {rows.map((asset) => (
                        <article
                          key={asset.id}
                          className={`p-3 flex flex-col gap-2 ${selected.includes(asset.id) ? "bg-muted" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              className="mt-1"
                              aria-label={`Select ${asset.serial_number || asset.id}`}
                              checked={selected.includes(asset.id)}
                              onCheckedChange={(v) =>
                                setSelected((ids) =>
                                  v === true
                                    ? [...ids, asset.id]
                                    : ids.filter((id) => id !== asset.id),
                                )
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                className="text-primary font-mono text-xs font-medium text-left break-words"
                                onClick={() => setProfile(asset.id)}
                              >
                                {serialLabel(asset)}
                              </button>
                              <p className="text-xs text-muted-foreground">
                                {asset.model_number} / {asset.family}
                              </p>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="View details and history"
                              aria-label={`Actions for ${serialLabel(asset)}`}
                              data-tour="inventory-record-actions"
                              onClick={() => setProfile(asset.id)}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="outline">{asset.status}</Badge>
                            <span className="text-xs">
                              {asset.physical_verified
                                ? "Verified"
                                : "Unverified"}
                            </span>
                            {asset.archived_at && (
                              <span className="text-xs">Archived</span>
                            )}
                          </div>
                          <p className="text-sm break-words">
                            {asset.subsidiary_name} /{" "}
                            {asset.location_name || "Location Not Recorded"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {asset.client_name || "Not Allocated"}
                            {asset.branch_name ? ` / ${asset.branch_name}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Condition: {asset.condition_grade || "Not Assessed"}{" "}
                            / Approval: {asset.approval_status}
                          </p>
                        </article>
                      ))}
                      {!assets.isFetching && !rows.length && (
                        <p className="p-4 text-sm">
                          No hardware assets match these filters.
                        </p>
                      )}
                    </div>
                    <div className="hidden sm:block overflow-x-auto border rounded-md">
                      <Table className="min-w-[1000px] [&_td]:py-3 [&_th]:h-11">
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <Checkbox
                                aria-label="Select all visible assets"
                                checked={
                                  !!rows.length &&
                                  rows.every((a) => selected.includes(a.id))
                                }
                                onCheckedChange={(v) =>
                                  setSelected(
                                    v === true ? rows.map((a) => a.id) : [],
                                  )
                                }
                              />
                            </TableHead>
                            <TableHead>Serial / Model</TableHead>
                            <TableHead>Family</TableHead>
                            <TableHead>Subsidiary / Location</TableHead>
                            <TableHead>Client / Branch</TableHead>
                            <TableHead>Condition</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Verification</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((a) => (
                            <TableRow
                              key={a.id}
                              data-state={
                                selected.includes(a.id) ? "selected" : undefined
                              }
                            >
                              <TableCell>
                                <Checkbox
                                  aria-label={`Select ${a.serial_number || a.id}`}
                                  checked={selected.includes(a.id)}
                                  onCheckedChange={(v) =>
                                    setSelected((s) =>
                                      v === true
                                        ? [...s, a.id]
                                        : s.filter((id) => id !== a.id),
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <button
                                  className="text-primary hover:underline text-left font-medium font-mono text-xs whitespace-nowrap focus-visible:outline focus-visible:outline-2"
                                  title={serialLabel(a)}
                                  onClick={() => setProfile(a.id)}
                                >
                                  {serialLabel(a)}
                                </button>
                                <div className="text-xs text-muted-foreground">
                                  {a.model_number}
                                </div>
                              </TableCell>
                              <TableCell>{a.family}</TableCell>
                              <TableCell>
                                {a.subsidiary_name}
                                <div className="text-xs text-muted-foreground">
                                  {a.location_name || "-"}
                                </div>
                              </TableCell>
                              <TableCell>
                                {a.client_name || "Not Allocated"}
                                <div className="text-xs text-muted-foreground">
                                  {a.branch_name}
                                </div>
                              </TableCell>
                              <TableCell>
                                {a.condition_grade || "Not Assessed"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{a.status}</Badge>
                                {a.archived_at && (
                                  <div className="text-xs">Archived</div>
                                )}
                              </TableCell>
                              <TableCell>
                                {a.physical_verified
                                  ? "Verified"
                                  : "Unverified"}
                                <div
                                  className="text-xs text-muted-foreground"
                                  title={`Registration approval: ${a.approval_status}. Stock reconciliation: ${a.reconciliation_status}.`}
                                >
                                  Approval: {a.approval_status}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Actions for ${serialLabel(a)}`}
                                      data-tour="inventory-record-actions"
                                      title="Asset actions"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={() => setProfile(a.id)}
                                    >
                                      View Details / History
                                    </DropdownMenuItem>
                                    {can(user, "inventory.modify_identity") &&
                                      a.registration_source === "Legacy" &&
                                      !a.serial_number && (
                                        <DropdownMenuItem
                                          onSelect={() => setProfile(a.id)}
                                        >
                                          Reconcile Serial
                                        </DropdownMenuItem>
                                      )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {!assets.isFetching && !rows.length && (
                        <p className="p-6 text-center text-sm text-muted-foreground">
                          No hardware assets match these filters.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        {rows.length ? (page - 1) * pageSize + 1 : 0} -{" "}
                        {Math.min(page * pageSize, assets.data?.total || 0)} of{" "}
                        {assets.data?.total || 0} assets
                      </span>
                      <HardwareSelect
                        label="Rows Per Page"
                        value={String(pageSize)}
                        onChange={(v) => {
                          setPageSize(Number(v));
                          setPage(1);
                          setSelected([]);
                        }}
                        options={[15, 30, 50, 100].map((v) => ({
                          value: String(v),
                          label: String(v),
                        }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          aria-label="Previous page"
                          title="Previous page"
                          size="icon"
                          variant="outline"
                          disabled={page === 1 || assets.isFetching}
                          onClick={() => {
                            setPage((p) => p - 1);
                            setSelected([]);
                          }}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Next page"
                          title="Next page"
                          size="icon"
                          variant="outline"
                          disabled={
                            page * pageSize >= (assets.data?.total || 0) ||
                            assets.isFetching
                          }
                          onClick={() => {
                            setPage((p) => p + 1);
                            setSelected([]);
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
      <Dialog
        open={!!profile}
        onOpenChange={(v) => {
          if (!v) setProfile(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {details.data?.serial_number || "Hardware Asset"}
            </DialogTitle>
            <DialogDescription>
              {details.data?.model_number || "Asset profile"}
            </DialogDescription>
          </DialogHeader>
          {details.error && (
            <p role="alert" className="text-destructive">
              {details.error.message}
            </p>
          )}
          {details.isLoading && <p>Loading asset...</p>}
          {details.data && (
            <>
              <section className="space-y-3" aria-label="Hardware history">
                <h3 className="text-base font-medium">Lifecycle Timeline</h3>
                {can(user, "inventory.view_audit") ? (
                  details.data.events?.length ? (
                    <ol className="space-y-4 border-l pl-4">
                      {details.data.events.map((event) => (
                        <li key={event.id}>
                          <p className="text-sm font-medium">
                            {assetEventLabel[event.action] ||
                              fieldLabel(event.action)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {localDate(event.created_at)} (EAT) ·{" "}
                            {event.actor_name ||
                              event.actor_id ||
                              "Operator not recorded"}
                          </p>
                          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                            {Object.entries(event.details || {})
                              .filter(
                                ([, value]) =>
                                  value !== null &&
                                  value !== undefined &&
                                  value !== "",
                              )
                              .map(([key, value]) => (
                                <div key={key} className="min-w-0">
                                  <dt className="text-xs text-muted-foreground">
                                    {fieldLabel(key)}
                                  </dt>
                                  <dd className="break-words text-sm">
                                    {displayValue(value)}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No lifecycle events recorded.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Lifecycle audit access is restricted. Available assignment
                    history is shown below.
                  </p>
                )}
              </section>
              {profileQr.data && (
                <img
                  src={profileQr.data}
                  alt="Permanent asset QR"
                  width={96}
                  height={96}
                />
              )}
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries({
                  Family: details.data.family,
                  Subsidiary: details.data.subsidiary_name,
                  Status: details.data.status,
                  Condition: details.data.condition_grade,
                  Manufacturer: details.data.manufacturer_serial,
                  Location: details.data.location_name,
                  Client: details.data.client_name,
                  Branch: details.data.branch_name,
                  Custodian: details.data.custodian_id,
                  Approval: details.data.approval_status,
                  Reconciliation: details.data.reconciliation_status,
                  "Manufacturing Year": details.data.manufacturing_year,
                  Warranty: details.data.warranty_expires,
                  Source: details.data.registration_source,
                  Registered: details.data.created_at,
                  Updated: details.data.updated_at,
                  Notes: details.data.notes,
                }).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm">
                      {String(value || "-")}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                {actionDefinitions
                  .filter(
                    (a) =>
                      can(user, a.permission) &&
                      (a.key === "identity"
                        ? details.data?.registration_source === "Legacy"
                        : a.key === "approve"
                          ? details.data?.approval_status === "Pending"
                          : a.key === "delete_draft"
                            ? details.data?.registration_source === "Draft"
                            : a.key === "archive"
                              ? [
                                  "Generated",
                                  "Returned",
                                  "Retired",
                                  "Disposed",
                                ].includes(details.data!.status)
                              : a.key === "edit"
                                ? true
                                : lifecycleActions[
                                    details.data!.status
                                  ]?.includes(a.key)),
                  )
                  .map((a) => (
                    <Button
                      key={a.key}
                      size="sm"
                      variant="outline"
                      disabled={busy || !!details.data?.archived_at}
                      onClick={() => {
                        open(a.key);
                        setForm((f) => ({
                          ...f,
                          subsidiary_id: details.data!.subsidiary_id,
                          installation_id: details.data!.installation_id || "",
                          technician_id: details.data!.custodian_id || "",
                          client_id:
                            c?.installations?.find(
                              (i) => i.id === details.data!.installation_id,
                            )?.client_id || "",
                          manufacturer_serial:
                            details.data!.manufacturer_serial || "",
                          location_id: details.data!.location_id || "",
                          condition_grade:
                            details.data!.condition_grade || "Good",
                          notes: details.data!.notes || "",
                          existing_serial: details.data!.serial_number || "",
                          manufacturing_year: String(
                            details.data!.manufacturing_year || "",
                          ),
                          warranty_expires:
                            details.data!.warranty_expires?.slice(0, 10) || "",
                        }));
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                {can(user, "inventory.print_qr") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void prepareLabels()}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    QR Label
                  </Button>
                )}
              </div>
              {details.data.technical_configuration && (
                <section className="space-y-2">
                  <h3 className="text-base font-medium">
                    Technical Configuration
                  </h3>
                  <p className="text-sm break-words">
                    {displayValue(details.data.technical_configuration)}
                  </p>
                </section>
              )}
              <h3 className="text-base font-medium">Assignment History</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Installation</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Installed</TableHead>
                      <TableHead>Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.data.assignments?.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.installation_id}</TableCell>
                        <TableCell>{localDate(a.assigned_at)}</TableCell>
                        <TableCell>
                          {a.installed_at
                            ? localDate(a.installed_at)
                            : "Not installed"}
                        </TableCell>
                        <TableCell>
                          {a.closed_at ? localDate(a.closed_at) : "Active"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <h3 className="text-base font-medium">Supporting Documents</h3>
              <FileList files={documents.data?.data || []} />
              {can(user, "inventory.register") && (
                <SecureFileUploader
                  category="general_attachment"
                  relatedEntityType="hardware_asset"
                  relatedEntityId={details.data.id}
                  onUploaded={() => void documents.refetch()}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!modal && modal!=='reconcile'}
        onOpenChange={(v) => {
          if (!v && !busy) setModal("");
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {actionDefinitions.find((a) => a.key === modal)?.label ||
                {
                  generate: "Generate Serial Numbers",
                  legacy: "Historical Hardware Backfill",
                  draft: "Unissued Hardware Draft",
                  model: "Propose Hardware Model",
                  model_approve: "Model Governance",
                  location: "Inventory Location",
                  reconcile: "Physical Stocktake",
                  import: "Reviewed Inventory Import",
                  alert_rule: "Stock Alert Thresholds",
                  equipment_map: "Map Installation Equipment",
                }[modal]}
            </DialogTitle>
            <DialogDescription>
              {modal === "generate"
                ? "Issued serials remain unverified until stock receipt."
                : "Hardware identity and history are permanently retained."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            {[
              "generate",
              "legacy",
              "draft",
              "location",
              "reconcile",
              "alert_rule",
            ].includes(modal) && subsidiary}
            {["generate", "legacy", "draft", "alert_rule"].includes(modal) &&
              model}
            {modal === "equipment_map" && <HardwareSelect label="Hardware Model" value={form.model_id || ''} onChange={(v)=>{set('model_id',v);set('equipment_field',c?.models.find((m)=>m.id===v)?.equipment_field || '');}} options={options(c?.models || [])} required/>}
            {["generate","equipment_map"].includes(modal) && can(user,"inventory.register") && !!c?.equipment_fields?.length && <HardwareSelect label="Installation Equipment Item" value={form.equipment_field || ""} onChange={(v)=>set("equipment_field",v)} options={(c.equipment_fields_by_subsidiary?.[form.subsidiary_id || user.subsidiary_id || ""] || c.equipment_fields).map((item)=>({value:item.field,label:item.label}))} required/>}
            {[
              "generate",
              "legacy",
              "draft",
              "verify",
              "reconcile",
              "alert_rule",
            ].includes(modal) && loc}
            {modal === "alert_rule" && (
              <>
                {input("minimum_stock", "Minimum Available Stock", "number")}
                {input("warranty_days", "Warranty Alert Days", "number")}
                {input("aging_days", "Unused Inventory Days", "number")}
              </>
            )}
            {modal === "generate" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hw-serial_year">Serial Year</Label>
                  <Input
                    id="hw-serial_year"
                    value={form.serial_year || ""}
                    readOnly
                  />
                </div>
                {input("manufacturing_year", "Manufacturing Year", "number")}
                {input("quantity", "Quantity", "number")}
                {input(
                  "manufacturer_serial",
                  "Manufacturer Serial (single device)",
                )}
              </div>
            )}
            {["legacy", "draft"].includes(modal) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {input("manufacturer_serial", "Manufacturer Serial")}
                {input(
                  "manufacturing_year",
                  "Actual Manufacturing Year",
                  "number",
                )}
                {modal === "legacy" && (
                  <>
                    {input(
                      "serial_number",
                      "Existing Marezi Serial (leave unknown blank)",
                    )}
                    {installationSelect}
                    {confirm}
                  </>
                )}
              </div>
            )}
            {modal === "location" && input("name", "Location Name")}
            {modal === "model" && (
              <>
                <HardwareSelect
                  label="Official Variant"
                  value={form.variant_id || ""}
                  onChange={(v) => set("variant_id", v)}
                  options={(c?.variants || []).map((v) => ({
                    value: v.id,
                    label: `${v.nickname} / ${v.family}${v.retired ? " (Historical only)" : ""}`,
                  }))}
                />
                {input(
                  "model_year",
                  "Model Introduction / Historical Year",
                  "number",
                )}
                {input("specifications", "Hardware Specifications")}
                <label className="flex gap-2 items-center">
                  <Checkbox
                    checked={historical}
                    onCheckedChange={(v) => setHistorical(v === true)}
                  />
                  Historical model only
                </label>
              </>
            )}
            {modal === "model_approve" && (
              <>
                <HardwareSelect
                  label="Model"
                  value={form.model_id || ""}
                  onChange={(v) => set("model_id", v)}
                  options={options(c?.models || [])}
                />
                <HardwareSelect
                  label="Model Decision"
                  value={form.approval_status || ""}
                  onChange={(v) => set("approval_status", v)}
                  options={["Approved", "Rejected", "Retired"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                {input("reason", "Decision Reason")}
              </>
            )}
            {modal === "model_edit" && (
              <>
                <HardwareSelect
                  label="Amendment Model"
                  value={form.model_id || ""}
                  onChange={(v) => set("model_id", v)}
                  options={options(c?.models || [])}
                />
                <HardwareSelect
                  label="Revision Type"
                  value={form.change_type || ""}
                  onChange={(v) => set("change_type", v)}
                  options={[
                    { value: "minor", label: "Cosmetic / Like-for-like" },
                    { value: "software", label: "Software / Firmware" },
                  ]}
                />
                {input("specifications", "Revised Specifications")}
                {input("reason", "Revision Reason")}
              </>
            )}
            {["verify", "edit", "legacy"].includes(modal) && condition}
            {modal === "verify" && (
              <>
                {input("manufacturer_serial", "Manufacturer Serial")}
                {confirm}
              </>
            )}
            {modal === "identity" && (
              <>
                {input("existing_serial", "Verified Existing Marezi Serial")}
                {input(
                  "manufacturing_year",
                  "Verified Manufacturing Year",
                  "number",
                )}
                {input("manufacturer_serial", "Verified Manufacturer Serial")}
                {confirm}
              </>
            )}
            {modal === "approve" && (
              <>
                <HardwareSelect
                  label="Registration Decision"
                  value={form.approval_status || ""}
                  onChange={(v) => set("approval_status", v)}
                  options={["Approved", "Rejected"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                {input("reason", "Decision Reason")}
              </>
            )}
            {["assign", "reserve"].includes(modal) && (
              <>
                {allocationClient}
                {installationSelect}
                {technicianSelect}
                {user.role === "User" && confirm}
                {modal === "reserve" &&
                  input("reservation_days", "Reservation Days", "number")}
              </>
            )}
            {["install", "receive_transfer", "replace"].includes(modal) &&
              confirm}
            {modal === "replace" &&
              input("replacement_id", "Replacement Asset ID")}
            {modal === "transfer" && (
              <>
                <HardwareSelect
                  label="Destination Subsidiary"
                  value={form.destination_subsidiary_id || ""}
                  onChange={(v) => set("destination_subsidiary_id", v)}
                  options={options(c?.subsidiaries || [])}
                />
                <HardwareSelect
                  label="Destination Location"
                  value={form.destination_location_id || ""}
                  onChange={(v) => set("destination_location_id", v)}
                  options={options(
                    c?.locations.filter(
                      (l) => l.subsidiary_id === form.destination_subsidiary_id,
                    ) || [],
                  )}
                />
                {input("approval_reference", "Transfer Approval Reference")}
              </>
            )}
            {[
              "return",
              "fault",
              "maintenance",
              "repair",
              "transfer",
              "replace",
              "retire",
              "dispose",
              "archive",
            ].includes(modal) && input("reason", "Reason")}
            {["maintenance", "repair"].includes(modal) && (
              <>
                {input("service_details", "Diagnosis / Work / Resolution")}
                {input("document_reference", "Supporting Document Reference")}
              </>
            )}
            {modal === "dispose" &&
              input("approval_reference", "Disposal Evidence Reference")}
            {modal === "edit" && (
              <>
                {input("notes", "Notes")}
                {input("warranty_expires", "Warranty Expiry", "date")}
              </>
            )}
            {modal === "reconcile" && (
              <>
                <Label htmlFor="hw-observed">Observed Asset IDs</Label>
                <textarea
                  id="hw-observed"
                  className={`${controlClass} h-32`}
                  value={form.observed_ids || ""}
                  onChange={(e) => set("observed_ids", e.target.value)}
                />
                <QrScanner
                  onScan={(value) =>
                    setForm((f) => ({
                      ...f,
                      observed_ids: `${f.observed_ids || ""}\n${value}`,
                    }))
                  }
                />
              </>
            )}
            {modal === "import" && (
              <>
                <Label htmlFor="hw-import">CSV / XLSX Inventory File</Label>
                <Input
                  id="hw-import"
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void loadImport(e.target.files[0]);
                  }}
                />
                {input("approval_reference", "Bulk Import Approval Reference")}
                <div className="max-h-56 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Validation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.map((r) => (
                        <TableRow key={r.row}>
                          <TableCell>{r.row}</TableCell>
                          <TableCell>{r.valid ? "Valid" : r.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {operationError && (
              <Alert variant="destructive">
                <AlertDescription>{operationError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setModal("")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (modal === "import" &&
                    (!can(user, "inventory.approve_import") ||
                      !importPreview.length ||
                      importPreview.some((r) => !r.valid)))
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!labels.length}
        onOpenChange={(v) => {
          if (!v) setLabels([]);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>MAREZI QR Labels</DialogTitle>
            <DialogDescription>
              {labels.length} permanent asset labels
            </DialogDescription>
          </DialogHeader>
          <HardwareSelect
            label="Label Layout"
            value={labelLayout}
            onChange={setLabelLayout}
            options={[
              { value: "a4", label: "A4 Sheet / 8 Labels" },
              { value: "thermal", label: "100 x 60 mm Thermal" },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {labels.map(({ asset, image }) => (
              <div
                key={asset.id}
                className="border rounded-md p-3 text-black bg-white"
              >
                <p className="font-semibold text-lg">MAREZI</p>
                <p className="text-sm">
                  {asset.family} - {asset.nickname}
                </p>
                <p className="text-xs">Model: {asset.model_number}</p>
                <p className="text-xs break-all">
                  Serial: {asset.serial_number || "Unknown / Reconciliation"}
                </p>
                <img
                  src={image}
                  alt={`QR for ${asset.serial_number}`}
                  width={100}
                  height={100}
                />
              </div>
            ))}
          </div>
          <Button disabled={busy} onClick={() => void printLabels()}>
            <Printer className="mr-2 h-4 w-4" />
            Download Printable PDF
          </Button>
        </DialogContent>
      </Dialog>
      <StocktakeDialog open={modal==='reconcile'} onOpenChange={(v)=>{if(!v)setModal('');}} user={user} catalog={c} onComplete={(result)=>{setStockResult(result);void refresh();}}/>
      <Dialog
        open={!!stockResult}
        onOpenChange={(v) => {
          if (!v) setStockResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stocktake Results</DialogTitle>
            <DialogDescription>
              Physical reconciliation completed
            </DialogDescription>
          </DialogHeader>
          {stockResult && <StocktakeSummary result={stockResult} download/>}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!modelProfile}
        onOpenChange={(v) => {
          if (!v) setModelProfile("");
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {modelHistory.data?.model.model_number || "Model History"}
            </DialogTitle>
            <DialogDescription>
              Approved definitions and revision history
            </DialogDescription>
          </DialogHeader>
          {modelHistory.error && (
            <p role="alert">{modelHistory.error.message}</p>
          )}
          {modelHistory.isLoading && (
            <p className="text-sm text-muted-foreground">
              Loading model history...
            </p>
          )}
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(
              (modelHistory.data?.model.specifications || {}) as Record<
                string,
                unknown
              >,
            ).map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {fieldLabel(key)}
                </dt>
                <dd className="text-sm break-words">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
          <ol className="space-y-3">
            {modelHistory.data?.events.map((e) => (
              <li key={e.id}>
                <p className="font-medium">
                  {modelEventLabel[e.action] || fieldLabel(e.action)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {localDate(e.created_at)} (EAT) ·{" "}
                  {e.actor_name || e.actor_id || "Operator not recorded"}
                </p>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  {Object.entries(
                    (e.details || {}) as Record<string, unknown>,
                  ).map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">
                        {fieldLabel(key)}
                      </dt>
                      <dd className="break-words">{displayValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}
