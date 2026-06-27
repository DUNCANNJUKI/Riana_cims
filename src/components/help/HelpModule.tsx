import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User as UserIcon, 
  HelpCircle, 
  Book, 
  Video, 
  FileText,
  Mail,
  Download,
  ExternalLink,
  CheckCircle2,
  Monitor,
  Smartphone,
  Wifi,
  Shield,
  Database,
  Users,
  Settings,
  BarChart3,
  Calendar,
  ClipboardList,
  Play,
  Globe
} from "lucide-react";
import { User } from "@/types";

interface HelpModuleProps {
  user: User;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  helpful: number;
}

const helpArticles: HelpArticle[] = [
  {
    id: '1',
    title: 'How to add a new client',
    category: 'Clients',
    content: 'Navigate to the Clients section and click "Add Client". Fill in the required information including client name, contact person, and industry classification.',
    helpful: 15
  },
  {
    id: '2',
    title: 'Generating reports',
    category: 'Reports',
    content: 'Go to the Reports section, select a report template, configure filters, and choose your preferred format (PDF or Excel). All reports include company watermarks and professional letterhead.',
    helpful: 23
  },
  {
    id: '3',
    title: 'Excel import troubleshooting',
    category: 'Import',
    content: 'Ensure your Excel file follows the template format. Check for required columns and data validation errors. Download the template first from the Import module.',
    helpful: 18
  },
  {
    id: '4',
    title: 'Managing user permissions',
    category: 'Users',
    content: 'User management is centralized in CIMS. Super Admin assigns roles, role-specific designations, subsidiaries, Developers workspace roles, and individual extra privileges using the checkboxes in Edit User. Finance is read-only by default. Management has broad administration access but cannot add, edit, or update installations.',
    helpful: 12
  },
  {
    id: '5',
    title: 'Uploading E-Handover documents',
    category: 'Handover',
    content: 'After installation is complete, go to the Installations section, find the client, and click "Upload" to add the signed E-Handover document. Automatic notifications are sent to team leads and admins.',
    helpful: 20
  },
  {
    id: '6',
    title: 'Creating installation budgets',
    category: 'Finances',
    content: 'Navigate to Finances module, click "Add Budget" and fill in equipment costs, labor costs, transport costs, and other expenses for accurate budget tracking.',
    helpful: 14
  },
  {
    id: '7',
    title: 'Setting up escalation matrix',
    category: 'Installations',
    content: 'Each installation can have a 3-tier escalation matrix. Click on "Escalation Matrix" when viewing installation details to configure contacts for each tier.',
    helpful: 16
  },
  {
    id: '8',
    title: 'Generating feedback links',
    category: 'Feedback',
    content: 'From the Installations view, click "Feedback" on any installation to generate a unique feedback link. Links can be sent via email or SMS.',
    helpful: 11
  },
  {
    id: '9',
    title: 'Adding LED display names',
    category: 'Installations',
    content: 'When adding or editing an installation, enter the LED count first. The system auto-generates text boxes for each LED display name. These names appear in E-Handover PDFs and all relevant reports.',
    helpful: 8
  },
  {
    id: '10',
    title: 'E-Handover notifications',
    category: 'Handover',
    content: 'When an E-Handover document is uploaded, automatic email and SMS notifications are sent to the team lead of that subsidiary, all administrators, and a copy to the uploader.',
    helpful: 10
  },
  {
    id: '11',
    title: 'Data Import with LED names',
    category: 'Import',
    content: 'When importing installation data, use semicolons to separate LED display names in the led_names column (e.g., "LED 1; LED 2; LED 3"). The system will parse and store them correctly.',
    helpful: 6
  },
  {
    id: '12',
    title: 'Report watermarks and logos',
    category: 'Reports',
    content: 'All PDF reports use the standard aligned header, watermark, page number, and footer. A MAREZI client or generating user automatically selects the approved MAREZI letterhead; other subsidiaries retain RIANA branding.',
    helpful: 9
  },
  {
    id: '13',
    title: 'User-specific Recent Reports',
    category: 'Reports',
    content: 'Sales, Finance, Management, Team Leads, Admins, and Super Admin can open reports allowed by their role. Recent dashboard activity stays hidden until the Recents button is selected.',
    helpful: 7
  },
  {
    id: '14',
    title: 'Bulk LED Names Import',
    category: 'Import',
    content: 'To import multiple installations with LED names, use the CSV template. In the led_names column, separate each LED name with a semicolon (e.g., "Main LED; Counter LED; Queue LED"). The system automatically parses these and calculates the led_count.',
    helpful: 5
  },
  {
    id: '15',
    title: 'Custom System Branding',
    category: 'Branding',
    content: 'The system interface always uses RIANA branding. Generated documents use the approved MAREZI letterhead when either the client or the generating user belongs to MAREZI; all other documents retain RIANA branding. PDF logos remain aspect-ratio safe and every page uses the standard aligned footer.',
    helpful: 5
  },
  {
    id: '16',
    title: 'Report Serialization',
    category: 'Reports',
    content: 'All generated reports include a unique serial number (e.g., Ria-INST-20240321-ABCD) for professional tracking and identification. This serial is visible in the top-right corner of the PDF.',
    helpful: 4
  },
  {
    id: '17',
    title: 'Professional Report Footer',
    category: 'Reports',
    content: 'Every PDF report features a professional graphical footer and a "Generated:" timestamp at the absolute bottom. This ensures all documents are clearly branded and dated.',
    helpful: 3
  },
  {
    id: '18',
    title: 'Developers workspace and shared login',
    category: 'Developers',
    content: 'The Developers workspace opens inside the normal CIMS page and uses the same login, notifications, theme, and inactivity timeout. Developer accounts are redirected there after sign-in.',
    helpful: 0
  },
  {
    id: '19',
    title: 'How Client Satisfaction is calculated',
    category: 'Feedback',
    content: 'Client Satisfaction uses CSAT: valid ratings of 4 or 5 divided by all valid 1-to-5 ratings, shown as a percentage. Average Rating and the 0-to-10 NPS recommendation score are separate metrics.',
    helpful: 0
  },
  {
    id: '20',
    title: 'Session inactivity and security',
    category: 'Security',
    content: 'The system warns shortly before the ten-minute inactivity limit. Continuing resets the timer; otherwise CIMS and Developers sign out together. Password or privilege changes invalidate older sessions.',
    helpful: 0
  },
  {
    id: '21',
    title: 'Developers Pending work',
    category: 'Developers',
    content: 'Open Developers and select Pending to see work waiting from your end. Sales sees approval items, developers see assigned or clarification work, and team leads see requests waiting for assignment or follow-up.',
    helpful: 0
  },
  {
    id: '22',
    title: 'E-Handover zero quantities',
    category: 'Handover',
    content: 'Equipment with a quantity of zero is marked Not installed in the E-Handover preview and exported PDF. Non-zero items retain their normal installed, configured, active, or operational status.',
    helpful: 0
  },
  {
    id: '23',
    title: 'Managing subsidiaries safely',
    category: 'Branding',
    content: 'Authorized company administrators can add, rename, configure, and delete subsidiaries from Company Settings. Deletion is blocked while any user is attached; reassign those users first.',
    helpful: 0
  }
];

