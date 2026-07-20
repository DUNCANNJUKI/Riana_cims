import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Building2, Phone, Mail, Calendar, User, Loader2, Eye, Plus, Trash2 } from "lucide-react";
import { Client, HandoverEquipmentItem, Installation, User as UserType } from "@/types";
import { useDatabase } from "@/hooks/useDatabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addCimsDocumentHeader, addLetterheadToDocument, DOCUMENT_LAYOUT, getPDFAsBlob, generateReportSerial, resolveDocumentBrand } from "@/utils/pdfWatermark";
import { PDFPreviewModal } from "@/components/common/PDFPreviewModal";
import { apiClient } from "@/integrations/apiClient";
import { toast } from "sonner";
import { resolveDocumentSubsidiaryName } from "@/utils/brandIdentity";
import { can } from "@/security/accessControl";
import { OPERATIONAL_REFRESH_INTERVAL_MS } from "@/utils/refreshIntervals";
import { getBranchLabel, getDepartmentLabel, getScopeFileSegment } from "@/utils/scopeLabels";
import {
  buildHandoverEquipmentRows,
  defaultHandoverEquipmentConfiguration,
  normalizeHandoverEquipmentConfiguration,
} from "@/utils/equipmentConfiguration";

interface EHandoverFormProps {
  client: Client;
  installation: Installation;
  user: UserType;
}

interface EscalationTier {
  name: string;
  role: string;
  phone_number: string;
  email: string;
}

interface ParsedEscalationMatrix {
  tier1?: EscalationTier;
  tier2?: EscalationTier;
  tier3?: EscalationTier;
  [tierKey: string]: EscalationTier | undefined;
}

const parsedEscalationTiers = (matrix: ParsedEscalationMatrix | null) =>
  Object.entries(matrix || {})
    .filter(([key, tier]) => /^tier\d+$/.test(key) && tier?.name)
    .sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4))) as [string, EscalationTier][];

