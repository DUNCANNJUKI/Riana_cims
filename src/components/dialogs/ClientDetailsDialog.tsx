import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle2, GitBranch, Layers3, Loader2, Plus, RefreshCw } from "lucide-react";
import { User, Client } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";

type ClientBranch = {
  id: string;
  client_id?: string;
  branch_name: string;
  branch_code?: string | null;
  department_count?: number;
  installation_count?: number;
};

type ClientDepartment = {
  id: string;
  client_id?: string;
  branch_id: string;
  branch_name?: string | null;
  department_name: string;
  department_code?: string | null;
  installation_count?: number;
};

interface ClientDetailsDialogProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (client: Client) => void | Promise<void>;
  onHierarchyChange?: () => void | Promise<void>;
  isEditing?: boolean;
  user: User;
  departments?: any[];
  subsidiaries?: any[];
}

const sameText = (left?: string | null, right?: string | null) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

export const ClientDetailsDialog = ({
  client,
  isOpen,
  onClose,
  onSave,
  onHierarchyChange,
  isEditing = false,
  user,
  subsidiaries = []
}: ClientDetailsDialogProps) => {
  const { toast } = useToast();
  const canEdit = Boolean(client) && (user.role === 'SuperAdmin' || user.role === 'Admin') && isEditing;
  const canViewVendor = user.role === 'SuperAdmin' || user.role === 'Admin' || user.role === 'Management';
  const editableClient = useMemo(() => {
    if (!client) return null;
    return {
      ...client,
      contact_person_phone: client.contact_person_phone || client.contact_phone_masked || '',
      contact_person_email: client.contact_person_email || client.contact_email_masked || '',
      contact_person_department: client.contact_person_department || '',
      start_date: client.start_date ? String(client.start_date).slice(0, 10) : '',
      contract_type: client.contract_type || '',
      industry_classification: client.industry_classification || '',
      branch: client.branch || '',
      current_vendor: client.current_vendor || '',
    };
  }, [client]);

  const [editedClient, setEditedClient] = useState<Client | null>(editableClient);
  const [clientBranches, setClientBranches] = useState<ClientBranch[]>([]);
  const [branchDepartments, setBranchDepartments] = useState<ClientDepartment[]>([]);
  const [selectedBranchForDepartment, setSelectedBranchForDepartment] = useState('');
  const [newBranch, setNewBranch] = useState({ branch_name: '', branch_code: '' });
  const [newDepartment, setNewDepartment] = useState({ department_name: '', department_code: '' });
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const [isHierarchySaving, setIsHierarchySaving] = useState(false);
  const [hierarchyError, setHierarchyError] = useState('');

  const selectedBranch = clientBranches.find((branch) => branch.id === selectedBranchForDepartment) || null;
  const selectedBranchDepartments = branchDepartments.filter((department) => department.branch_id === selectedBranchForDepartment);
  const hasPrimaryBranchLabel = Boolean(client?.branch) && !clientBranches.some((branch) => sameText(branch.branch_name, client?.branch));

  const loadClientHierarchy = async (preferredBranchId = '') => {
    if (!client?.id) {
      setClientBranches([]);
      setBranchDepartments([]);
      setSelectedBranchForDepartment('');
      return;
    }

    setIsHierarchyLoading(true);
    setHierarchyError('');
    try {
      const branches = (await apiClient.get(`/clients/${client.id}/branches`)) || [];
      const departments = (await apiClient.get(`/clients/${client.id}/departments`)) || [];
      const normalizedBranches = branches as ClientBranch[];
      const normalizedDepartments = departments as ClientDepartment[];
      setClientBranches(normalizedBranches);
      setBranchDepartments(normalizedDepartments);

      const nextSelectedBranch = preferredBranchId && normalizedBranches.some((branch) => branch.id === preferredBranchId)
        ? preferredBranchId
        : selectedBranchForDepartment && normalizedBranches.some((branch) => branch.id === selectedBranchForDepartment)
          ? selectedBranchForDepartment
          : normalizedBranches[0]?.id || '';
      setSelectedBranchForDepartment(nextSelectedBranch);

      if (!normalizedBranches.length && client.branch) {
        setNewBranch((current) => current.branch_name ? current : { ...current, branch_name: client.branch || '' });
      }
    } catch (error: any) {
      console.error('Error loading client hierarchy:', error);
      const message = error?.message || 'Failed to load client branches and departments';
      setHierarchyError(message);
      toast({ title: 'Hierarchy loading failed', description: message, variant: 'destructive' });
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  useEffect(() => {
    setEditedClient(editableClient);
  }, [editableClient, isOpen, isEditing]);

  useEffect(() => {
    if (isOpen) {
      setNewBranch({ branch_name: '', branch_code: '' });
      setNewDepartment({ department_name: '', department_code: '' });
      void loadClientHierarchy();
    }
  }, [client?.id, isOpen]);

  const handleSave = async () => {
    if (editedClient && onSave) {
      await onSave(editedClient);
      onClose();
    }
  };

  const handleAddBranch = async (branchNameOverride?: string) => {
    const branchName = String(branchNameOverride || newBranch.branch_name || '').trim();
    if (!client?.id || !branchName) {
      toast({ title: 'Branch name required', description: 'Enter a branch name before saving.', variant: 'destructive' });
      return;
    }

    setIsHierarchySaving(true);
    try {
      const createdBranch = await apiClient.post(`/clients/${client.id}/branches`, {
        branch_name: branchName,
        branch_code: branchNameOverride ? null : newBranch.branch_code.trim() || null,
      });
      setNewBranch({ branch_name: '', branch_code: '' });
      await loadClientHierarchy(createdBranch?.id || '');
      await onHierarchyChange?.();
      toast({ title: 'Branch added', description: `${branchName} is now available for this client.` });
    } catch (error: any) {
      console.error('Error adding branch:', error);
      toast({ title: 'Unable to add branch', description: error?.message || 'Failed to add branch', variant: 'destructive' });
    } finally {
      setIsHierarchySaving(false);
    }
  };

  const handleAddDepartment = async () => {
    const departmentName = newDepartment.department_name.trim();
    if (!selectedBranchForDepartment || !departmentName) {
      toast({ title: 'Department details required', description: 'Select a branch and enter a department name.', variant: 'destructive' });
      return;
    }

    setIsHierarchySaving(true);
    try {
      await apiClient.post(`/branches/${selectedBranchForDepartment}/departments`, {
        department_name: departmentName,
        department_code: newDepartment.department_code.trim() || null,
      });
      setNewDepartment({ department_name: '', department_code: '' });
      await loadClientHierarchy(selectedBranchForDepartment);
      await onHierarchyChange?.();
      toast({ title: 'Department added', description: `${departmentName} was added under ${selectedBranch?.branch_name || 'the selected branch'}.` });
    } catch (error: any) {
      console.error('Error adding department:', error);
      toast({ title: 'Unable to add department', description: error?.message || 'Failed to add department', variant: 'destructive' });
    } finally {
      setIsHierarchySaving(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Client Details' : 'Client Details'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update client information and organize branches with their departments.' : 'View client information'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Client Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Client Name</Label>
                {canEdit ? (
                  <Input id="client_name" value={editedClient?.client_name || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, client_name: e.target.value} : null)} />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.client_name}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch">Primary Branch Label</Label>
                {canEdit ? (
                  <Input id="branch" value={editedClient?.branch || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, branch: e.target.value} : null)} placeholder="Optional legacy branch label" />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.branch || 'N/A'}</div>
                )}
              </div>

              {canViewVendor && (
                <div className="space-y-2">
                  <Label htmlFor="current_vendor">Previous Vendor</Label>
                  {canEdit ? (
                    <Input id="current_vendor" value={editedClient?.current_vendor || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, current_vendor: e.target.value} : null)} placeholder="Enter previous vendor if any" />
                  ) : (
                    <div className="p-2 bg-muted rounded">{client.current_vendor || 'N/A'}</div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="contact_person_name">Contact Person</Label>
                {canEdit ? (
                  <Input id="contact_person_name" value={editedClient?.contact_person_name || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_person_name: e.target.value} : null)} />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.contact_person_name}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person_department">Contact Person Department</Label>
                {canEdit ? (
                  <Input id="contact_person_department" value={editedClient?.contact_person_department || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_person_department: e.target.value} : null)} placeholder="e.g. IT, Operations, Finance" />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.contact_person_department || 'N/A'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person_phone">Contact Phone</Label>
                {canEdit ? (
                  <CountryPhoneInput id="contact_person_phone" value={editedClient?.contact_person_phone || ''} onChange={(contact_person_phone) => setEditedClient(prev => prev ? {...prev, contact_person_phone} : null)} />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.contact_person_phone || client.contact_person_phone_masked || client.contact_phone_masked || 'N/A'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person_email">Contact Email</Label>
                {canEdit ? (
                  <Input id="contact_person_email" type="email" value={editedClient?.contact_person_email || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_person_email: e.target.value} : null)} />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.contact_person_email || client.contact_person_email_masked || client.contact_email_masked || 'N/A'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subsidiary_id">Subsidiary</Label>
                {canEdit ? (
                  <Select value={editedClient?.subsidiary_id || ''} onValueChange={(value) => setEditedClient(prev => prev ? {...prev, subsidiary_id: value} : null)}>
                    <SelectTrigger id="subsidiary_id"><SelectValue placeholder="Select subsidiary" /></SelectTrigger>
                    <SelectContent>{subsidiaries.map((sub) => (<SelectItem key={sub.id} value={sub.id}>{sub.subsidiary_name}</SelectItem>))}</SelectContent>
                  </Select>
                ) : (
                  <div className="p-2 bg-muted rounded">{client.subsidiary_id || 'N/A'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                {canEdit ? (
                  <Input id="start_date" type="date" value={editedClient?.start_date || ''} onChange={(e) => setEditedClient(prev => prev ? {...prev, start_date: e.target.value} : null)} />
                ) : (
                  <div className="p-2 bg-muted rounded">{client.start_date ? new Date(client.start_date).toLocaleDateString() : 'N/A'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract_type">Contract Type</Label>
                {canEdit ? (
                  <Select value={editedClient?.contract_type || ''} onValueChange={(value) => setEditedClient(prev => prev ? {...prev, contract_type: value} : null)}>
                    <SelectTrigger id="contract_type"><SelectValue placeholder="Select contract type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AMC">AMC</SelectItem>
                      <SelectItem value="WARRANTY">WARRANTY</SelectItem>
                      <SelectItem value="LEASE">LEASE</SelectItem>
                      <SelectItem value="POC">POC</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-2 bg-muted rounded"><Badge variant="outline">{client.contract_type}</Badge></div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry_classification">Industry Classification</Label>
                {canEdit ? (
                  <Select value={editedClient?.industry_classification || ''} onValueChange={(value) => setEditedClient(prev => prev ? {...prev, industry_classification: value} : null)}>
                    <SelectTrigger id="industry_classification"><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Banking">Banking</SelectItem><SelectItem value="Healthcare">Healthcare</SelectItem><SelectItem value="Education">Education</SelectItem><SelectItem value="Government">Government</SelectItem><SelectItem value="Retail">Retail</SelectItem><SelectItem value="Technology">Technology</SelectItem><SelectItem value="Manufacturing">Manufacturing</SelectItem><SelectItem value="Hospitality">Hospitality</SelectItem><SelectItem value="Transportation">Transportation</SelectItem><SelectItem value="Telecommunications">Telecommunications</SelectItem><SelectItem value="Insurance">Insurance</SelectItem><SelectItem value="Real Estate">Real Estate</SelectItem><SelectItem value="Entertainment">Entertainment</SelectItem><SelectItem value="Utilities">Utilities</SelectItem><SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-2 bg-muted rounded">{client.industry_classification || 'N/A'}</div>
                )}
              </div>
            </div>
          </section>

          {canEdit && (
            <section className="space-y-4 border-t pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">Branches and Departments</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">Create a branch, select it, then add departments under that branch.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadClientHierarchy(selectedBranchForDepartment)} disabled={isHierarchyLoading}>
                  {isHierarchyLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>

              {hierarchyError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {hierarchyError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium"><GitBranch className="h-4 w-4" /> Step 1: Branches</div>
                    <Badge variant="secondary">{clientBranches.length}</Badge>
                  </div>

                  {hasPrimaryBranchLabel && (
                    <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm">
                      <div className="font-medium">Primary branch label found: {client.branch}</div>
                      <p className="mt-1 text-muted-foreground">Make it a selectable branch so departments can be added under it.</p>
                      <Button type="button" size="sm" className="mt-3" onClick={() => void handleAddBranch(client.branch || '')} disabled={isHierarchySaving}>
                        <Plus className="h-4 w-4 mr-2" /> Create Branch
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {isHierarchyLoading ? (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Loading branches...</div>
                    ) : clientBranches.length > 0 ? (
                      clientBranches.map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${selectedBranchForDepartment === branch.id ? 'border-primary bg-primary/5 text-primary' : 'bg-background hover:bg-muted'}`}
                          onClick={() => setSelectedBranchForDepartment(branch.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{branch.branch_name}</span>
                            <span className="text-xs text-muted-foreground">{branch.department_count || 0} departments</span>
                          </span>
                          {selectedBranchForDepartment === branch.id ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No client branches yet. Add the first branch below.</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-[1fr_9rem]">
                    <div className="space-y-2">
                      <Label htmlFor="new_branch_name">Branch Name *</Label>
                      <Input id="new_branch_name" value={newBranch.branch_name} onChange={(e) => setNewBranch({...newBranch, branch_name: e.target.value})} placeholder="e.g. Main, Westlands" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new_branch_code">Code</Label>
                      <Input id="new_branch_code" value={newBranch.branch_code} onChange={(e) => setNewBranch({...newBranch, branch_code: e.target.value})} placeholder="Optional" />
                    </div>
                    <Button type="button" className="sm:col-span-2" variant="outline" onClick={() => void handleAddBranch()} disabled={isHierarchySaving || !newBranch.branch_name.trim()}>
                      {isHierarchySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Branch
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium"><Layers3 className="h-4 w-4" /> Step 2: Departments</div>
                    <Badge variant="secondary">{selectedBranchDepartments.length}</Badge>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="selected_branch_for_department">Branch *</Label>
                    <Select value={selectedBranchForDepartment} onValueChange={setSelectedBranchForDepartment} disabled={clientBranches.length === 0}>
                      <SelectTrigger id="selected_branch_for_department">
                        <SelectValue placeholder={clientBranches.length ? 'Select branch' : 'Add a branch first'} />
                      </SelectTrigger>
                      <SelectContent>
                        {clientBranches.map((branch) => (<SelectItem key={branch.id} value={branch.id}>{branch.branch_name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-h-[88px] space-y-2">
                    {selectedBranchForDepartment ? (
                      selectedBranchDepartments.length > 0 ? (
                        selectedBranchDepartments.map((department) => (
                          <div key={department.id} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                            <span className="font-medium">{department.department_name}</span>
                            {department.department_code ? <Badge variant="outline">{department.department_code}</Badge> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No departments under {selectedBranch?.branch_name || 'this branch'} yet.</div>
                      )
                    ) : (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Select a branch to view or add departments.</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-[1fr_9rem]">
                    <div className="space-y-2">
                      <Label htmlFor="new_department_name">Department Name *</Label>
                      <Input id="new_department_name" value={newDepartment.department_name} onChange={(e) => setNewDepartment({...newDepartment, department_name: e.target.value})} placeholder="e.g. IT, ICU, Support" disabled={!selectedBranchForDepartment} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new_department_code">Code</Label>
                      <Input id="new_department_code" value={newDepartment.department_code} onChange={(e) => setNewDepartment({...newDepartment, department_code: e.target.value})} placeholder="Optional" disabled={!selectedBranchForDepartment} />
                    </div>
                    <Button type="button" className="sm:col-span-2" variant="outline" onClick={() => void handleAddDepartment()} disabled={isHierarchySaving || !selectedBranchForDepartment || !newDepartment.department_name.trim()}>
                      {isHierarchySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Department
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-background/95 px-6 py-4 backdrop-blur">
          <Button variant="outline" onClick={onClose}>{isEditing ? 'Cancel' : 'Close'}</Button>
          {canEdit && <Button onClick={() => void handleSave()} className="gradient-primary">Save Changes</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
};
