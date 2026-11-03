import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, Edit, FileSpreadsheet, FileText, Loader2, Plus, ReceiptText, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient } from "@/integrations/apiClient";
import { Client, Installation, User } from "@/types";
import { can } from "@/security/accessControl";
import writeXlsxFile from "write-excel-file/browser";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FinancesModuleProps { user: User }
interface Technician { id: string; first_name: string; last_name: string; email: string }
interface TechnicianExpense { technician_id: string; technician_name_snapshot?: string; accommodation_cost: string; transport_cost: string; meals_cost: string; other_expenses: string; expense_notes: string; technician_total?: string }
interface Budget {
  id: string; installation_id: string; client_name: string; branch_name?: string; branch?: string;
  total_budget: string | number; currency?: string; notes?: string; created_at: string;
  budget_model?: "legacy" | "technician"; revision_number?: number; is_current?: boolean;
  labor_cost?: number; equipment_cost?: number; transport_cost?: number; miscellaneous_cost?: number;
  technician_expenses?: TechnicianExpense[];
}
interface AssignmentResponse { installation: { id: string; client_id: string; branch_id?: string }; technicians: Technician[] }

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "UGX", "TZS", "RWF"] as const;
type Currency = typeof CURRENCIES[number];
const emptyExpense = (technicianId: string): TechnicianExpense => ({ technician_id: technicianId, accommodation_cost: "0.00", transport_cost: "0.00", meals_cost: "0.00", other_expenses: "0.00", expense_notes: "" });
const toCents = (value: string | number | undefined) => {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return 0;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const formatMoney = (cents: number, currency: string) => `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const expenseTotal = (expense: TechnicianExpense) => toCents(expense.accommodation_cost) + toCents(expense.transport_cost) + toCents(expense.meals_cost) + toCents(expense.other_expenses);

export const FinancesModule = ({ user }: FinancesModuleProps) => {
  const canManageFinances = can(user, "finances.manage");
  const { toast } = useToast();
  const { getInstallations, getClients } = useDatabase();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [clientId, setClientId] = useState("");
  const [branchKey, setBranchKey] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [currency, setCurrency] = useState<Currency>("KES");
  const [notes, setNotes] = useState("");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [expenses, setExpenses] = useState<TechnicianExpense[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState<"all" | "week" | "month" | "year">("all");

  const loadData = async () => {
    const [installationRows, clientRows, budgetRows] = await Promise.all([getInstallations(), getClients(), apiClient.get("/budgets")]);
    setInstallations(installationRows); setClients(clientRows); setBudgets(Array.isArray(budgetRows) ? budgetRows : []);
  };
  useEffect(() => {
    void loadData().catch(() => toast({ title: "Unable to load finances", variant: "destructive" }));
    // The database hook exposes request functions with changing identities; Finance initialization is intentionally one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientInstallations = useMemo(() => installations.filter(item => item.client_id === clientId), [installations, clientId]);
  const branches = useMemo(() => {
    const values = new Map<string, string>();
    clientInstallations.forEach(item => {
      const client = clients.find(candidate => candidate.id === item.client_id);
      const key = String(item.branch_id || client?.branch || "unscoped");
      values.set(key, String((item as Installation & { branch_name?: string }).branch_name || client?.branch || "Main / unscoped branch"));
    });
    return [...values.entries()];
  }, [clientInstallations, clients]);
  const availableInstallations = useMemo(() => clientInstallations.filter(item => {
    const client = clients.find(candidate => candidate.id === item.client_id);
    return String(item.branch_id || client?.branch || "unscoped") === branchKey;
  }), [clientInstallations, branchKey, clients]);
  const totalCents = useMemo(() => expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0), [expenses]);
  const filteredBudgets = useMemo(() => budgets.filter(budget => {
    if (period === "all") return true;
    const date = new Date(budget.created_at); const now = new Date();
    if (period === "week") return date >= new Date(now.getTime() - 7 * 86400000);
    if (period === "month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    return date.getFullYear() === now.getFullYear();
  }), [budgets, period]);

  const resetForm = () => { setEditingBudget(null); setClientId(""); setBranchKey(""); setInstallationId(""); setCurrency("KES"); setNotes(""); setTechnicians([]); setExpenses([]); };
  const loadTechnicians = async (id: string, sourceBudget?: Budget) => {
    setLoadingTechnicians(true);
    try {
      const response = await apiClient.get(`/installations/${id}/budget-technicians`) as AssignmentResponse;
      setTechnicians(response.technicians);
      const existing = new Map((sourceBudget?.technician_expenses || []).map(item => [item.technician_id, item]));
      setExpenses(response.technicians.map(technician => existing.get(technician.id) || emptyExpense(technician.id)));
      if (!response.technicians.length) toast({ title: "No assigned technicians", description: "Assign technicians before budgeting.", variant: "destructive" });
    } catch { setTechnicians([]); setExpenses([]); toast({ title: "Unable to retrieve assigned technicians", variant: "destructive" }); }
    finally { setLoadingTechnicians(false); }
  };
  const updateExpense = (technicianId: string, field: keyof TechnicianExpense, value: string) => setExpenses(current => current.map(item => item.technician_id === technicianId ? { ...item, [field]: value } : item));

  const saveBudget = async () => {
    if (!installationId || !technicians.length) return toast({ title: "Select an installation with assigned technicians", variant: "destructive" });
    setSaving(true);
    try {
      const payload = { installation_id: installationId, currency, notes, technician_expenses: expenses };
      if (editingBudget) await apiClient.put(`/budgets/${editingBudget.id}`, payload); else await apiClient.post("/budgets", payload);
      await loadData(); setDialogOpen(false); resetForm(); toast({ title: editingBudget ? "Budget revision created" : "Installation budget created" });
    } catch { toast({ title: "Budget was not saved", variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const editBudget = async (budget: Budget) => {
    if (budget.budget_model !== "technician" || !budget.is_current) return;
    const installation = installations.find(item => item.id === budget.installation_id); const client = clients.find(item => item.id === installation?.client_id);
    setEditingBudget(budget); setClientId(installation?.client_id || ""); setBranchKey(String(installation?.branch_id || client?.branch || "unscoped")); setInstallationId(budget.installation_id);
    setCurrency((CURRENCIES.includes(budget.currency as Currency) ? budget.currency : "KES") as Currency); setNotes(budget.notes || ""); setDialogOpen(true); await loadTechnicians(budget.installation_id, budget);
  };
  const reportRows = (budget: Budget) => budget.budget_model === "technician"
    ? (budget.technician_expenses || []).map(item => [item.technician_name_snapshot || "Assigned technician", item.accommodation_cost, item.transport_cost, item.meals_cost, item.other_expenses, item.technician_total, item.expense_notes || ""])
    : [["Historical legacy budget", budget.labor_cost || 0, budget.equipment_cost || 0, budget.transport_cost || 0, budget.miscellaneous_cost || 0, budget.total_budget, budget.notes || ""]];
  const reportHeaders = (budget: Budget) => budget.budget_model === "technician"
    ? ["Technician", "Accommodation", "Transport", "Meals / Per Diem", "Other", "Subtotal", "Notes"]
    : ["Record type", "Labor", "Equipment", "Transport", "Miscellaneous", "Total", "Notes"];
  const exportFileName = (budget: Budget, extension: string) => `installation-budget-${budget.installation_id}-r${budget.revision_number || 1}.${extension}`;
  const exportExcel = async (budget: Budget) => {
    const headers = reportHeaders(budget);
    const data = [
      headers.map(value => ({ value, fontWeight: "bold" as const, backgroundColor: "#0B6C75", color: "#FFFFFF" })),
      ...reportRows(budget).map(row => row.map((value, index) => ({ value: index > 0 && index < 6 ? Number(value || 0) : String(value ?? ""), format: index > 0 && index < 6 ? "#,##0.00" : undefined }))),
      [{ value: "TOTAL INSTALLATION BUDGET", fontWeight: "bold" as const }, { value: Number(budget.total_budget || 0), format: "#,##0.00", fontWeight: "bold" as const }],
    ];
    await writeXlsxFile(data, { fileName: exportFileName(budget, "xlsx"), sheet: "Budget" });
  };
  const exportPdf = (budget: Budget) => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setTextColor(11, 108, 117); doc.text("RIANA CIMS Installation Budget", 14, 18);
    doc.setFontSize(10); doc.setTextColor(45, 55, 72);
    doc.text(`Client: ${budget.client_name}`, 14, 27); doc.text(`Branch: ${budget.branch_name || budget.branch || "No branch"}`, 14, 33);
    doc.text(`Installation: ${budget.installation_id}`, 14, 39); doc.text(`Currency: ${budget.currency || "KES"} · Revision: ${budget.revision_number || 1}`, 14, 45);
    autoTable(doc, { startY: 51, head: [reportHeaders(budget)], body: reportRows(budget), foot: [["TOTAL INSTALLATION BUDGET", "", "", "", "", `${budget.currency || "KES"} ${Number(budget.total_budget || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]], styles: { fontSize: 8 }, headStyles: { fillColor: [11, 108, 117] }, footStyles: { fillColor: [11, 108, 117], fontStyle: "bold" } });
    doc.save(exportFileName(budget, "pdf"));
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold sm:text-3xl">Installation Finances</h1><p className="text-muted-foreground">Technician expenses by installation, branch, and client</p></div><div className="flex flex-col gap-2 sm:flex-row">
      <Select value={period} onValueChange={value => setPeriod(value as typeof period)}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All time</SelectItem><SelectItem value="week">This week</SelectItem><SelectItem value="month">This month</SelectItem><SelectItem value="year">This year</SelectItem></SelectContent></Select>
      {canManageFinances && <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}><DialogTrigger asChild><Button><Plus />Create budget</Button></DialogTrigger><DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{editingBudget ? `Revise budget · revision ${Number(editingBudget.revision_number || 1) + 1}` : "Create installation budget"}</DialogTitle><DialogDescription>Only assigned-technician expenses contribute to the installation total.</DialogDescription></DialogHeader>
        <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-4">
          <div className="space-y-2"><Label>Client</Label><Select disabled={Boolean(editingBudget)} value={clientId} onValueChange={value => { setClientId(value); setBranchKey(""); setInstallationId(""); setTechnicians([]); setExpenses([]); }}><SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger><SelectContent>{clients.filter(client => installations.some(item => item.client_id === client.id)).map(client => <SelectItem key={client.id} value={client.id}>{client.client_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Branch</Label><Select disabled={!clientId || Boolean(editingBudget)} value={branchKey} onValueChange={value => { setBranchKey(value); setInstallationId(""); setTechnicians([]); setExpenses([]); }}><SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent>{branches.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Installation</Label><Select disabled={!branchKey || Boolean(editingBudget)} value={installationId} onValueChange={value => { setInstallationId(value); void loadTechnicians(value); }}><SelectTrigger><SelectValue placeholder="Select installation" /></SelectTrigger><SelectContent>{availableInstallations.map(item => <SelectItem key={item.id} value={item.id}>{item.kiosk_type || "Installation"} · {item.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Currency</Label><Select value={currency} onValueChange={value => setCurrency(value as Currency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {loadingTechnicians ? <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="animate-spin" />Loading assigned technicians…</div> : installationId && technicians.length ? <div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Assigned technicians</h3><p className="text-sm text-muted-foreground">{technicians.length} included</p></div><Badge variant="outline">Assignment controlled</Badge></div>
          {technicians.map(technician => { const expense = expenses.find(item => item.technician_id === technician.id) || emptyExpense(technician.id); return <Card key={technician.id}><CardHeader className="border-b bg-muted/25 p-4"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="text-primary" />{technician.first_name} {technician.last_name}</CardTitle><CardDescription>{technician.email}</CardDescription></CardHeader><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {([['accommodation_cost','Accommodation'],['transport_cost','Transport'],['meals_cost','Meals / Per Diem'],['other_expenses','Other expenses']] as const).map(([field,label]) => <div key={field} className="space-y-2"><Label htmlFor={`${technician.id}-${field}`}>{label}</Label><Input id={`${technician.id}-${field}`} type="number" min="0" step="0.01" inputMode="decimal" value={expense[field]} onChange={event => updateExpense(technician.id, field, event.target.value)} /></div>)}
            <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label>Expense notes (optional)</Label><Textarea value={expense.expense_notes} maxLength={1000} onChange={event => updateExpense(technician.id, 'expense_notes', event.target.value)} placeholder="Travel route, dates, receipts, or justification" /></div><div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Technician subtotal</p><p className="text-xl font-bold text-primary">{formatMoney(expenseTotal(expense), currency)}</p></div>
          </CardContent></Card>; })}
          <div className="grid gap-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><Label>Budget notes (optional)</Label><Textarea value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} /></div><div className="sm:min-w-56 sm:text-right"><p className="text-sm font-semibold text-muted-foreground">Total installation budget</p><p className="text-2xl font-bold text-primary">{formatMoney(totalCents, currency)}</p><p className="text-xs text-muted-foreground">Technician subtotals only</p></div></div>
        </div> : installationId ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No assigned technicians found.</div> : null}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={saving || !technicians.length} onClick={() => void saveBudget()}>{saving && <Loader2 className="animate-spin" />}{editingBudget ? "Create revision" : "Create budget"}</Button></div>
      </DialogContent></Dialog>}
    </div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText />Installation budgets</CardTitle><CardDescription>Current and historical revisions remain independently traceable.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Client / branch</TableHead><TableHead>Installation</TableHead><TableHead>Model</TableHead><TableHead>Technicians</TableHead><TableHead>Total</TableHead><TableHead>Revision</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredBudgets.map(budget => <TableRow key={budget.id} className={!budget.is_current && budget.budget_model === 'technician' ? 'opacity-65' : ''}><TableCell><p className="font-semibold">{budget.client_name}</p><p className="text-xs text-muted-foreground">{budget.branch_name || budget.branch || "No branch"}</p></TableCell><TableCell className="font-mono text-xs">{budget.installation_id.slice(0, 8)}</TableCell><TableCell><Badge variant={budget.budget_model === 'technician' ? 'default' : 'outline'}>{budget.budget_model === 'technician' ? 'Technician expenses' : 'Historical legacy'}</Badge></TableCell><TableCell>{budget.budget_model === 'technician' ? budget.technician_expenses?.length || 0 : '—'}</TableCell><TableCell className="font-bold text-primary">{formatMoney(toCents(budget.total_budget), budget.currency || 'KES')}</TableCell><TableCell>r{budget.revision_number || 1}{budget.is_current === false ? ' · archived' : ''}</TableCell><TableCell>{new Date(budget.created_at).toLocaleDateString()}</TableCell><TableCell><div className="flex justify-end gap-2">{canManageFinances && budget.budget_model === 'technician' && budget.is_current !== false && <Button size="icon" variant="outline" aria-label="Revise budget" onClick={() => void editBudget(budget)}><Edit /></Button>}<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label="Download budget"><Download /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void exportExcel(budget)}><FileSpreadsheet className="mr-2" />Download Excel</DropdownMenuItem><DropdownMenuItem onClick={() => exportPdf(budget)}><FileText className="mr-2" />Download PDF</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>)}</TableBody></Table>{filteredBudgets.length === 0 && <div className="py-12 text-center text-muted-foreground">No budgets match this period.</div>}</CardContent></Card>
  </div>;
};
