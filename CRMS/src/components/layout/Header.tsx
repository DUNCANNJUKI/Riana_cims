import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Search, User, LogOut, Moon, Sun } from 'lucide-react';
import { useToast } from '@crms/hooks/use-toast';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@crms/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@crms/components/ui/avatar';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';

export function Header() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const userRole = useCurrentUserRole();

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, string> = {
      admin: 'Admin',
      senior_developer: 'Senior Developer',
      developer: 'Developer',
      sales: 'Sales Team',
    };
    return roleMap[role] || role;
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/95 backdrop-blur-sm px-6 shadow-sm">
      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requests, clients..."
            className="w-[300px] pl-9 bg-muted/50 border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="hover:bg-primary/10"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5 text-muted-foreground transition-transform" />
            ) : (
              <Moon className="h-5 w-5 text-muted-foreground transition-transform" />
            )}
          </Button>
        )}

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 px-2 hover:bg-primary/10">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {userRole.userName ? getInitials(userRole.userName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">{userRole.userName || 'Loading...'}</span>
                <span className="text-xs text-muted-foreground">
                  {userRole.roles.length > 0 ? getRoleBadge(userRole.roles[0]) : 'User'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border shadow-lg">
            <DropdownMenuLabel className="text-foreground">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-primary/10 hover:text-primary cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              onClick={() => {
                localStorage.removeItem('riana-auth-token');
                localStorage.removeItem('riana_user');
                toast({ title: 'Logged out', description: 'You have been signed out.' });
                window.location.assign('/');
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