export const EHandoverForm = ({ client, installation, user }: EHandoverFormProps) => {
  const canManageInstallations = can(user, 'installations.manage');
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("RIANA Technologies");
  const [escalationMatrix, setEscalationMatrix] = useState<ParsedEscalationMatrix | null>(null);
  const [equipmentConfiguration, setEquipmentConfiguration] = useState<HandoverEquipmentItem[]>(defaultHandoverEquipmentConfiguration);
  const [accountManager, setAccountManager] = useState<string>("");
  const [hardwareTech, setHardwareTech] = useState<string>("");
  const [softwareTech, setSoftwareTech] = useState<string>("");
  const [assignedTech, setAssignedTech] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [ledNames, setLedNames] = useState<string[]>([]);
  const [isSavingLeds, setIsSavingLeds] = useState(false);
  const [liveInstallation, setLiveInstallation] = useState<Installation>(installation);
  const { getCompanySettings, getUsers } = useDatabase();
  const subsidiaryName = resolveDocumentSubsidiaryName(
    client.subsidiary_name,
    client.subsidiaries?.subsidiary_name,
    user.subsidiary_name,
  );
  const displayInstallation = useMemo(() => ({
    ...liveInstallation,
    status: 'completed' as const,
    completion_date: liveInstallation.completion_date || new Date().toISOString().slice(0, 10),
  }), [liveInstallation]);
  const equipmentRows = useMemo(
    () => buildHandoverEquipmentRows(displayInstallation, equipmentConfiguration),
    [displayInstallation, equipmentConfiguration],
  );
  const handoverScope = {
    ...client,
    ...displayInstallation,
    branch: (displayInstallation as any).branch_name || (displayInstallation as any).branch || client.branch,
    branch_name: (displayInstallation as any).branch_name,
    department_name: (displayInstallation as any).department_name,
    branch_count: (displayInstallation as any).branch_count,
    department_count: (displayInstallation as any).department_count,
  };
  const branchLabel = getBranchLabel(handoverScope);
  const departmentLabel = getDepartmentLabel(handoverScope);
  const scopeFileSegment = getScopeFileSegment(handoverScope);
  const clientPhone = (client as any).contact_person_phone || (client as any).contact_phone || (client as any).contact_person_phone_masked || (client as any).contact_phone_masked || 'N/A';
  const clientEmail = (client as any).contact_person_email || (client as any).contact_email || (client as any).contact_person_email_masked || (client as any).contact_email_masked || 'N/A';
  const startDateValue = client.start_date || displayInstallation.assigned_date || (displayInstallation as any).installation_start_date || displayInstallation.created_at;

  // Load installation data
  const loadInstallationData = useCallback(async () => {
    try {
      const data = await apiClient.get(`/installations/${installation.id}`);
      if (data) {
        setLiveInstallation(data as unknown as Installation);
        // Parse led_names from JSON
        const names = data.led_names;
        const parsedNames = typeof names === 'string' ? JSON.parse(names) : names;
        if (parsedNames && Array.isArray(parsedNames)) {
          setLedNames(parsedNames);
        } else {
          // Initialize with empty names based on led_count
          const count = data.led_count || 0;
          setLedNames(Array(count).fill('').map((_, i) => `LED Display ${i + 1}`));
        }
      }
    } catch (error) {
      console.error('Error loading installation data:', error);
    }
  }, [installation.id]);

  useEffect(() => {
    loadInstallationData();
    loadCompanyData();
    loadEscalationMatrix();
    loadTechnicians();

    // Keep background refresh gentle while the handover form is open.
    const interval = setInterval(() => {
      loadInstallationData();
    }, OPERATIONAL_REFRESH_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, [installation.id, loadInstallationData]);

  const loadCompanyData = async () => {
    try {
      const companyData = await getCompanySettings();
      if (companyData?.logo_path) {
        setCompanyLogo(companyData.logo_path);
      }
      if (companyData?.name) {
        setCompanyName(companyData.name);
      }
    } catch (error) {
      console.error('Error loading company data:', error);
    }
  };

  const loadTechnicians = async () => {
    try {
      const users = await getUsers();
      
      if (installation.account_manager_id) {
        const am = users.find(u => u.id === installation.account_manager_id);
        setAccountManager(am ? `${am.first_name} ${am.last_name}` : 'Not assigned');
      }
      
      if (installation.hardware_technician_id) {
        const ht = users.find(u => u.id === installation.hardware_technician_id);
        setHardwareTech(ht ? `${ht.first_name} ${ht.last_name}` : 'Not assigned');
      }
      
      if (installation.software_technician_id) {
        const st = users.find(u => u.id === installation.software_technician_id);
        setSoftwareTech(st ? `${st.first_name} ${st.last_name}` : 'Not assigned');
      }
      
      if (installation.assigned_technician_id) {
        const at = users.find(u => u.id === installation.assigned_technician_id);
        setAssignedTech(at ? `${at.first_name} ${at.last_name}` : 'Not assigned');
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  };

  const loadEscalationMatrix = async () => {
    let hasInstallationMatrix = false;
    // First, try to use installation's escalation matrix
    if (installation.escalation_matrix) {
      try {
        const matrix = typeof installation.escalation_matrix === 'string' 
          ? JSON.parse(installation.escalation_matrix)
          : installation.escalation_matrix;
        
        setEscalationMatrix(matrix as ParsedEscalationMatrix);
        hasInstallationMatrix = true;
      } catch (error) {
        console.error('Error parsing escalation matrix:', error);
      }
    }
    
    // If no installation matrix, try to fetch subsidiary's default escalation matrix
    try {
      // Get client's subsidiary
      const clientData = await apiClient.get(`/clients/${client.id}`);
      
      if (clientData?.subsidiary_id) {
        const subsidiaryData = await apiClient.get(`/subsidiaries/${clientData.subsidiary_id}`);
        setEquipmentConfiguration(normalizeHandoverEquipmentConfiguration(subsidiaryData?.equipment_configuration));
        
        if (!hasInstallationMatrix && subsidiaryData?.default_escalation_matrix) {
          const matrix = typeof subsidiaryData.default_escalation_matrix === 'string'
            ? JSON.parse(subsidiaryData.default_escalation_matrix)
            : subsidiaryData.default_escalation_matrix;
          setEscalationMatrix(matrix as ParsedEscalationMatrix);
        }
      }
    } catch (error) {
      console.error('Error fetching subsidiary escalation matrix:', error);
    }
  };

  // LED name management functions
  const handleLedNameChange = (index: number, value: string) => {
    const newNames = [...ledNames];
    newNames[index] = value;
    setLedNames(newNames);
  };

  const addLedName = () => {
    setLedNames([...ledNames, `LED Display ${ledNames.length + 1}`]);
  };

  const removeLedName = (index: number) => {
    if (ledNames.length > 1) {
      const newNames = ledNames.filter((_, i) => i !== index);
      setLedNames(newNames);
    }
  };

  const saveLedNames = async () => {
    setIsSavingLeds(true);
    try {
      await apiClient.patch(`/installations/${installation.id}`, { 
        led_names: JSON.stringify(ledNames),
        led_count: ledNames.length 
      });
      
      toast.success('LED names saved successfully');
      loadInstallationData();
    } catch (error) {
      console.error('Error saving LED names:', error);
      toast.error('Failed to save LED names');
    } finally {
      setIsSavingLeds(false);
    }
  };

  // Generate unique client code
  const generateClientCode = () => {
    const prefix = "EHO";
    const clientInitials = client.client_name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3);
    const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const uniqueId = installation.id?.substring(0, 4).toUpperCase() || "0000";
    return `${prefix}-${clientInitials}-${dateCode}-${uniqueId}`;
  };

  const generatePDFDocument = async (): Promise<jsPDF> => {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentBottom = DOCUMENT_LAYOUT.contentBottom;
      let yPos = margin;
      const clientCode = generateClientCode();
      const brand = resolveDocumentBrand(subsidiaryName);

      // Colors
      const primaryColor: [number, number, number] = brand.primary;
      const tealColor: [number, number, number] = brand.accent;
      const textColor: [number, number, number] = [31, 41, 55];
      const mutedColor: [number, number, number] = [107, 114, 128];

      // Helper function for page break check
      const checkPageBreak = (neededHeight: number) => {
        if (yPos + neededHeight > contentBottom) {
          doc.addPage();
          yPos = DOCUMENT_LAYOUT.continuationContentTop;
          return true;
        }
        return false;
      };

      // Helper function to add text
      const addText = (text: string, x: number, y: number, options: { fontSize?: number; color?: [number, number, number]; fontStyle?: string; align?: 'left' | 'center' | 'right' } = {}) => {
        doc.setFontSize(options.fontSize || 10);
        doc.setTextColor(...(options.color || textColor));
        if (options.fontStyle) doc.setFont('helvetica', options.fontStyle);
        else doc.setFont('helvetica', 'normal');
        doc.text(text, x, y, { align: options.align || 'left' });
      };

      const serial = generateReportSerial('EH');
      await addCimsDocumentHeader(doc, {
        subtitle: 'E-HANDOVER CERTIFICATE',
        documentTitle: 'Official Installation Completion Document',
        logoPath: companyLogo || '/Riana_logo.png',
        metaRight: `Serial: ${serial}`,
        headerHeight: brand.id === 'marezi' ? 52 : 48,
        accentColor: tealColor,
        subsidiaryName,
      });
      
      yPos = 58;

      // Client Information Section
      doc.setFillColor(240, 247, 255);
      doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos - 2, margin, yPos + 5);
      addText('CLIENT INFORMATION', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
      yPos += 12;

      // Client details in two columns
      const col1X = margin;
      const col2X = pageWidth / 2 + 5;
      const lineHeight = 6;

      const clientDetails = [
        ['Client Name:', client.client_name],
        ['Branch:', branchLabel],
        ['Department:', departmentLabel],
        ['Contact Person:', client.contact_person_name],
        ['Phone:', clientPhone],
        ['Email:', clientEmail],
      ];

      const installDetails = [
        ['Industry:', client.industry_classification],
        ['Contract Type:', client.contract_type],
        ['Start Date:', startDateValue ? new Date(startDateValue).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not Assigned'],
        ['Completion Date:', displayInstallation.completion_date ? new Date(displayInstallation.completion_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'In Progress'],
        ['Status:', 'COMPLETE'],
      ];

      clientDetails.forEach((item, idx) => {
        addText(item[0], col1X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
        addText(item[1], col1X + 30, yPos + idx * lineHeight, { fontSize: 9 });
      });

      installDetails.forEach((item, idx) => {
        addText(item[0], col2X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
        addText(item[1], col2X + 32, yPos + idx * lineHeight, { fontSize: 9 });
      });

      yPos += clientDetails.length * lineHeight + 8;

      // Assigned Team Section
      doc.setFillColor(240, 247, 255);
      doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
      doc.line(margin, yPos - 2, margin, yPos + 5);
      addText('ASSIGNED TEAM', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
      yPos += 12;

      const teamDetails = [
        ['Account Manager:', accountManager || 'Not assigned'],
        ['Hardware Technician:', hardwareTech || 'Not assigned'],
      ];
      const teamDetails2 = [
        ['Software Technician:', softwareTech || 'Not assigned'],
        ['Lead Technician:', assignedTech || 'Not assigned'],
      ];

      teamDetails.forEach((item, idx) => {
        addText(item[0], col1X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
        addText(item[1], col1X + 38, yPos + idx * lineHeight, { fontSize: 9 });
      });
      teamDetails2.forEach((item, idx) => {
        addText(item[0], col2X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
        addText(item[1], col2X + 38, yPos + idx * lineHeight, { fontSize: 9 });
      });

      yPos += teamDetails.length * lineHeight + 8;

      // Equipment Details Section
      doc.setFillColor(240, 247, 255);
      doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
      doc.line(margin, yPos - 2, margin, yPos + 5);
      addText('EQUIPMENT DETAILS', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
      yPos += 10;

      const equipmentData = equipmentRows.map((row) => [row.label, row.displayValue, row.status]);

      autoTable(doc, {
        startY: yPos,
        head: [['Equipment Type', 'Quantity/Details', 'Status']],
        body: equipmentData,
        margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { textColor: [22, 101, 52] }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2 && data.cell.raw === 'Not installed') {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // ========== LED DISPLAY NAMES SECTION - Multi-page support ==========
      if (liveInstallation.led_count > 0 && ledNames.length > 0) {
        checkPageBreak(25);

        doc.setFillColor(240, 247, 255);
        doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos - 2, margin, yPos + 5);
        addText('LED DISPLAY NAMES', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
        yPos += 10;

        // Split LED names into chunks that fit per page - reduced to 10 for better visibility
        const ledsPerPage = 10;
        const ledChunks: string[][] = [];
        for (let i = 0; i < ledNames.length; i += ledsPerPage) {
          ledChunks.push(ledNames.slice(i, i + ledsPerPage));
        }

        ledChunks.forEach((chunk, chunkIndex) => {
          if (chunkIndex > 0) {
            doc.addPage();
            yPos = DOCUMENT_LAYOUT.continuationContentTop;
            // Add continuation header
            doc.setFillColor(240, 247, 255);
            doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
            doc.line(margin, yPos - 2, margin, yPos + 5);
            addText(`LED DISPLAY NAMES (Continued - Page ${chunkIndex + 1})`, margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
            yPos += 10;
          }

          const startIdx = chunkIndex * ledsPerPage;
          const ledData = chunk.map((name, idx) => [
            `LED ${startIdx + idx + 1}`,
            name || `LED Display ${startIdx + idx + 1}`,
            'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ Installed & Verified'
          ]);

          autoTable(doc, {
            startY: yPos,
            head: [['LED #', 'Display Name/Location', 'Status']],
            body: ledData,
            margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 25 },
              1: { cellWidth: 'auto' },
              2: { textColor: [22, 101, 52], cellWidth: 40 }
            },
            // Ensure table doesn't overlap footer
            pageBreak: 'auto',
            showHead: 'everyPage'
          });
          yPos = (doc as any).lastAutoTable.finalY + 6;
        });
      }

      // ========== ESCALATION MATRIX SECTION ==========
      if (parsedEscalationTiers(escalationMatrix).length > 0) {
        checkPageBreak(50);

        doc.setFillColor(240, 247, 255);
        doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
        doc.setDrawColor(...primaryColor);
        doc.line(margin, yPos - 2, margin, yPos + 5);
        addText('ESCALATION MATRIX', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
        yPos += 10;

        const escalationData = parsedEscalationTiers(escalationMatrix).map(([key, tier]) => [
          `Tier ${Number(key.slice(4))}`,
          tier.name,
          tier.role,
          tier.phone_number,
          tier.email,
        ]);

        if (escalationData.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [['Level', 'Contact Person', 'Role', 'Phone', 'Email']],
            body: escalationData,
            margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
          styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 247, 255] },
          pageBreak: 'auto',
          showHead: 'everyPage'
          });
        yPos = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      // ========== REMARKS & NOTES SECTION ==========
      checkPageBreak(30);

      doc.setFillColor(240, 247, 255);
      doc.rect(margin, yPos - 2, pageWidth - 2 * margin, 7, 'F');
      doc.line(margin, yPos - 2, margin, yPos + 5);
      addText('REMARKS & NOTES', margin + 3, yPos + 3, { fontSize: 11, color: primaryColor, fontStyle: 'bold' });
      yPos += 10;

      doc.setFillColor(249, 250, 251);
      doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 12, 'F');
      doc.setDrawColor(209, 213, 219);
      doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 12);
      addText(liveInstallation.remarks || 'No additional notes provided.', margin + 3, yPos + 3, { fontSize: 8, color: mutedColor });
      yPos += 16;

      // Signature Section
      if (yPos > pageHeight - 45) {
        doc.addPage();
        yPos = DOCUMENT_LAYOUT.continuationContentTop;
      }

      const sigBoxWidth = (pageWidth - 2 * margin - 10) / 2;
      const sigBoxHeight = 32;

      // Client signature box
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, yPos, sigBoxWidth, sigBoxHeight, 'F');
      doc.setDrawColor(209, 213, 219);
      doc.rect(margin, yPos, sigBoxWidth, sigBoxHeight);
      addText('Client Representative', margin + sigBoxWidth / 2, yPos + 4, { fontSize: 9, color: primaryColor, fontStyle: 'bold', align: 'center' });
      doc.line(margin + 10, yPos + 22, margin + sigBoxWidth - 10, yPos + 22);
      addText('Name & Signature', margin + sigBoxWidth / 2, yPos + 26, { fontSize: 7, color: mutedColor, align: 'center' });
      addText('Date: ________________', margin + sigBoxWidth / 2, yPos + 30, { fontSize: 7, color: mutedColor, align: 'center' });

      // Company signature box
      doc.setFillColor(250, 250, 250);
      doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight, 'F');
      doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight);
      addText(brand.id === 'marezi' ? brand.name : companyName, margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 4, { fontSize: 9, color: primaryColor, fontStyle: 'bold', align: 'center' });
      doc.line(margin + sigBoxWidth + 20, yPos + 22, margin + 2 * sigBoxWidth, yPos + 22);
      addText('Technician Signature', margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 26, { fontSize: 7, color: mutedColor, align: 'center' });
      addText('Date: ________________', margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 30, { fontSize: 7, color: mutedColor, align: 'center' });

      // Note: Footer is handled by addLetterheadToDocument - don't add extra footer here
      // to avoid overlap with the letterhead footer

      // Add letterhead and watermarks to all pages for authenticity
      try {
        await addLetterheadToDocument(doc, companyLogo || '/Riana_logo.png', '/letterhead-new.jpg', {
          subsidiaryName,
          documentTitle: 'E-Handover Certificate',
        });
      } catch (error) {
        console.log('Letterhead could not be added:', error);
      }

    return doc;
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const completionDate = displayInstallation.completion_date || new Date().toISOString().slice(0, 10);
      if (liveInstallation.status !== 'completed' || !liveInstallation.completion_date) {
        await apiClient.patch(`/installations/${installation.id}`, { status: 'completed', completion_date: completionDate });
        setLiveInstallation(current => ({ ...current, status: 'completed', completion_date: completionDate }));
      }
      const doc = await generatePDFDocument();
      const clientCode = generateClientCode();
      const fileName = `E-Handover_${client.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${scopeFileSegment}_${clientCode}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const previewPDF = async () => {
    setIsPreviewing(true);
    try {
      const doc = await generatePDFDocument();
      const blob = getPDFAsBlob(doc);
      setPreviewBlob(blob);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewBlob(null);
  };

  return (
    <Card className="shadow-riana">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          E-Handover Form
        </CardTitle>
        <CardDescription>
          Installation completion certificate for {client.client_name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Header with Company Logo */}
        <div className="text-center py-4 border-b">
          {companyLogo && (
            <img src={companyLogo} alt="Company Logo" className="h-16 mx-auto mb-4" />
          )}
          <h2 className="text-2xl font-bold text-primary">E-HANDOVER FORM</h2>
          <p className="text-muted-foreground">Installation Completion Certificate</p>
        </div>

        {/* Client Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="font-medium">Client:</span> {client.client_name}</div>
              <div><span className="font-medium">Branch:</span> {branchLabel}</div>
              <div><span className="font-medium">Department:</span> {departmentLabel}</div>
              <div><span className="font-medium">Contact:</span> {client.contact_person_name}</div>
              <div><span className="font-medium">Phone:</span> {clientPhone}</div>
              <div><span className="font-medium">Email:</span> {clientEmail}</div>
              <div><span className="font-medium">Industry:</span> {client.industry_classification}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Installation Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="font-medium">Contract:</span> {client.contract_type}</div>
              <div><span className="font-medium">Start Date:</span> {startDateValue ? new Date(startDateValue).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not Assigned'}</div>
              <div><span className="font-medium">Completion:</span> {displayInstallation.completion_date ? new Date(displayInstallation.completion_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'In Progress'}</div>
              <div><span className="font-medium">Scheduled End:</span> {liveInstallation.scheduled_end_date ? new Date(liveInstallation.scheduled_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</div>
              <div><span className="font-medium">Status:</span> <Badge className="ml-2">COMPLETE</Badge></div>
            </CardContent>
          </Card>
        </div>

        {/* Equipment Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Equipment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentRows.map((row) => (
                  <TableRow key={row.field}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{row.displayValue}</TableCell>
                    <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* LED Display Names */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>LED Display Names</span>
              {canManageInstallations && <Button
                variant="outline" 
                size="sm" 
                onClick={addLedName}
                className="h-8"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add LED Display
              </Button>}
            </CardTitle>
            <CardDescription>
              Enter the names/identifiers for each installed LED display
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ledNames.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p>No LED displays configured. Click "Add LED Display" to start.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ledNames.map((name, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label htmlFor={`led-${index}`} className="text-xs text-muted-foreground">
                          LED Display {index + 1}
                        </Label>
                        <Input
                          id={`led-${index}`}
                          value={name}
                          onChange={(e) => handleLedNameChange(index, e.target.value)}
                          placeholder={`LED Display ${index + 1}`}
                          className="h-9"
                        />
                      </div>
                      {ledNames.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLedName(index)}
                          className="h-9 w-9 mt-5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={saveLedNames} 
                    disabled={isSavingLeds}
                    size="sm"
                  >
                    {isSavingLeds ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {isSavingLeds ? 'Saving...' : 'Save LED Names'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Escalation Matrix */}
        {escalationMatrix && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Escalation Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedEscalationTiers(escalationMatrix).map(([key, tier]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">Tier {Number(key.slice(4))}</TableCell>
                      <TableCell>{tier.name}</TableCell>
                      <TableCell>{tier.role}</TableCell>
                      <TableCell>{tier.phone_number}</TableCell>
                      <TableCell>{tier.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Export Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={previewPDF} disabled={isPreviewing || isExporting}>
            {isPreviewing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            {isPreviewing ? 'Loading...' : 'Preview'}
          </Button>
          <Button onClick={exportToPDF} className="gradient-primary" disabled={isExporting || isPreviewing}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isExporting ? 'Generating...' : 'Export PDF'}
          </Button>
        </div>
      </CardContent>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        pdfBlob={previewBlob}
        fileName={`E-Handover_${client.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${scopeFileSegment}.pdf`}
        title="E-Handover Form Preview"
        description={`Review the handover form for ${client.client_name}`}
      />
    </Card>
  );
};
