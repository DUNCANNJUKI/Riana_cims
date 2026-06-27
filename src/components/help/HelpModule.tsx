import { useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Download,
  Headphones,
  HelpCircle,
  Info,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Monitor,
  Search,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
} from 'lucide-react';
import { User } from '@/types';
import { formatRoleLabel } from '@/utils/roleLabel';
import { apiClient } from '@/integrations/apiClient';
import { useToast } from '@/hooks/use-toast';
import { HelpAssistantPanel } from './HelpAssistantPanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface HelpModuleProps {
  user: User;
}

interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
}

const HELP_ARTICLES: HelpArticle[] = [
  { id: 'getting-started', title: 'Getting started with RIANA CIMS', category: 'Getting Started', content: 'Sign in with your approved work account, complete any first-login password change, then use the sidebar to open modules available to your role. The dashboard summarizes your permitted operational data and notifications.' },
  { id: 'roles', title: 'Roles, designations, and extra privileges', category: 'Access', content: 'Roles provide the default access model. Super Admin can assign role-specific designations, subsidiaries, Developers workspace access, and individual extra privileges. Extra privileges supplement the base role; Management remains unable to add, edit, or update installations.' },
  { id: 'finance', title: 'Finance role: read-only operational access', category: 'Access', content: 'Finance users can view clients, installations, assigned technicians, installation progress, and all available reports. Create, edit, assignment, progress-update, upload, and delete controls remain unavailable unless Super Admin grants a permitted extra privilege.' },
  { id: 'management', title: 'Management role boundaries', category: 'Access', content: 'CEO, MD, and Head of Sales designations receive broad administrative visibility and management functions. Management users cannot add, edit, update, or advance installations or installation progress.' },
  { id: 'clients', title: 'Find and manage client records', category: 'Clients', content: 'Open Clients to search profiles, branches, contacts, contract types, and subsidiary ownership. Add, edit, and delete controls appear only when your account has client-management permission.' },
  { id: 'installations', title: 'Track installations and assigned technicians', category: 'Installations', content: 'Use Installations for scope and equipment details, Assigned Technicians for technician allocation, and Installation Progress for delivery status. Read-only roles retain preview access without mutation controls.' },
  { id: 'handover', title: 'Generate and complete an E-Handover', category: 'Installations', content: 'Generate the E-Handover from an installation, review its equipment table, and upload the signed document after client sign-off. Any numeric equipment quantity of zero is shown as Not installed in preview and PDF.' },
  { id: 'reports', title: 'Preview, filter, and download reports', category: 'Reports', content: 'Open Reports, select the required report, apply available date, status, client, or developer filters, then choose Preview or Download. Report calculations and pagination are identical in preview and downloaded PDF.' },
  { id: 'branding', title: 'RIANA and MAREZI document branding', category: 'Reports', content: 'RIANA reports use the standard transparent-mark header, watermark, and aligned footer. If either the client or generating user belongs to MAREZI, the approved MAREZI letterhead is applied automatically to previews and downloads.' },
  { id: 'developer-pending', title: 'Track Developers work from Pending', category: 'Developers', content: 'Open Developers and choose Pending. Sales users see approval items, developers see assigned or clarification work, and team leads see approved requests waiting for assignment or follow-up.' },
  { id: 'developer-notifications', title: 'Developers workflow notifications', category: 'Developers', content: 'Approval submissions, task assignments, clarification, and completion can trigger in-app, email, and SMS notifications. When a developer marks work complete, the user who assigned that work is notified.' },
  { id: 'developer-reports', title: 'Filter Developers reports by developer', category: 'Developers', content: 'Open Developers Reports and use the developer-name filter before previewing or downloading. The selected filter is applied consistently to the displayed results and generated document.' },
  { id: 'subsidiaries', title: 'Manage subsidiaries safely', category: 'Administration', content: 'Authorized administrators can add and edit subsidiaries in Company Settings. Deletion is blocked while users remain attached; reassign those users before attempting deletion again.' },
  { id: 'recent-activity', title: 'Open Recent Activity', category: 'Navigation', content: 'Recent Activity remains hidden by default to keep the dashboard focused. Select Recents to reveal the activity panel and its related dashboard information.' },
  { id: 'deletion-refresh', title: 'Lists after deleting a record', category: 'Navigation', content: 'After an authorized deletion succeeds, the affected view updates immediately from fresh server data. A manual browser refresh should not be required.' },
  { id: 'notifications', title: 'Notifications, announcements, email, and SMS', category: 'Notifications', content: 'The notification bell contains workflow alerts assigned to your account. Depending on the event and configured contact channels, the same event may also be delivered by email or SMS.' },
  { id: 'security', title: 'Sessions, passwords, and safe support', category: 'Security', content: 'Never share passwords, verification codes, tokens, or confidential client information. Password or privilege changes invalidate older sessions. The assistant provides user guidance but does not reveal source code, credentials, database details, private endpoints, or infrastructure.' },
  { id: 'install-app', title: 'Install RIANA CIMS as an app', category: 'Getting Started', content: 'Open Install App from the resource section. On supported browsers, use the install prompt or browser menu to add RIANA CIMS to your desktop or home screen.' },
];

