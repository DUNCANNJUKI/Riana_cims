import { LucideIcon } from 'lucide-react';
import { cn } from '@crms/lib/utils';
import { Card } from '@crms/components/ui/card';

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
      'group relative overflow-hidden bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/20 hover:shadow-md',
      'border border-border',
      className
    )}>
      <div className={cn('pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity', styles.accent)} />
      
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {title}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
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
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            styles.icon
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </Card>
  );
}
