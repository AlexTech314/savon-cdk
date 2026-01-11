import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DollarSign, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostTooltipProps {
  /** Estimated cost in USD */
  cost: number;
  /** Optional breakdown lines to show in tooltip */
  breakdown?: string[];
  /** Optional label to show before cost */
  label?: string;
  /** Children to wrap with the tooltip */
  children: React.ReactNode;
  /** Additional className for the trigger wrapper */
  className?: string;
  /** Whether to show a small cost indicator badge */
  showBadge?: boolean;
}

/**
 * Format a cost value as USD currency for display
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * CostTooltip - A reusable component that wraps any element and shows
 * cost estimation information on hover.
 * 
 * @example
 * <CostTooltip 
 *   cost={0.073} 
 *   breakdown={['Details: $0.020', 'Reviews: $0.025', 'Copy: $0.028']}
 * >
 *   <Button>Generate</Button>
 * </CostTooltip>
 */
export const CostTooltip: React.FC<CostTooltipProps> = ({
  cost,
  breakdown,
  label = 'Est. cost',
  children,
  className,
  showBadge = false,
}) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1', className)}>
            {children}
            {showBadge && (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                <DollarSign className="h-2.5 w-2.5" />
                {formatCost(cost)}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          align="center"
          className="max-w-xs"
        >
          <div className="space-y-2">
            {/* Header with total cost */}
            <div className="flex items-center gap-2 font-medium">
              <DollarSign className="h-4 w-4 text-primary" />
              <span>{label}: {formatCost(cost)}</span>
            </div>
            
            {/* Breakdown if provided */}
            {breakdown && breakdown.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {breakdown.map((line, i) => (
                    <div key={i} className={cn(line === '' && 'h-1')}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Disclaimer */}
            <div className="flex items-start gap-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Estimate only. See Settings &gt; Pricing for details.</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Inline cost display for use in text or buttons
 */
export const CostBadge: React.FC<{
  cost: number;
  className?: string;
}> = ({ cost, className }) => {
  return (
    <span 
      className={cn(
        'inline-flex items-center gap-0.5 text-xs text-muted-foreground',
        className
      )}
    >
      (~{formatCost(cost)})
    </span>
  );
};

export default CostTooltip;
