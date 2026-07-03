import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Users, Edit, Save, Loader2, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EscalationMatrix, EscalationTier, User } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { emptyEscalationMatrix, emptyEscalationTier, escalationTierEntries, normalizeEscalationMatrix } from "@/utils/escalationMatrix";
import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";

interface Subsidiary {
  id: string;
  subsidiary_name: string;
  default_escalation_matrix: EscalationMatrix | null;
}

export const SubsidiaryEscalationManager = ({ user }: { user: User }) => {
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<Subsidiary | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSubsidiaryName, setNewSubsidiaryName] = useState('');
  const [editingSubsidiaryName, setEditingSubsidiaryName] = useState('');
  const [editingMatrix, setEditingMatrix] = useState<EscalationMatrix>(emptyEscalationMatrix);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSubsidiaries();
  }, []);

  const loadSubsidiaries = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiClient.get('/subsidiaries');
      setSubsidiaries(data || []);
    } catch (error) {
      console.error('Error loading subsidiaries:', error);
      toast({
        title: "Error",
        description: "Failed to load subsidiaries from local server",
        variant: "destructive",
      });
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const handleEditSubsidiary = (subsidiary: Subsidiary) => {
    setSelectedSubsidiary(subsidiary);
    setEditingSubsidiaryName(subsidiary.subsidiary_name);
    setEditingMatrix(normalizeEscalationMatrix(subsidiary.default_escalation_matrix));
    setIsEditDialogOpen(true);
  };

  const handleSaveEscalationMatrix = async () => {
    if (!selectedSubsidiary) return;

    setIsSaving(true);
    try {
      await apiClient.patch(`/subsidiaries/${selectedSubsidiary.id}`, {
        subsidiary_name: editingSubsidiaryName.trim(),
        default_escalation_matrix: normalizeEscalationMatrix(editingMatrix)
      });

      setIsEditDialogOpen(false);
      await loadSubsidiaries(false);
      toast({
        title: "Success",
        description: `Escalation matrix saved for ${selectedSubsidiary.subsidiary_name}`,
      });
    } catch (error) {
      console.error('Error saving escalation matrix:', error);
      toast({
        title: "Error",
        description: "Failed to save escalation matrix locally",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubsidiary = async (subsidiary: Subsidiary) => {
    if (!window.confirm(`Delete ${subsidiary.subsidiary_name}? This is only allowed when no users are attached.`)) return;
    try {
      await apiClient.delete(`/subsidiaries/${subsidiary.id}`);
      setSubsidiaries((current) => current.filter((item) => item.id !== subsidiary.id));
      toast({ title: 'Subsidiary deleted', description: `${subsidiary.subsidiary_name} was removed successfully.` });
    } catch (error) {
      toast({
        title: 'Unable to delete subsidiary',
        description: error instanceof Error ? error.message : 'Reassign attached users and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAddSubsidiary = async () => {
    if (!newSubsidiaryName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a subsidiary name",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiClient.post('/subsidiaries', { subsidiary_name: newSubsidiaryName.trim() });
      await loadSubsidiaries();
      setIsAddDialogOpen(false);
      setNewSubsidiaryName('');
      toast({
        title: "Success",
        description: `Subsidiary "${newSubsidiaryName}" added successfully`,
      });
    } catch (error) {
      console.error('Error adding subsidiary:', error);
      toast({
        title: "Error",
        description: "Failed to add subsidiary to local server",
        variant: "destructive",
      });
    }
  };

  const updateTier = (tier: string, field: keyof EscalationTier, value: string) => {
    setEditingMatrix(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value
      }
    }));
  };

  const addTier = () => {
    const nextNumber = Math.max(3, ...escalationTierEntries(editingMatrix).map(([key]) => Number(key.slice(4)))) + 1;
    setEditingMatrix((current) => ({ ...current, [`tier${nextNumber}`]: emptyEscalationTier() }));
  };

  const removeTier = (tier: string) => {
    if (Number(tier.slice(4)) <= 3) return;
    setEditingMatrix((current) => {
      const next = { ...current };
      delete next[tier];
      return next;
    });
  };

  const TierFields = ({ tier, tierNum }: { tier: string; tierNum: number }) => (
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="outline" className="bg-primary/10">Tier {tierNum}</Badge>
        <span className="text-sm text-muted-foreground">
          {tierNum === 1 ? 'First point of contact' : tierNum === 2 ? 'Secondary escalation' : 'Final escalation'}
        </span>
        {user.role === 'SuperAdmin' && tierNum > 3 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => removeTier(tier)} aria-label={`Remove tier ${tierNum}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input value={editingMatrix[tier]?.name || ''} onChange={(e) => updateTier(tier, 'name', e.target.value)} placeholder="Contact name" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Role</Label>
          <Input value={editingMatrix[tier]?.role || ''} onChange={(e) => updateTier(tier, 'role', e.target.value)} placeholder="Job title" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <CountryPhoneInput value={editingMatrix[tier]?.phone_number || ''} onChange={(value) => updateTier(tier, 'phone_number', value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={editingMatrix[tier]?.email || ''} onChange={(e) => updateTier(tier, 'email', e.target.value)} placeholder="email@company.com" className="h-9" />
        </div>
      </div>
    </div>
  );

  return (
    <Card className="shadow-riana">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Subsidiary Escalation Matrix</CardTitle>
            <CardDescription>Configure default escalation contacts for each subsidiary.</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild><Button className="gradient-primary"><Plus className="h-4 w-4 mr-2" /> Add Subsidiary</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Subsidiary</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subsidiary_name">Subsidiary Name</Label>
                  <Input id="subsidiary_name" value={newSubsidiaryName} onChange={(e) => setNewSubsidiaryName(e.target.value)} placeholder="e.g., RIANA Kenya" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddSubsidiary} className="gradient-primary">Add Subsidiary</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : subsidiaries.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No subsidiaries found. Add your first subsidiary.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subsidiary</TableHead>
                <TableHead>Tier 1 Contact</TableHead>
                <TableHead>Tier 2 Contact</TableHead>
                <TableHead>Tier 3 Contact</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subsidiaries.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell><span className="font-medium">{sub.subsidiary_name}</span></TableCell>
                  <TableCell>
                    {sub.default_escalation_matrix?.tier1?.name ? (
                      <div className="text-sm">
                        <p className="font-medium">{sub.default_escalation_matrix.tier1.name}</p>
                        <p className="text-muted-foreground text-xs">{sub.default_escalation_matrix.tier1.role}</p>
                      </div>
                    ) : <Badge variant="outline" className="text-warning"><AlertTriangle className="h-3 w-3 mr-1" /> Not set</Badge>}
                  </TableCell>
                  <TableCell>
                    {sub.default_escalation_matrix?.tier2?.name ? (
                      <div className="text-sm">
                        <p className="font-medium">{sub.default_escalation_matrix.tier2.name}</p>
                        <p className="text-muted-foreground text-xs">{sub.default_escalation_matrix.tier2.role}</p>
                      </div>
                    ) : <Badge variant="outline" className="text-muted-foreground">Not set</Badge>}
                  </TableCell>
                  <TableCell>
                    {sub.default_escalation_matrix?.tier3?.name ? (
                      <div className="text-sm">
                        <p className="font-medium">{sub.default_escalation_matrix.tier3.name}</p>
                        <p className="text-muted-foreground text-xs">{sub.default_escalation_matrix.tier3.role}</p>
                      </div>
                    ) : <Badge variant="outline" className="text-muted-foreground">Not set</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditSubsidiary(sub)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteSubsidiary(sub)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Configure Escalation Matrix</DialogTitle>
            <DialogDescription>{selectedSubsidiary && `Set default escalation contacts for ${selectedSubsidiary.subsidiary_name}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="edit_subsidiary_name">Subsidiary Name</Label>
              <Input id="edit_subsidiary_name" value={editingSubsidiaryName} onChange={(event) => setEditingSubsidiaryName(event.target.value)} maxLength={50} />
            </div>
            {escalationTierEntries(editingMatrix).map(([tier]) => (
              <TierFields key={tier} tier={tier} tierNum={Number(tier.slice(4))} />
            ))}
            {user.role === 'SuperAdmin' && (
              <Button variant="outline" onClick={addTier}>
                <Plus className="mr-2 h-4 w-4" /> Add Escalation Tier
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSaveEscalationMatrix} className="gradient-primary" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Escalation Matrix
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
