import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A labelled toggle row.
 *
 * Extracted from SettingsSection so a feature's own settings can live with the
 * feature. Blind-level options were two tabs away from the Levels tab that
 * consumes them, which meant configuring levels took two places.
 */
export function SettingRow({
  id, label, hint, checked, onCheckedChange, children
}: {
  id: string; label: string; hint?: string;
  checked?: boolean; onCheckedChange?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/20 last:border-0">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {children}
        {onCheckedChange !== undefined && (
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(c) => onCheckedChange(!!c)}
            className="checkbox-nav-style h-5 w-5"
          />
        )}
      </div>
    </div>
  );
}

/** A titled card grouping related SettingRows. */
export function SettingsGroup({ icon: Icon, title, color, children }: {
  icon: any; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <Card className="card-glass rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-4 w-4", color)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        </div>
        <div className="divide-y divide-border/20">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
