import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@crms/lib/utils';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  History,
  Building2,
  ShieldCheck,
  Briefcase,
  Bell,
} from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@crms/components/ui/tooltip';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';
import { fetchCompanyBranding, resolveCompanyLogoUrl } from '@crms/lib/companyBranding';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  section?: string;
  roles?: ('admin' | 'senior_developer' | 'developer' | 'sales')[];
}

const allNavItems: NavItem[] = [
  // Main - visible to all
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, section: 'main' },
  { label: 'All Requests', href: '/developers/requests', icon: FileText, section: 'main' },
  { label: 'Notifications', href: '/developers/notifications', icon: Bell, section: 'main' },

  // Workflow - role based
  { label: 'New Request', href: '/developers/requests/new', icon: PlusCircle, section: 'workflow', roles: ['admin', 'senior_developer'] },
  { label: 'Approvals', href: '/developers/approvals', icon: ClipboardCheck, section: 'workflow', roles: ['admin', 'sales'] },
  { label: 'My Assignments', href: '/developers/assignments', icon: FolderKanban, section: 'workflow', roles: ['developer'] },

  // Analytics - limited access
  { label: 'Reports', href: '/developers/reports', icon: BarChart3, section: 'analytics', roles: ['admin', 'senior_developer', 'sales'] },
  { label: 'Audit Trail', href: '/developers/audit', icon: History, section: 'analytics', roles: ['admin', 'senior_developer'] },

  // Admin - restricted. User and role management lives in the main CIMS Users module.
  { label: 'Settings', href: '/developers/settings', icon: Settings, section: 'admin', roles: ['admin', 'senior_developer'] },
];

const sectionLabels: Record<string, { label: string; icon: React.ElementType }> = {
  main: { label: 'Overview', icon: LayoutDashboard },
  workflow: { label: 'Workflow', icon: Briefcase },
  analytics: { label: 'Analytics', icon: BarChart3 },
  admin: { label: 'Administration', icon: ShieldCheck },
};

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState(resolveCompanyLogoUrl());
  const location = useLocation();
  const userRole = useCurrentUserRole();

  useEffect(() => {
    let cancelled = false;
    fetchCompanyBranding()
      .then((branding) => {
        if (!cancelled && branding?.logo_path) {
          setLogoUrl(resolveCompanyLogoUrl(branding.logo_path, branding.updated_at || branding.id));
        }
      })
      .catch(() => undefined);

    const handleBrandingUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ logoPath?: string | null; version?: number }>).detail;
      setLogoUrl(resolveCompanyLogoUrl(detail?.logoPath, detail?.version || Date.now()));
    };

    window.addEventListener('riana-company-branding-updated', handleBrandingUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('riana-company-branding-updated', handleBrandingUpdate);
    };
  }, []);

  // Filter nav items based on user roles
  const navItems = allNavItems.filter(item => {
    if (!item.roles) return true; // No role restriction
    return item.roles.some(role =>
      (role === 'admin' && userRole.isAdmin) ||
      (role === 'senior_developer' && userRole.isSeniorDeveloper) ||
      (role === 'developer' && userRole.isDeveloper) ||
      (role === 'sales' && userRole.isSales)
    );
  });

  // Group items by section
  const groupedItems = navItems.reduce((acc, item) => {
    const section = item.section || 'main';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.href ||
      (item.href !== '/' && location.pathname.startsWith(item.href));

    const NavButton = (
      <Link
        key={item.href}
        to={item.href}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative mx-1',
          isActive
            ? 'bg-gradient-to-r from-sidebar-primary/20 to-sidebar-primary/10 text-sidebar-primary shadow-sm'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-gradient-to-b from-sidebar-primary to-sidebar-primary/60 rounded-r-full shadow-lg shadow-sidebar-primary/30" />
        )}
        <item.icon className={cn(
          'h-[18px] w-[18px] shrink-0 transition-all duration-200',
          isActive
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground group-hover:scale-110'
        )} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href} delayDuration={0}>
          <TooltipTrigger asChild>{NavButton}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2 font-medium">
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return NavButton;
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-gradient-to-b from-sidebar to-sidebar/95 border-r border-sidebar-border/50 transition-all duration-300 flex flex-col shadow-xl',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border/30 bg-sidebar/50 backdrop-blur-sm">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl overflow-hidden ring-2 ring-sidebar-primary/30 shadow-lg">
              <img src={logoUrl} alt="Riana Group" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">CRMS</h1>
              <p className="text-[10px] text-sidebar-primary font-medium">Change Request System</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto relative h-10 w-10 rounded-xl overflow-hidden ring-2 ring-sidebar-primary/30 shadow-lg">
            <img src={logoUrl} alt="Riana Group" className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 space-y-6">
        {Object.entries(groupedItems).map(([section, items]) => {
          const SectionIcon = sectionLabels[section]?.icon;
          return (
            <div key={section}>
              {!collapsed && (
                <div className="flex items-center gap-2 px-4 mb-3">
                  {SectionIcon && (
                    <SectionIcon className="h-3 w-3 text-sidebar-foreground/30" />
                  )}
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
                    {sectionLabels[section]?.label || section}
                  </h3>
                </div>
              )}
              {collapsed && (
                <div className="flex justify-center mb-2">
                  <div className="w-6 h-px bg-sidebar-border/50" />
                </div>
              )}
              <div className="space-y-1">
                {items.map(renderNavItem)}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border/30 bg-sidebar/50">
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-sidebar-accent/30">
            <Building2 className="h-4 w-4 text-sidebar-primary/70" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-sidebar-foreground/70 font-medium block truncate">Riana Group</span>
              <span className="text-[9px] text-sidebar-foreground/40 block">© {new Date().getFullYear()} All rights reserved.</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg',
            !collapsed && 'justify-start'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
