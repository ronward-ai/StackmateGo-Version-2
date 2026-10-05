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

  // Desktop Chrome opens its calendar only from a small icon inside the box,
  // and that icon was drawn dark on this dark-only app — invisible, so a
  // director on a Windows laptop saw no calendar at all (an iPad opens it on
  // any tap, which is why it only showed there). `color-scheme: dark` makes the
  // icon and the popup match the app; `showPicker()` opens it from a click
  // anywhere in the box. Where it is missing or refused, typing still works.
  const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Not allowed here (e.g. no user activation): the box still takes typing.
    }
  };

  return (
    <div className={cn("flex gap-2 items-center mt-1", className)}>
      <input
        type="date"
        value={toInputValue(value?.from)}
        onChange={handleFrom}
        onClick={openPicker}
        style={{ colorScheme: 'dark' }}
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="date"
        value={toInputValue(value?.to)}
        min={toInputValue(value?.from)}
        onChange={handleTo}
        onClick={openPicker}
        style={{ colorScheme: 'dark' }}
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
