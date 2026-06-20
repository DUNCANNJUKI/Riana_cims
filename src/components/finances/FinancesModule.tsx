import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, DollarSign, Download, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient } from "@/integrations/apiClient";
import { User, Installation, Client } from "@/types";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToDocument } from '@/utils/pdfWatermark';

interface FinancesModuleProps {
  user: User;
}

interface Budget {
  id: string;
  installation_id: string;
  client_name: string;
  total_budget: number;
  labor_cost: number;
  equipment_cost: number;
  transport_cost: number;
  miscellaneous_cost: number;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  currency?: string;
  branch?: string;
}

type Currency = 'KES' | 'USD';

export const FinancesModule = ({ user }: FinancesModuleProps) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('KES');
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'year' | 'month' | 'week'>('all');
  const [formData, setFormData] = useState({
    installation_id: '',
    labor_cost: 0,
    equipment_cost: 0,
    transport_cost: 0,
    miscellaneous_cost: 0,
    notes: '',
    currency: 'KES' as Currency
  });
  const { toast } = useToast();
  const { getInstallations, getClients, getCompanySettings } = useDatabase();
  
  const getCurrencySymbol = (currency: Currency) => currency === 'USD' ? '$' : 'Kshs';
  const formatCurrency = (amount: number, currency: Currency = selectedCurrency) => {
    return `${getCurrencySymbol(currency)} ${amount.toLocaleString()}`;
  };

  // Filter budgets by period
  const getFilteredBudgets = () => {
    const now = new Date();
    return budgets.filter(budget => {
      const budgetDate = new Date(budget.created_at);
      switch (filterPeriod) {
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return budgetDate >= weekAgo;
        case 'month':
          return budgetDate.getMonth() === now.getMonth() && budgetDate.getFullYear() === now.getFullYear();
        case 'year':
          return budgetDate.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });
  };

  // Calculate grand totals
  const calculateGrandTotals = () => {
    const filtered = getFilteredBudgets();
    const kesBudgets = filtered.filter(b => b.currency === 'KES' || !b.currency);
    const usdBudgets = filtered.filter(b => b.currency === 'USD');
    
    return {
      kesTotal: kesBudgets.reduce((sum, b) => sum + b.total_budget, 0),
      usdTotal: usdBudgets.reduce((sum, b) => sum + b.total_budget, 0),
      count: filtered.length
    };
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [installationsData, clientsData, companyData] = await Promise.all([
        getInstallations(),
        getClients(),
        getCompanySettings()
      ]);
      
      setInstallations(installationsData);
      setClients(clientsData);
      setCompanySettings(companyData);
      
      // Load budgets from local API
      const budgetsData = await apiClient.get('/budgets');
      
      // Enrich budgets with client names
      const enrichedBudgets = (Array.isArray(budgetsData) ? budgetsData : []).map(budget => {
        const installation = installationsData.find(i => i.id === budget.installation_id);
        const client = installation ? clientsData.find(c => c.id === installation.client_id) : null;
        return {
          ...budget,
          client_name: client ? `${client.client_name}${client.branch ? ` - ${client.branch}` : ''}` : 'Unknown'
        };
      });
      
      setBudgets(enrichedBudgets);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load financial data",
        variant: "destructive",
      });
    }
  };

  const handleAddBudget = async () => {
    if (!formData.installation_id) {
      toast({
        title: "Error",
        description: "Please select an installation",
        variant: "destructive",
      });
      return;
    }

    try {
      const total = formData.labor_cost + formData.equipment_cost + formData.transport_cost + formData.miscellaneous_cost;
      const installation = installations.find(i => i.id === formData.installation_id);
      const client = installation ? clients.find(c => c.id === installation.client_id) : null;
      
      await apiClient.post('/budgets', {
        installation_id: formData.installation_id,
        total_budget: total,
        labor_cost: formData.labor_cost,
        equipment_cost: formData.equipment_cost,
        transport_cost: formData.transport_cost,
        miscellaneous_cost: formData.miscellaneous_cost,
        notes: formData.notes,
        created_by: user.id,
        currency: formData.currency,
        branch: client?.branch || null
      });
      
      await loadData();
      setIsAddDialogOpen(false);
      setFormData({
        installation_id: '',
        labor_cost: 0,
        equipment_cost: 0,
        transport_cost: 0,
        miscellaneous_cost: 0,
        notes: '',
        currency: 'KES'
      });
      
      toast({
        title: "Success",
        description: "Budget created successfully",
      });
    } catch (error: any) {
      console.error('Error adding budget:', error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create budget",
        variant: "destructive",
      });
    }
  };

  const handleUpdateBudget = async () => {
    if (!selectedBudget) return;

    try {
      const total = formData.labor_cost + formData.equipment_cost + formData.transport_cost + formData.miscellaneous_cost;
      
      await apiClient.put(`/budgets/${selectedBudget.id}`, {
        labor_cost: formData.labor_cost,
        equipment_cost: formData.equipment_cost,
        transport_cost: formData.transport_cost,
        miscellaneous_cost: formData.miscellaneous_cost,
        total_budget: total,
        notes: formData.notes,
        currency: formData.currency
      });
      
      await loadData();
      setIsEditDialogOpen(false);
      setSelectedBudget(null);
      
      toast({
        title: "Success",
        description: "Budget updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating budget:', error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to update budget",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
      await apiClient.delete(`/budgets/${budgetId}`);
      
      await loadData();
      toast({
        title: "Success",
        description: "Budget deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting budget:', error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to delete budget",
        variant: "destructive",
      });
    }
  };

  const handleEditClick = (budget: Budget) => {
    setSelectedBudget(budget);
    setFormData({
      installation_id: budget.installation_id,
      labor_cost: budget.labor_cost,
      equipment_cost: budget.equipment_cost,
      transport_cost: budget.transport_cost,
      miscellaneous_cost: budget.miscellaneous_cost,
      notes: budget.notes,
      currency: (budget.currency as Currency) || 'KES'
    });
    setSelectedCurrency((budget.currency as Currency) || 'KES');
    setIsEditDialogOpen(true);
  };

  const downloadBudgetPDF = async (budget: Budget) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const currency = budget.currency || selectedCurrency;
    const currencySymbol = getCurrencySymbol(currency as Currency);
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
    const clientInitials = budget.client_name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3) || 'CST';
    const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const uniqueId = budget.id?.substring(0, 4).toUpperCase() || "0000";
    const serialNumber = `FIN-${clientInitials}-${dateCode}-${uniqueId}`;

    // Add header with company branding
    const primaryColorHex = companySettings?.primary_color || '#0D8390';
    const parseHex = (hex: string): [number, number, number] => {
      const c = hex.replace('#', '');
      return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
    };
    const primaryColor = parseHex(primaryColorHex);
    
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Add Serial Number
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Ref: ${serialNumber}`, 14, 8);
    doc.text(`Date: ${formattedDate}`, pageWidth - 14, 8, { align: 'right' });

    // Add company logo
    let logoLoaded = false;
    const logoSrc = companySettings?.logo_path 
      ? (companySettings.logo_path.startsWith('http') 
          ? companySettings.logo_path 
          : (companySettings.logo_path.startsWith('/')
              ? `${window.location.protocol}//${window.location.hostname}:8090${companySettings.logo_path}`
              : `http://${window.location.hostname}:8081/uploads/${companySettings.logo_path}`))
      : `${window.location.protocol}//${window.location.hostname}:8090/Riana_logo.png`;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = logoSrc;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2000);
      });
      if (img.complete && img.naturalWidth > 0) {
        doc.addImage(img, 'PNG', 14, 12, 25, 25);
        logoLoaded = true;
      }
    } catch (error) {
      console.log('Logo not loaded');
    }
    
    const textStartX = logoLoaded ? 45 : 0;
    const centerOffset = logoLoaded ? (pageWidth - 45 - 14) / 2 + 45 : pageWidth / 2;

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'RIANA CIMS', centerOffset, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Client Installation Management System', centerOffset, 28, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Installation Budget Report', centerOffset, 38, { align: 'center' });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    
    // Add budget details with current date
    doc.setFont('helvetica', 'bold');
    doc.text(`Client: ${budget.client_name}`, 20, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(`Currency: ${currency === 'USD' ? 'US Dollars ($)' : 'Kenyan Shillings (Kshs)'}`, 20, 78);
    if (budget.branch) {
      doc.text(`Branch: ${budget.branch}`, pageWidth - 20, 68, { align: 'right' });
    }
    
    // Add budget breakdown table
    autoTable(doc, {
      startY: 88,
      head: [['Cost Category', `Amount (${currencySymbol})`]],
      body: [
        ['Labor Cost', `${currencySymbol} ${budget.labor_cost.toLocaleString()}`],
        ['Equipment Cost', `${currencySymbol} ${budget.equipment_cost.toLocaleString()}`],
        ['Transport Cost', `${currencySymbol} ${budget.transport_cost.toLocaleString()}`],
        ['Miscellaneous Cost', `${currencySymbol} ${budget.miscellaneous_cost.toLocaleString()}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      foot: [['TOTAL BUDGET', `${currencySymbol} ${budget.total_budget.toLocaleString()}`]],
      footStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { bottom: 50 }
    });
    
    // Add notes if present
    if (budget.notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 20, (doc as any).lastAutoTable.finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const splitNotes = doc.splitTextToSize(budget.notes, 170);
      doc.text(splitNotes, 20, (doc as any).lastAutoTable.finalY + 25);
    }
    
    // Add letterhead with watermark and footer
    try {
      await addLetterheadToDocument(doc, '/Riana_logo.png', '/letterhead-new.jpg');
    } catch (error) {
      console.log('Letterhead could not be added:', error);
    }
    
    doc.save(`Budget_${budget.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${formattedDate.replace(/\s/g, '-')}.pdf`);
    
    toast({
      title: "Success",
      description: "Budget PDF downloaded successfully",
    });
  };

  const grandTotals = calculateGrandTotals();
  const filteredBudgets = getFilteredBudgets();

  return (
    <div className="space-y-6">
      {/* Grand Budget Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-riana card-hover bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Grand Total (KES)</p>
                <p className="text-2xl font-bold text-primary">Kshs {grandTotals.kesTotal.toLocaleString()}</p>
              </div>
              <DollarSign className="h-10 w-10 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana card-hover bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Grand Total (USD)</p>
                <p className="text-2xl font-bold text-green-600">$ {grandTotals.usdTotal.toLocaleString()}</p>
              </div>
              <DollarSign className="h-10 w-10 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana card-hover bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Budgets</p>
                <p className="text-2xl font-bold text-amber-600">{grandTotals.count}</p>
              </div>
              <DollarSign className="h-10 w-10 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Installation Finances</h1>
          <p className="text-muted-foreground">Manage budgets and costs for installations</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterPeriod} onValueChange={(value: any) => setFilterPeriod(value)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary btn-click-effect">
                <Plus className="h-4 w-4 mr-2" />
                Create Budget
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Installation Budget</DialogTitle>
              <DialogDescription>
                Create a budget breakdown for an installation project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Installation (Client & Branch)</Label>
                  <Select value={formData.installation_id} onValueChange={(value) => setFormData({...formData, installation_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select installation" />
                    </SelectTrigger>
                    <SelectContent>
                      {installations.map(installation => {
                        const client = clients.find(c => c.id === installation.client_id);
                        return (
                          <SelectItem key={installation.id} value={installation.id}>
                            {client?.client_name || 'Unknown'}{client?.branch ? ` - ${client.branch}` : ''} ({installation.kiosk_type})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input
                    value={(() => {
                      const installation = installations.find(i => i.id === formData.installation_id);
                      const client = installation ? clients.find(c => c.id === installation.client_id) : null;
                      return client?.branch || 'N/A';
                    })()}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => {
                    setFormData({...formData, currency: value as Currency});
                    setSelectedCurrency(value as Currency);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KES">Kshs (Kenyan Shillings)</SelectItem>
                      <SelectItem value="USD">$ (US Dollars)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Labor Cost ({getCurrencySymbol(formData.currency)})</Label>
                  <Input
                    type="number"
                    value={formData.labor_cost}
                    onChange={(e) => setFormData({...formData, labor_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Equipment Cost ({getCurrencySymbol(formData.currency)})</Label>
                  <Input
                    type="number"
                    value={formData.equipment_cost}
                    onChange={(e) => setFormData({...formData, equipment_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Transport Cost ({getCurrencySymbol(formData.currency)})</Label>
                  <Input
                    type="number"
                    value={formData.transport_cost}
                    onChange={(e) => setFormData({...formData, transport_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Miscellaneous Cost ({getCurrencySymbol(formData.currency)})</Label>
                  <Input
                    type="number"
                    value={formData.miscellaneous_cost}
                    onChange={(e) => setFormData({...formData, miscellaneous_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Total Budget</Label>
                <Input
                  type="text"
                  value={formatCurrency(formData.labor_cost + formData.equipment_cost + formData.transport_cost + formData.miscellaneous_cost, formData.currency)}
                  disabled
                  className="font-bold"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional notes or breakdown details..."
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddBudget} className="gradient-primary">
                  Create Budget
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Budgets Table */}
      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Installation Budgets
          </CardTitle>
          <CardDescription>
            All created budgets and financial records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Labor</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead>Misc.</TableHead>
                <TableHead>Total Budget</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((budget) => {
                const currencySymbol = getCurrencySymbol((budget.currency as Currency) || 'KES');
                return (
                  <TableRow key={budget.id}>
                    <TableCell className="font-medium">{budget.client_name}</TableCell>
                    <TableCell>{(budget as any).branch || 'N/A'}</TableCell>
                    <TableCell>{budget.currency || 'KES'}</TableCell>
                    <TableCell>{currencySymbol} {budget.labor_cost.toLocaleString()}</TableCell>
                    <TableCell>{currencySymbol} {budget.equipment_cost.toLocaleString()}</TableCell>
                    <TableCell>{currencySymbol} {budget.transport_cost.toLocaleString()}</TableCell>
                    <TableCell>{currencySymbol} {budget.miscellaneous_cost.toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-primary">{currencySymbol} {budget.total_budget.toLocaleString()}</TableCell>
                    <TableCell>{new Date(budget.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(budget)}
                          className="transition-all hover:scale-105"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadBudgetPDF(budget)}
                          className="transition-all hover:scale-105"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteBudget(budget.id)}
                          className="transition-all hover:scale-105 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          
          {budgets.length === 0 && (
            <div className="text-center py-12">
              <DollarSign className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No budgets created yet</h3>
              <p className="text-muted-foreground">
                Create your first installation budget to get started
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Installation Budget</DialogTitle>
            <DialogDescription>
              Update the budget breakdown for this installation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={formData.currency} onValueChange={(value) => {
                setFormData({...formData, currency: value as Currency});
                setSelectedCurrency(value as Currency);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KES">Kshs (Kenyan Shillings)</SelectItem>
                  <SelectItem value="USD">$ (US Dollars)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Labor Cost ({getCurrencySymbol(formData.currency)})</Label>
                <Input
                  type="number"
                  value={formData.labor_cost}
                  onChange={(e) => setFormData({...formData, labor_cost: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <Label>Equipment Cost ({getCurrencySymbol(formData.currency)})</Label>
                <Input
                  type="number"
                  value={formData.equipment_cost}
                  onChange={(e) => setFormData({...formData, equipment_cost: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <Label>Transport Cost ({getCurrencySymbol(formData.currency)})</Label>
                <Input
                  type="number"
                  value={formData.transport_cost}
                  onChange={(e) => setFormData({...formData, transport_cost: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <Label>Miscellaneous Cost ({getCurrencySymbol(formData.currency)})</Label>
                <Input
                  type="number"
                  value={formData.miscellaneous_cost}
                  onChange={(e) => setFormData({...formData, miscellaneous_cost: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Total Budget</Label>
              <Input
                type="text"
                value={formatCurrency(formData.labor_cost + formData.equipment_cost + formData.transport_cost + formData.miscellaneous_cost, formData.currency)}
                disabled
                className="font-bold"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Additional notes or breakdown details..."
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateBudget} className="gradient-primary">
                Update Budget
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