const botResponses = [
  "Hello! I'm the RIANA CIMS Assistant. How can I help you today?",
  "I can help you with client management, installations, reports, and system navigation. What would you like to know?",
  "For client management, you can add, edit, and search clients in the Clients section. Would you like specific instructions?",
  "To generate reports, go to the Reports section and select from our available templates. I can guide you through the process.",
  "For Excel imports, make sure to download the template first and follow the column format. Do you need help with a specific import issue?",
  "User management is centralized in CIMS. Super Admin can assign roles, designations, subsidiaries, Developers access, and individual extra privileges.",
  "Installation tracking includes equipment details, service points, and handover documentation. What information do you need?",
  "System logs are available for Admins to monitor all user activities and system events. Would you like to know how to access them?"
];

const userManualSections = [
  {
    title: "Getting Started",
    icon: Play,
    content: "Log in with your credentials. First-time users will be prompted to change their password. Navigate using the sidebar menu to access different modules."
  },
  {
    title: "Dashboard Overview",
    icon: BarChart3,
    content: "The dashboard provides real-time statistics including total clients, installations by status, pending assignments, and recent activities. Normal users only see their own activity logs."
  },
  {
    title: "Client Management",
    icon: Users,
    content: "Add, edit, and manage client records. Each client can have multiple branches. Filter by industry classification and contract type."
  },
  {
    title: "Installation Tracking",
    icon: Settings,
    content: "Track equipment installations including kiosks, LED displays (with individual names), UPS, speakers, and more. Update status as work progresses through pending, in progress, and completed stages."
  },
  {
    title: "Assignment Management",
    icon: ClipboardList,
    content: "Assign hardware and software technicians to clients. Set installation dates and track progress. Extensions can be requested with reasons. Real-time updates for My Tasks."
  },
  {
    title: "Reports & Analytics",
    icon: FileText,
    content: "Generate comprehensive reports in PDF or CSV format. All PDFs include company watermarks and professional letterhead. Normal users can only see their own recent reports."
  },
  {
    title: "E-Handover Process",
    icon: CheckCircle2,
    content: "Generate E-Handover forms with LED display names for client sign-off. Upload signed documents to complete the installation. Automatic notifications are sent to team leads and admins."
  },
  {
    title: "Feedback Collection",
    icon: MessageCircle,
    content: "Generate unique feedback links for clients. Links can be sent via email (Brevo) or SMS (TextBee). Links expire after the configured period."
  }
];

