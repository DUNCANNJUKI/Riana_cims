import { useState } from "react";
import { User } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Building2, Package, Users, Upload, FileText, BarChart3, HelpCircle, Home, History, TrendingUp, DollarSign, CalendarDays, Wrench, Megaphone, ChevronRight, Globe, Code2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDatabase } from "@/hooks/useDatabase";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { getCompanyBrandingEventDetail, resolveCompanyLogoUrl } from "@/utils/logoUrl";
import { can, type Capability } from "@/security/accessControl";
import { formatRoleLabel } from "@/utils/roleLabel";
import { resolveAvatarUrl } from "@/utils/avatar";

interface SidebarProps {
  user: User;
  activeModule: string;
  setActiveModule: (module: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  tourMode?: boolean;
}

export const Sidebar = ({ user, activeModule, setActiveModule, isMobileOpen, onMobileClose, tourMode = false }: SidebarProps) => {
  const currentYear = new Date().getFullYear();
  const { toast } = useToast();
  const { getCompanySettings } = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoPath, setLogoPath] = useState("/Riana_logo.png");
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('riana-sidebar-collapsed') === 'true');
  const avatarSrc = resolveAvatarUrl(user.avatar_url);
  const developerModuleRole = user.module_roles?.crms;
  const effectiveDeveloperRole = user.role === 'SuperAdmin' ? 'SuperAdmin' : developerModuleRole || user.role;
  const canAccessDevelopers = ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'].includes(effectiveDeveloperRole);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getCompanySettings();
        if (settings?.logo_path) {
          setLogoPath(resolveCompanyLogoUrl(settings.logo_path, settings.updated_at || settings.id));
        }
      } catch (error) {
        console.error("Error loading logo settings:", error);
      }
    };
    loadSettings();

    const handleBrandingUpdate = (event: Event) => {
      const { logoPath, version } = getCompanyBrandingEventDetail(event);
      setLogoPath(resolveCompanyLogoUrl(logoPath, version));
    };

    window.addEventListener('riana-company-branding-updated', handleBrandingUpdate);
    return () => window.removeEventListener('riana-company-branding-updated', handleBrandingUpdate);
  }, []);
  
  const menuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: Home, roles: ['SuperAdmin', 'Admin', 'Management', 'Finance', 'Teamlead', 'Developer', 'Sales', 'User'], category: 'main' },
    { key: 'technician-dashboard', label: 'My Tasks', icon: Wrench, roles: ['User'], mobileOnly: true, category: 'main' },
    { key: 'clients', label: 'Clients', icon: Building2, roles: [], capability: 'clients.view' as Capability, category: 'management' },
    { key: 'assignments', label: 'Assigned Technicians', icon: Users, roles: [], capability: 'assignments.view' as Capability, category: 'management' },
    { key: 'calendar', label: 'Workload Calendar', icon: CalendarDays, roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'User'], category: 'management' },
    { key: 'installations', label: 'Installations', icon: Package, roles: [], capability: 'installations.view' as Capability, category: 'operations' },
    { key: 'inventory', label: 'Hardware & Inventory', icon: Package, roles: [], capability: 'inventory.view' as Capability, category: 'operations' },
    { key: 'progress', label: 'Installation Progress', icon: TrendingUp, roles: [], capability: 'progress.view' as Capability, category: 'operations' },
    { key: 'users', label: 'Users', icon: Users, roles: [], capability: 'users.manage' as Capability, category: 'admin' },
    { key: 'finances', label: 'Finances', icon: DollarSign, roles: [], capability: 'finances.view' as Capability, category: 'admin' },
    { key: 'announcements-management', label: 'Announcements', icon: Megaphone, roles: [], capability: 'announcements.manage' as Capability, category: 'admin' },
    { key: 'company', label: 'Company Settings', icon: History, roles: [], capability: 'company.manage' as Capability, category: 'admin' },
    { key: 'import', label: 'Import Data', icon: Upload, roles: [], capability: 'import.manage' as Capability, category: 'data' },
    { key: 'reports', label: 'Reports', icon: FileText, roles: [], capability: 'reports.view' as Capability, category: 'data' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, roles: [], capability: 'analytics.view' as Capability, category: 'data' },
    { key: 'audit-logs', label: 'Audit Logs', icon: History, roles: ['SuperAdmin'], category: 'admin' },
    { key: 'my-activity', label: 'My Activity', icon: History, roles: ['SuperAdmin', 'Admin', 'Management', 'Finance', 'Teamlead', 'Developer', 'Sales', 'User'], category: 'support' },
    { key: 'optimus', label: 'RIANA OPTIMUS', icon: Globe, roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'User'], category: 'external' },
    { key: 'developers', label: 'Developers', icon: Code2, roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'], category: 'developers' },
    { key: 'help', label: 'Help & Support', icon: HelpCircle, roles: ['SuperAdmin', 'Admin', 'Management', 'Finance', 'Teamlead', 'Developer', 'Sales', 'User'], category: 'support' },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user.role)
      || ('capability' in item && item.capability && can(user, item.capability))
      || (item.key === 'developers' && canAccessDevelopers)
  );

  const handleModuleClick = (key: string) => {
    if (key === 'developers' && user.role === 'Developer') {
      toast({
        title: "You're now a Developer!!",
        description: "Your Developers workspace is ready.",
        duration: 3000,
      });
    }

    if (key === 'optimus') {
      toast({
        title: "External Redirection",
        description: "You are being redirected to the external RIANA OPTIMUS system...",
        duration: 3000,
      });
      
      setTimeout(() => {
        window.open('https://optimus.rianadevelopment.com/auth/login', '_blank');
      }, 1500);
      return;
    }
    
    if (key === 'developers') navigate('/developers');
    else if (location.pathname.startsWith('/developers')) navigate('/');
    setActiveModule(key);
    onMobileClose?.();
  };

  const categories = [
    { key: 'main', label: 'Overview' },
    { key: 'management', label: 'Management' },
    { key: 'operations', label: 'Operations' },
    { key: 'admin', label: 'Administration' },
    { key: 'data', label: 'Data & Reports' },
    { key: 'developers', label: 'Developers' },
    { key: 'external', label: 'External Systems' },
    { key: 'support', label: 'Support' },
  ];

  const getItemsByCategory = (category: string) => {
    return filteredMenuItems.filter(item => item.category === category);
  };

  const developerSubItems = [
    { label: 'Overview', path: '/developers', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'] },
    { label: 'Pending', path: '/developers/pending', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'] },
    { label: 'Requests', path: '/developers/requests', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'] },
    { label: 'New Request', path: '/developers/requests/new', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Sales'] },
    { label: 'Approvals', path: '/developers/approvals', roles: ['SuperAdmin', 'Admin', 'Management', 'Sales'] },
    { label: 'Assignments', path: '/developers/assignments', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer'] },
    { label: 'Reports', path: '/developers/reports', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Sales'] },
    { label: 'Audit', path: '/developers/audit', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead'] },
  ].filter((item) => item.roles.includes(effectiveDeveloperRole));

  const toggleCollapsed = () => setIsCollapsed(current => {
    const next = !current;
    localStorage.setItem('riana-sidebar-collapsed', String(next));
    return next;
  });

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex h-full min-h-0 flex-col">
      {collapsed !== undefined && <div className={cn("hidden border-b border-border p-2 lg:flex", collapsed ? "justify-center" : "justify-end")}>
        <Button type="button" variant="ghost" size="icon" onClick={toggleCollapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>}
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-5 py-4">
          {categories.map(category => {
            const items = getItemsByCategory(category.key);
            if (items.length === 0) return null;
            
            return (
              <div key={category.key} className="flex flex-col gap-1">
                <h3 className={cn("px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground", collapsed && "sr-only")}>
                  {category.label}
                </h3>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const isActive = activeModule === item.key;
                    return (
                      <div key={item.key}>
                      <Button 
                        data-tour-nav={item.key}
                        variant="ghost"
                        className={cn(
                          "group relative h-10 w-full px-3 text-left font-medium transition-colors duration-150",
                          collapsed ? "justify-center" : "justify-start",
                          isActive 
                            ? "bg-primary/12 text-primary shadow-none hover:bg-primary/16 hover:text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                        onClick={() => handleModuleClick(item.key)}
                        title={collapsed ? item.label : undefined}
                      >
                        <div className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full transition-all duration-200",
                          isActive ? "bg-primary" : "bg-transparent group-hover:bg-primary/30"
                        )} />
                        <item.icon className={cn("shrink-0", !collapsed && "mr-3")} />
                        <span className={cn("truncate font-medium", collapsed && "sr-only")}>{item.label}</span>
                        <ChevronRight className={cn(
                          "ml-auto h-4 w-4 opacity-0 -translate-x-2 transition-all duration-200",
                          collapsed && "hidden",
                          isActive ? "opacity-100 translate-x-0" : "group-hover:opacity-50 group-hover:translate-x-0"
                        )} />
                      </Button>
                      {item.key === 'developers' && isActive && !collapsed && (
                        <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-2">
                          {developerSubItems.map((subItem) => (
                            <Button
                              key={subItem.path}
                              type="button"
                              variant="ghost"
                              className={cn(
                                "h-8 w-full justify-start px-2 text-xs",
                                location.pathname === subItem.path && "bg-primary/10 text-primary",
                              )}
                              onClick={() => {
                                navigate(subItem.path);
                                onMobileClose?.();
                              }}
                            >
                              {subItem.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* User Info Card */}
      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
        <div className={cn("rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10", collapsed ? "p-2" : "space-y-2 p-3")}>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border border-primary/20">
              <AvatarImage src={avatarSrc} alt={user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email} />
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                {user.first_name && user.last_name ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : user.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
              <p className="text-sm font-medium text-foreground truncate">
                {user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email}
              </p>
              <p className="text-xs text-muted-foreground">{formatRoleLabel(user.role)}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer with auto-updating year */}
      <div className={cn("shrink-0 border-t border-border", collapsed ? "px-2 py-3" : "px-4 py-3")}>
        <div className="flex items-center justify-start gap-2 overflow-hidden h-10 px-2">
          <div className="shrink-0 w-16 h-8 flex items-center justify-center overflow-hidden">
            <img 
              src={logoPath} 
              alt="RIANA" 
              className="h-full w-auto object-contain"
              onError={(e) => {
                if (e.currentTarget.src.includes(logoPath) && logoPath !== "/Riana_logo.png") {
                  setLogoPath("/Riana_logo.png");
                }
              }}
            />
          </div>
          <p className={cn("whitespace-nowrap text-[10px] text-muted-foreground", collapsed && "sr-only")}>
            © {currentYear} RIANA Group
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn("hidden min-h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex", isCollapsed ? "w-20" : "w-64")}>
        <SidebarContent collapsed={isCollapsed} />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet modal={!tourMode} open={isMobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="w-[min(86vw,320px)] p-0" onInteractOutside={(event) => { if (tourMode) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (tourMode) event.preventDefault(); }} onOpenAutoFocus={(event) => { if (tourMode) event.preventDefault(); }}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
};