const RECOMMENDATIONS: Record<string, string[]> = {
  SuperAdmin: ['roles', 'subsidiaries', 'branding', 'security'],
  Admin: ['clients', 'installations', 'notifications', 'reports'],
  Management: ['management', 'reports', 'recent-activity', 'branding'],
  Finance: ['finance', 'clients', 'installations', 'reports'],
  Sales: ['clients', 'developer-pending', 'developer-notifications', 'reports'],
  Developer: ['developer-pending', 'developer-notifications', 'developer-reports', 'security'],
  Teamlead: ['developer-pending', 'installations', 'developer-reports', 'notifications'],
  User: ['installations', 'handover', 'reports', 'notifications'],
};

const MANUAL_SECTIONS = [
  ['Navigation', 'Use the sidebar for modules, the top header for notifications, messages, theme, and profile controls, and Help & Support for verified guidance.'],
  ['Clients and installations', 'Client records contain business contacts and subsidiary ownership. Installation records contain equipment, assignment, scheduling, progress, and handover information.'],
  ['Developers workflow', 'Requests move through submission, approval, assignment, commencement, clarification where required, and completion. Pending shows actions expected from the signed-in user.'],
  ['Reports and documents', 'Preview a report before download when available. RIANA or MAREZI branding is resolved automatically and report content remains role-protected.'],
  ['Security and support', 'Use only approved work accounts and support channels. Do not share credentials or request internal implementation details from the assistant.'],
];

const CATEGORIES = ['All', ...Array.from(new Set(HELP_ARTICLES.map((article) => article.category)))];

