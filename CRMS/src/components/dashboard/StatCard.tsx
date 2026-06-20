import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  subtitle?: string;
  className?: string;
}

const variantStyles = {
  default: {
    icon: 'bg-muted text-muted-foreground',
    accent: 'bg-primary/5',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    accent: 'bg-primary/5',
  },
  success: {
    icon: 'bg-status-completed-bg text-status-completed',
    accent: 'bg-status-completed/5',
  },
  warning: {
    icon: 'bg-status-pending-bg text-status-pending',
    accent: 'bg-status-pending/5',
  },
  danger: {
    icon: 'bg-status-rejected-bg text-status-rejected',
    accent: 'bg-status-rejected/5',
  },
};

export function StatCard({ title, value, icon: Icon, variant = 'default', trend, subtitle, className }: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card className={cn(
      'relative overflow-hidden transition-all duration-300 hover:shadow-medium group',
      'border border-border/50',
      className
    )}>
      <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity', styles.accent)} />
      
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {title}
            </p>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <span className={cn(
                  'text-xs font-semibold',
                  trend.isPositive ? 'text-status-completed' : 'text-destructive'
                )}>
                  {trend.isPositive ? '+' : ''}{trend.value}
                </span>
                <span className="text-xs text-muted-foreground">
                  {trend.label || 'from last month'}
                </span>
              </div>
            )}
          </div>
          
          <div className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
            styles.icon
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </Card>
  );
}