const videoTutorials = [
  { title: "System Overview & Navigation", duration: "5:30", description: "Learn how to navigate RIANA CIMS and access different modules" },
  { title: "Adding Your First Client", duration: "3:45", description: "Step-by-step guide to adding and managing client records" },
  { title: "Installation Workflow", duration: "8:15", description: "Complete walkthrough from assignment to handover with LED names" },
  { title: "Generating Reports", duration: "4:20", description: "Create and download reports with watermarks in various formats" },
  { title: "User & Role Management", duration: "6:00", description: "Admin guide to managing users and permissions" },
  { title: "E-Handover & Notifications", duration: "4:00", description: "How to upload handovers and understand automatic notifications" }
];

const systemRequirements = {
  browser: [
    { name: "Google Chrome", version: "90+", recommended: true },
    { name: "Mozilla Firefox", version: "88+", recommended: true },
    { name: "Microsoft Edge", version: "90+", recommended: true },
    { name: "Safari", version: "14+", recommended: false }
  ],
  hardware: [
    { requirement: "Internet Connection", specification: "Stable broadband (5 Mbps+)" },
    { requirement: "Screen Resolution", specification: "1366x768 minimum, 1920x1080 recommended" },
    { requirement: "RAM", specification: "4GB minimum, 8GB recommended" },
    { requirement: "Storage", specification: "500MB for offline cache" }
  ],
  mobile: [
    { platform: "iOS", version: "14.0+", browser: "Safari" },
    { platform: "Android", version: "10+", browser: "Chrome" }
  ]
};

