import { useState } from "react";
import { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Building2, Package, Users, Upload, FileText, BarChart3, HelpCircle, Home, History, TrendingUp, DollarSign, CalendarDays, Wrench, Megaphone, UserCircle, ChevronRight, Globe, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDatabase } from "@/hooks/useDatabase";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { getCompanyBrandingEventDetail, resolveCompanyLogoUrl } from "@/utils/logoUrl";

interface SidebarProps {
  user: User;
  activeModule: string;
  setActiveModule: (module: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar = ({ user, activeModule, setActiveModule, isMobileOpen, onMobileClose }: SidebarProps) => {
  const currentYear = new Date().getFullYear();
  const { toast } = useToast();
  const { getCompanySettings } = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoPath, setLogoPath] = useState("/Riana_logo.png");
  const developerModuleRole = user.module_roles?.crms;
  const canAccessDevelopers = Boolean(developerModuleRole && ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales'].includes(developerModuleRole));

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
    { key: 'dashboard', label: 'Dashboard', icon: Home, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales', 'User'], category: 'main' },
    { key: 'technician-dashboard', label: 'My Tasks', icon: Wrench, roles: ['User'], mobileOnly: true, category: 'main' },
    { key: 'technician-profile', label: 'My Profile', icon: UserCircle, roles: ['User'], category: 'main' },
    { key: 'clients', label: 'Clients', icon: Building2, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'User'], category: 'management' },
    { key: 'assignments', label: 'Assign', icon: Users, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'management' },
    { key: 'calendar', label: 'Workload Calendar', icon: CalendarDays, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'management' },
    { key: 'installations', label: 'Installations', icon: Package, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'User'], category: 'operations' },
    { key: 'progress', label: 'Installation Progress', icon: TrendingUp, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'operations' },
    { key: 'users', label: 'Users', icon: Users, roles: ['SuperAdmin', 'Admin'], category: 'admin' },
    { key: 'finances', label: 'Finances', icon: DollarSign, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'admin' },
    { key: 'announcements-management', label: 'Announcements', icon: Megaphone, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'admin' },
    { key: 'company', label: 'Company Settings', icon: History, roles: ['SuperAdmin'], category: 'admin' },
    { key: 'import', label: 'Import Data', icon: Upload, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'data' },
    { key: 'reports', label: 'Reports', icon: FileText, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'data' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['SuperAdmin', 'Admin', 'Teamlead'], category: 'data' },
    { key: 'optimus', label: 'RIANA OPTIMUS', icon: Globe, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'User'], category: 'external' },
    { key: 'developers', label: 'Developers', icon: Code2, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales'], category: 'developers' },
    { key: 'help', label: 'Help & Support', icon: HelpCircle, roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales', 'User'], category: 'support' },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user.role) || (item.key === 'developers' && canAccessDevelopers)
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
    { label: 'Overview', path: '/developers', roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales'] },
    { label: 'Requests', path: '/developers/requests', roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales'] },
    { label: 'New Request', path: '/developers/requests/new', roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Sales'] },
    { label: 'Approvals', path: '/developers/approvals', roles: ['SuperAdmin', 'Admin', 'Sales'] },
    { label: 'Assignments', path: '/developers/assignments', roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Developer'] },
    { label: 'Reports', path: '/developers/reports', roles: ['SuperAdmin', 'Admin', 'Teamlead', 'Sales'] },
    { label: 'Audit', path: '/developers/audit', roles: ['SuperAdmin', 'Admin', 'Teamlead'] },
  ].filter((item) => item.roles.includes(developerModuleRole || user.role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-4 py-4">
          {categories.map(category => {
            const items = getItemsByCategory(category.key);
            if (items.length === 0) return null;
            
            return (
              <div key={category.key} className="space-y-1">
                <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {category.label}
                </h3>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const isActive = activeModule === item.key;
                    return (
                      <div key={item.key}>
                      <Button 
                        variant="ghost"
                        className={cn(
                          "w-full justify-start text-left h-10 px-3 transition-all duration-200 group relative",
                          isActive 
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md" 
                            : "hover:bg-accent hover:text-accent-foreground"
                        )}
                        onClick={() => handleModuleClick(item.key)}
                      >
                        <div className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full transition-all duration-200",
                          isActive ? "bg-primary-foreground" : "bg-transparent group-hover:bg-primary/30"
                        )} />
                        <item.icon className={cn(
                          "h-4 w-4 mr-3 shrink-0 transition-transform duration-200",
                          isActive ? "" : "group-hover:scale-110"
                        )} />
                        <span className="truncate font-medium">{item.label}</span>
                        <ChevronRight className={cn(
                          "ml-auto h-4 w-4 opacity-0 -translate-x-2 transition-all duration-200",
                          isActive ? "opacity-100 translate-x-0" : "group-hover:opacity-50 group-hover:translate-x-0"
                        )} />
                      </Button>
                      {item.key === 'developers' && isActive && (
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
      <div className="p-3 border-t border-border">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <UserCircle className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email}
              </p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer with auto-updating year */}
      <div className="py-3 px-4 border-t border-border shrink-0">
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
          <p className="text-[10px] text-muted-foreground whitespace-nowrap">
            © {currentYear} RIANA Group
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-card border-r border-border min-h-[calc(100vh-4rem)] flex-col shrink-0 shadow-sm">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={isMobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
};
