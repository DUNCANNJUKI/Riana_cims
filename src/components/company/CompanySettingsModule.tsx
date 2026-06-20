import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, Building2, Palette, FileImage, Clock, Shield, Database, Users, 
  Upload, Save, Globe, Mail, Phone, MapPin, RefreshCw, CheckCircle, AlertCircle, MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";
import { DataManagementPanel } from "./DataManagementPanel";
import { SubsidiaryEscalationManager } from "./SubsidiaryEscalationManager";
import { FeedbackSettingsPanel } from "@/components/feedback/FeedbackSettingsPanel";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient } from "@/integrations/apiClient";

interface CompanySettingsModuleProps {
  user: User;
}

interface CompanySettings {
  id?: string;
  company_name: string;
  logo_path: string;
  tagline: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_type: string;
  font_color: string;
  contract_types: string[];
  contract_durations: Record<string, string>;
  timezone: string;
  date_format: string;
  enable_email_notifications: boolean;
  enable_sms_notifications: boolean;
  enable_push_notifications: boolean;
  auto_reminder_days: number;
}

const DEFAULT_CONTRACT_TYPES = ['AMC', 'WARRANTY', 'LEASE', 'POC'];

export const CompanySettingsModule = ({ user }: CompanySettingsModuleProps) => {
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "RIANA Group",
    logo_path: "/Riana_logo.png",
    tagline: "Innovative Technology Solutions",
    website: "https://www.riana.co",
    email: "info@riana.co",
    phone: "+254 700 000 000",
    address: "6th Floor, Allianz Plaza, 96 Riverside Drive, Nairobi, Kenya",
    primary_color: "#2563eb",
    secondary_color: "#10b981",
    accent_color: "#f59e0b",
    font_type: "Inter",
    font_color: "#000000",
    contract_types: DEFAULT_CONTRACT_TYPES,
    contract_durations: {
      'AMC': '12 months',
      'WARRANTY': '24 months',
      'LEASE': '36 months',
      'POC': '3 months'
    },
    timezone: "Africa/Nairobi",
    date_format: "DD/MM/YYYY",
    enable_email_notifications: true,
    enable_sms_notifications: true,
    enable_push_notifications: true,
    auto_reminder_days: 7
  });
  const [newContractType, setNewContractType] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const { toast } = useToast();
  const { getCompanySettings, updateCompanySettings } = useDatabase();

  useEffect(() => {
    loadCompanySettings();
  }, []);

  const loadCompanySettings = async () => {
    setIsLoading(true);
    try {
      const data = await getCompanySettings();

      if (data) {
        setSettings(prev => ({
          ...prev,
          id: data.id,
          company_name: data.name || prev.company_name,
          logo_path: data.logo_path || prev.logo_path,
          font_type: data.font_type || prev.font_type,
          primary_color: data.font_color || prev.primary_color,
          contract_types: data.contract_types || prev.contract_types,
        }));
        
        if (data.logo_path) {
          const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
          const fullLogoPath = data.logo_path.startsWith('http') 
            ? data.logo_path 
            : `${baseUrl}/uploads/${data.logo_path}`;
          setLogoPreview(fullLogoPath);
        }
      }
    } catch (error) {
      console.log("No company settings found, using defaults");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Logo file must be less than 2MB",
          variant: "destructive",
        });
        return;
      }
      setLogoFile(file);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        setLogoPreview(e.target?.result as string);
        
        try {
          const response = await apiClient.post('/upload', {
            fileName: `logo-${Date.now()}-${file.name}`,
            base64Data: base64Data
          });
          
          if (response.success) {
            setSettings(prev => ({ ...prev, logo_path: response.filePath }));
            toast({
              title: "Logo Uploaded",
              description: "New logo has been uploaded to the local server",
            });
          }
        } catch (error) {
          console.error("Error uploading logo:", error);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const companyData = {
        name: settings.company_name,
        logo_path: settings.logo_path,
        font_type: settings.font_type,
        font_color: settings.font_color,
        primary_color: settings.primary_color,
        contract_types: settings.contract_types,
      };

      await updateCompanySettings(companyData);

      toast({
        title: "Success",
        description: "Company settings saved successfully",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save company settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddContractType = () => {
    if (!newContractType || !newDuration) {
      toast({
        title: "Error",
        description: "Please fill in contract type and duration",
        variant: "destructive",
      });
      return;
    }

    if (settings.contract_types.includes(newContractType)) {
      toast({
        title: "Error",
        description: "Contract type already exists",
        variant: "destructive",
      });
      return;
    }

    setSettings({
      ...settings,
      contract_types: [...settings.contract_types, newContractType],
      contract_durations: {
        ...settings.contract_durations,
        [newContractType]: newDuration
      }
    });
    setNewContractType('');
    setNewDuration('');
  };

  const handleRemoveContractType = (contractType: string) => {
    const updatedTypes = settings.contract_types.filter(type => type !== contractType);
    const updatedDurations = { ...settings.contract_durations };
    delete updatedDurations[contractType];
    
    setSettings({
      ...settings,
      contract_types: updatedTypes,
      contract_durations: updatedDurations
    });
  };

  if (user.role !== 'Admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Company Settings</h1>
          <p className="text-muted-foreground">Configure company branding, system settings, and integrations</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Building2 className="h-4 w-4 mr-2" />
          Admin Panel
        </Badge>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company Info
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="subsidiaries" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Subsidiaries
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Feedback Survey
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} className="gradient-primary" disabled={isSaving}>
              {isSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save All Settings
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-riana">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input id="company_name" value={settings.company_name} onChange={(e) => setSettings({...settings, company_name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input id="tagline" value={settings.tagline} onChange={(e) => setSettings({...settings, tagline: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="flex gap-2">
                    <Globe className="h-5 w-5 text-muted-foreground mt-2" />
                    <Input id="website" value={settings.website} onChange={(e) => setSettings({...settings, website: e.target.value})} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-riana">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={settings.email} onChange={(e) => setSettings({...settings, email: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" value={settings.phone} onChange={(e) => setSettings({...settings, phone: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary_color">Primary Branding Color</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="primary_color"
                      type="color" 
                      value={settings.primary_color || '#1e3a8a'} 
                      onChange={(e) => setSettings({...settings, primary_color: e.target.value})}
                      className="w-12 h-10 p-1"
                    />
                    <Input 
                      type="text" 
                      value={settings.primary_color || '#1e3a8a'} 
                      onChange={(e) => setSettings({...settings, primary_color: e.target.value})}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground italic">Used for PDF report headers and accents</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="font_color">Font Color</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="font_color"
                      type="color" 
                      value={settings.font_color || '#000000'} 
                      onChange={(e) => setSettings({...settings, font_color: e.target.value})}
                      className="w-12 h-10 p-1"
                    />
                    <Input 
                      type="text" 
                      value={settings.font_color || '#000000'} 
                      onChange={(e) => setSettings({...settings, font_color: e.target.value})}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" value={settings.address} onChange={(e) => setSettings({...settings, address: e.target.value})} rows={2} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-riana">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileImage className="h-5 w-5" /> Company Logo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 border rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                    {logoPreview ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" /> : <FileImage className="h-8 w-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="logo_upload">Upload New Logo</Label>
                    <Input id="logo_upload" type="file" accept="image/*" onChange={handleLogoUpload} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo_path">Logo Path</Label>
                  <Input id="logo_path" value={settings.logo_path} readOnly className="bg-muted" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-riana">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Branding Colors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="primary_color">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={settings.primary_color} onChange={(e) => setSettings({...settings, primary_color: e.target.value})} className="w-12 h-10 p-1" />
                    <Input value={settings.primary_color} onChange={(e) => setSettings({...settings, primary_color: e.target.value})} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="font_type">System Font</Label>
                  <Select value={settings.font_type} onValueChange={(value) => setSettings({...settings, font_type: value})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Inter">Inter</SelectItem>
                      <SelectItem value="Roboto">Roboto</SelectItem>
                      <SelectItem value="Poppins">Poppins</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subsidiaries" className="mt-6">
          <SubsidiaryEscalationManager />
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <FeedbackSettingsPanel />
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          <DataManagementPanel user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