export const HelpModule = ({ user }: HelpModuleProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      content: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}! Welcome to RIANA CIMS V.5 Help Center. I'm your AI assistant. How can I help you today?`,
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);
  const [isVideoTutorialsOpen, setIsVideoTutorialsOpen] = useState(false);
  const [isSystemReqOpen, setIsSystemReqOpen] = useState(false);
  const { toast } = useToast();

  const sendDocumentation = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/help/send-documentation', {
        email: email,
        user_name: `${user.first_name} ${user.last_name}`
      });

      toast({
        title: "Success",
        description: "Complete system documentation has been sent to your email!",
      });

      setEmail("");
    } catch (error: any) {
      console.error('Error sending documentation:', error);
      toast({
        title: "Error",
        description: "Failed to send documentation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const categories = Array.from(new Set(helpArticles.map(article => article.category)));

  const filteredArticles = selectedCategory 
    ? helpArticles.filter(article => article.category === selectedCategory)
    : helpArticles;

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    const currentInput = inputMessage;
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");

    // Use AI-powered response via edge function
    try {
      const data = await apiClient.post('/chat/assistant', {
        message: currentInput
      });

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.reply || botResponses[Math.floor(Math.random() * botResponses.length)],
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: botResponses[Math.floor(Math.random() * botResponses.length)],
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Help Center</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Get help with RIANA CIMS V.5 features and functionality</p>
        </div>
      </div>

      {/* Contact Support Prompt */}
      <Card className="bg-muted/50 border-dashed border-2">
        <CardContent className="pt-6 pb-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <HelpCircle className="h-8 w-8 text-primary/50" />
            <h3 className="text-lg font-semibold">Need further assistance?</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              If you encounter any issues or require specific documentation, please contact our system administrator or reach out to RIANA Support.
            </p>
            <div className="flex gap-4 mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = 'mailto:support@riana.co?subject=RIANA CIMS Support Request'}
              >
                <Mail className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = 'mailto:admin@riana.co?subject=Internal System Help Request'}
              >
                <Users className="h-4 w-4 mr-2" />
                Contact Admin
              </Button>
              <Button 
                variant="default" 
                size="sm"
                className="gradient-primary"
                onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Live User Chat
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Chat Assistant */}
        <div className="lg:col-span-2">
          <Card className="shadow-riana h-[500px] sm:h-[600px] flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Bot className="h-5 w-5 text-primary" />
                AI Assistant Chat
              </CardTitle>
              <CardDescription className="text-sm">
                Ask questions about RIANA CIMS features and get instant help
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 mb-4 p-3 sm:p-4 border rounded-lg">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 sm:gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex gap-2 max-w-[90%] sm:max-w-[80%] ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 ${
                          message.sender === 'user' 
                            ? 'bg-primary text-white' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {message.sender === 'user' ? (
                            <UserIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                          ) : (
                            <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                        </div>
                        <div className={`p-2 sm:p-3 rounded-lg ${
                          message.sender === 'user' 
                            ? 'bg-primary text-white' 
                            : 'bg-muted'
                        }`}>
                          <p className="text-xs sm:text-sm">{message.content}</p>
                          <p className={`text-[10px] sm:text-xs mt-1 opacity-70`}>
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="flex gap-2">
                <Input
                  placeholder="Type your question here..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 text-sm"
                />
                <Button onClick={handleSendMessage} className="gradient-primary">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Help Articles & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="shadow-riana">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HelpCircle className="h-5 w-5" />
                Quick Help
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Dialog open={isUserManualOpen} onOpenChange={setIsUserManualOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-sm">
                    <Book className="h-4 w-4 mr-2" />
                    User Manual
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Book className="h-5 w-5 text-primary" />
                      RIANA CIMS V.5 User Manual
                    </DialogTitle>
                    <DialogDescription>
                      Comprehensive guide to using all features of the system
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[60vh] pr-4">
                    <Accordion type="single" collapsible className="w-full">
                      {userManualSections.map((section, index) => (
                        <AccordionItem key={index} value={`item-${index}`}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <section.icon className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{section.title}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground pl-12">
                            {section.content}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </ScrollArea>
                </DialogContent>
              </Dialog>

              <Dialog open={isVideoTutorialsOpen} onOpenChange={setIsVideoTutorialsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-sm">
                    <Video className="h-4 w-4 mr-2" />
                    Video Tutorials
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-primary" />
                      Video Tutorials
                    </DialogTitle>
                    <DialogDescription>
                      Watch step-by-step tutorials to learn system features
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {videoTutorials.map((video, index) => (
                        <div 
                          key={index} 
                          className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Play className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium text-sm">{video.title}</h4>
                              <p className="text-xs text-muted-foreground">{video.description}</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs">{video.duration}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Video tutorials coming soon. Contact support for personalized training.
                  </p>
                </DialogContent>
              </Dialog>

              <Dialog open={isSystemReqOpen} onOpenChange={setIsSystemReqOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-sm">
                    <Monitor className="h-4 w-4 mr-2" />
                    System Requirements
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Monitor className="h-5 w-5 text-primary" />
                      System Requirements
                    </DialogTitle>
                    <DialogDescription>
                      Minimum and recommended specifications for RIANA CIMS
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-6">
                      {/* Browser Requirements */}
                      <div>
                        <h4 className="font-semibold flex items-center gap-2 mb-3">
                          <Globe className="h-4 w-4 text-primary" />
                          Supported Browsers
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {systemRequirements.browser.map((browser, index) => (
                            <div key={index} className="p-3 border rounded-lg flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{browser.name}</p>
                                <p className="text-xs text-muted-foreground">Version {browser.version}</p>
                              </div>
                              {browser.recommended && (
                                <Badge className="text-[10px] bg-success/10 text-success border-success/20">Recommended</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Hardware Requirements */}
                      <div>
                        <h4 className="font-semibold flex items-center gap-2 mb-3">
                          <Monitor className="h-4 w-4 text-primary" />
                          Hardware Requirements
                        </h4>
                        <div className="space-y-2">
                          {systemRequirements.hardware.map((req, index) => (
                            <div key={index} className="flex justify-between p-3 border rounded-lg">
                              <span className="font-medium text-sm">{req.requirement}</span>
                              <span className="text-sm text-muted-foreground">{req.specification}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mobile Requirements */}
                      <div>
                        <h4 className="font-semibold flex items-center gap-2 mb-3">
                          <Smartphone className="h-4 w-4 text-primary" />
                          Mobile Platforms
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {systemRequirements.mobile.map((mobile, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <p className="font-medium text-sm">{mobile.platform}</p>
                              <p className="text-xs text-muted-foreground">Version {mobile.version} • {mobile.browser}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* PWA Note */}
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <Download className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <h4 className="font-semibold text-sm">Install as App (PWA)</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              RIANA CIMS can be installed as a Progressive Web App on both mobile and desktop for offline access and push notifications.
                            </p>
                            <Button 
                              variant="link" 
                              className="p-0 h-auto text-xs mt-2"
                              onClick={() => window.open('/install', '_blank')}
                            >
                              View Installation Guide →
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>

              <Button 
                variant="outline" 
                className="w-full justify-start text-sm"
                onClick={() => window.location.href = 'mailto:support@riana.co?subject=RIANA CIMS Support Request'}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
            </CardContent>
          </Card>

          {/* Help Articles */}
          <Card className="shadow-riana">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Book className="h-5 w-5" />
                Help Articles
              </CardTitle>
              <CardDescription className="text-sm">
                Browse common questions and guides
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={selectedCategory === '' ? 'default' : 'outline'}
                    onClick={() => setSelectedCategory('')}
                    className="text-xs"
                  >
                    All
                  </Button>
                  {categories.map(category => (
                    <Button
                      key={category}
                      size="sm"
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      onClick={() => setSelectedCategory(category)}
                      className="text-xs"
                    >
                      {category}
                    </Button>
                  ))}
                </div>

                <ScrollArea className="h-64 sm:h-80">
                  <div className="space-y-3 pr-3">
                    {filteredArticles.map((article) => (
                      <div key={article.id} className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{article.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {article.content}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {article.category}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            {article.helpful} found helpful
                          </span>
                          <Button size="sm" variant="ghost" className="text-[10px] h-5 px-2">
                            Read More
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          {/* System Info */}
          <Card className="shadow-riana">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">System Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Version:</span>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">RIANA CIMS V.5</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your Role:</span>
                <Badge variant="outline" className="text-xs">{user.role}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Year:</span>
                <span>{currentYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Login:</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Support ID:</span>
                <span className="font-mono text-[10px] truncate max-w-[120px]">{user.id}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
