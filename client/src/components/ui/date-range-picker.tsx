import * as React from "react";
import { cn } from "@/lib/utils";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangePickerProps {
  value?: DateRange;
  onSelect?: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({ value, onSelect, className }: DateRangePickerProps) {
  const toInputValue = (d: Date | undefined) =>
    d ? d.toISOString().slice(0, 10) : '';

  const handleFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const from = e.target.value ? new Date(e.target.value) : undefined;
    onSelect?.({ from, to: value?.to });
  };

  const handleTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const to = e.target.value ? new Date(e.target.value) : undefined;
    onSelect?.({ from: value?.from, to });
  };

  return (
    <div className={cn("flex gap-2 items-center mt-1", className)}>
      <input
        type="date"
        value={toInputValue(value?.from)}
        onChange={handleFrom}
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="date"
        value={toInputValue(value?.to)}
        min={toInputValue(value?.from)}
        onChange={handleTo}
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
