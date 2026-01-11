import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Settings,
  Upload,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import savonLogo from '@/assets/savon-logo.png';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/campaigns', label: 'Campaigns', icon: Megaphone, exact: false },
  { path: '/businesses', label: 'Businesses', icon: Building2, exact: true },
  { path: '/businesses/import', label: 'Import/Export', icon: Upload, exact: true },
  { path: '/jobs', label: 'Jobs', icon: Briefcase, exact: false },
  { path: '/settings/pricing', label: 'Pricing', icon: DollarSign, exact: true },
  { path: '/settings', label: 'Settings', icon: Settings, exact: false },
];

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { theme } = useTheme();

  const isActive = (path: string, exact: boolean) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  // In dark mode, invert the black logo to white. In light mode, keep it black.
  const logoClass = theme === 'dark' ? 'invert' : '';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <img src={savonLogo} alt="Savon" className={cn("h-8 w-8", logoClass)} />
              <span className="font-semibold text-sidebar-foreground">Savon</span>
            </div>
          ) : (
            <img src={savonLogo} alt="Savon" className={cn("h-7 w-7", logoClass)} />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map(({ path, label, icon: Icon, exact }) => {
            const active = isActive(path, exact);
            
            return (
              <NavLink
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-glow-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-sidebar-border p-4">
            <p className="text-xs text-muted-foreground">
              © 2025 Savon Designs
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