export const HelpModule = ({ user }: HelpModuleProps) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expandedArticle, setExpandedArticle] = useState<string>('');
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isRequirementsOpen, setIsRequirementsOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isSendingGuide, setIsSendingGuide] = useState(false);
  const { toast } = useToast();

  const recommendations = useMemo(() => {
    const ids = RECOMMENDATIONS[user.role] || RECOMMENDATIONS.User;
    const byId = new Map(HELP_ARTICLES.map((article) => [article.id, article]));
    return ids.map((id) => byId.get(id)).filter((article): article is HelpArticle => Boolean(article));
  }, [user.role]);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return HELP_ARTICLES.filter((article) => {
      const inCategory = category === 'All' || article.category === category;
      const matchesQuery = !normalizedQuery || `${article.title} ${article.content} ${article.category}`.toLowerCase().includes(normalizedQuery);
      return inCategory && matchesQuery;
    });
  }, [category, query]);

  const openArticle = (article: HelpArticle) => {
    setCategory('All');
    setQuery('');
    setExpandedArticle(article.id);
    window.setTimeout(() => document.getElementById(`help-article-${article.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const emailSupportGuide = async () => {
    if (isSendingGuide) return;
    setIsSendingGuide(true);
    try {
      const response = await apiClient.post('/help/send-documentation', {
        email: user.email,
        user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      });
      toast({ title: 'Support guide sent', description: response.message || `Check ${user.email}.` });
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : 'The guide could not be delivered. Please try again later.';
      toast({ title: 'Delivery failed', description, variant: 'destructive' });
    } finally {
      setIsSendingGuide(false);
    }
  };

  const scrollToAssistant = () => document.getElementById('riana-assistant-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const openUserChat = () => window.dispatchEvent(new CustomEvent('open-chat'));

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Find answers, learn workflows, or contact the right support channel.</p>
      </header>

      <section className="space-y-4" aria-label="Help search and actions">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help articles and workflows"
            className="h-[52px] border-primary/50 bg-card pl-12 text-base shadow-sm focus-visible:ring-primary"
            aria-label="Search help articles and workflows"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Button variant="outline" className="h-12 border-primary/40 text-primary" onClick={scrollToAssistant}>
            <Bot className="mr-2 h-4 w-4" /> Ask RIANA Assistant
          </Button>
          <Button variant="outline" className="h-12 border-primary/40 text-primary" onClick={emailSupportGuide} disabled={isSendingGuide}>
            {isSendingGuide ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Email Support Guide
          </Button>
          <Button variant="outline" className="h-12 border-primary/40 text-primary" onClick={() => { window.location.href = 'mailto:support@riana.co?subject=RIANA CIMS Support Request'; }}>
            <Headphones className="mr-2 h-4 w-4" /> Contact Support
          </Button>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="recommended-title">
            <div className="border-b px-5 py-4">
              <h2 id="recommended-title" className="text-lg font-semibold">Recommended for your role</h2>
              <p className="text-sm text-muted-foreground">Guidance selected for {formatRoleLabel(user.role)}</p>
            </div>
            <div className="divide-y px-5">
              {recommendations.map((article) => (
                <button key={article.id} type="button" onClick={() => openArticle(article)} className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1 text-sm font-medium">{article.title}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="knowledge-title">
            <div className="border-b px-5 py-4">
              <h2 id="knowledge-title" className="text-lg font-semibold">Knowledge base</h2>
              <p className="text-sm text-muted-foreground">Verified guidance for current CIMS workflows</p>
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Help article categories">
                {CATEGORIES.map((item) => (
                  <Button key={item} type="button" size="sm" variant={category === item ? 'default' : 'ghost'} onClick={() => setCategory(item)}>
                    {item}
                  </Button>
                ))}
              </div>
            </div>
            <div className="px-5 py-2">
              {filteredArticles.length ? (
                <Accordion type="single" collapsible value={expandedArticle} onValueChange={setExpandedArticle}>
                  {filteredArticles.map((article) => (
                    <AccordionItem key={article.id} id={`help-article-${article.id}`} value={article.id}>
                      <AccordionTrigger className="text-left hover:no-underline">
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{article.title}</span>
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">{article.category}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="max-w-3xl text-sm leading-6 text-muted-foreground">{article.content}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="py-12 text-center">
                  <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="mt-3 font-medium">No matching guidance</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try another term or clear the selected category.</p>
                  <Button type="button" variant="link" onClick={() => { setQuery(''); setCategory('All'); }}>Clear filters</Button>
                </div>
              )}
            </div>
          </section>
        </div>

        <div id="riana-assistant-panel" className="scroll-mt-24">
          <HelpAssistantPanel user={user} />
        </div>
      </div>

      <section className="grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1.25fr_0.75fr]" aria-label="Support channels and resources">
        <div className="border-b p-5 lg:border-b-0 lg:border-r">
          <h2 className="text-lg font-semibold">Support channels</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <button type="button" onClick={() => { window.location.href = 'mailto:support@riana.co?subject=RIANA CIMS Support Request'; }} className="group rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Headphones className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">RIANA Support</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Report an issue or request guided assistance.</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Email support <ChevronRight className="ml-1 h-3 w-3" /></span>
            </button>
            <button type="button" onClick={() => { window.location.href = 'mailto:admin@riana.co?subject=Internal RIANA CIMS Help Request'; }} className="group rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <UserCog className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">System Administrator</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Request account, role, or access assistance.</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Contact admin <ChevronRight className="ml-1 h-3 w-3" /></span>
            </button>
            <button type="button" onClick={openUserChat} className="group rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <MessageCircle className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">Live User Chat</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Chat with colleagues through CIMS messaging.</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Open chat <ChevronRight className="ml-1 h-3 w-3" /></span>
            </button>
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-lg font-semibold">Resources</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setIsManualOpen(true)}><BookOpen className="h-6 w-6 text-primary" />User Manual</Button>
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setIsRequirementsOpen(true)}><Monitor className="h-6 w-6 text-primary" />System Requirements</Button>
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => window.open('/install', '_blank', 'noopener,noreferrer')}><Download className="h-6 w-6 text-primary" />Install App</Button>
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setIsSecurityOpen(true)}><ShieldCheck className="h-6 w-6 text-primary" />Security &amp; Privacy</Button>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><Info className="h-4 w-4" /> RIANA CIMS <span aria-hidden="true">•</span> Version 5</div>
        <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Signed in as {formatRoleLabel(user.role)}</div>
      </footer>

      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>User Manual</DialogTitle><DialogDescription>Core workflows for RIANA CIMS Version 5.</DialogDescription></DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <Accordion type="single" collapsible>
              {MANUAL_SECTIONS.map(([title, content]) => (
                <AccordionItem key={title} value={title}><AccordionTrigger>{title}</AccordionTrigger><AccordionContent className="leading-6 text-muted-foreground">{content}</AccordionContent></AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isRequirementsOpen} onOpenChange={setIsRequirementsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>System Requirements</DialogTitle><DialogDescription>Recommended environment for reliable CIMS operation.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4"><Monitor className="h-5 w-5 text-primary" /><h3 className="mt-2 font-semibold">Desktop</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Current Chrome, Edge, Firefox, or Safari; 1366×768 minimum display; stable 5 Mbps connection; 4 GB RAM minimum.</p></div>
            <div className="rounded-lg border p-4"><Smartphone className="h-5 w-5 text-primary" /><h3 className="mt-2 font-semibold">Mobile</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Android 10+ with Chrome or iOS 14+ with Safari. Install as a PWA for convenient home-screen access.</p></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSecurityOpen} onOpenChange={setIsSecurityOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Security &amp; Privacy</DialogTitle><DialogDescription>Safe use of RIANA CIMS and its support tools.</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p className="flex gap-3"><LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-primary" /> Never share passwords, verification codes, access tokens, or confidential client information through chat or email.</p>
            <p className="flex gap-3"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" /> Access is controlled by role and individual privileges. Contact an administrator if required work is unavailable.</p>
            <p className="flex gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> The RIANA Assistant answers user-facing workflow questions and refuses source code, credentials, infrastructure, database, and private endpoint requests.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
