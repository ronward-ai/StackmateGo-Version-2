import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // A grid on phones so exactly four fit per row — flex-basis loses to
      // flex-1 and to the labels' own width, which put a tab half off-screen.
      // A wrapping flex row from sm up, where all seven fit on one line.
      "grid grid-cols-4 w-full sm:flex sm:flex-wrap sm:items-stretch sm:justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

/**
 * A tab.
 *
 * The `variant` prop is gone. It offered six values that all resolved to the
 * SAME orange active state, differing only in a 5%-opacity hover tint — which no
 * touch device ever shows, so on a phone the whole system was a no-op. Six named
 * variants, one visible outcome.
 *
 * Icon above label, and the list wraps rather than scrolling: seven tabs at
 * 80px minimum came to ~600px against a 375px screen, so League, Settings and
 * Share — where Go Live lives — sat off the right-hand edge behind a gesture
 * most people never tried.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "tabs-trigger flex min-w-0 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2",
      "px-2 sm:px-4 py-2 sm:py-1.5 rounded-sm text-caption sm:text-sm font-medium",
      "ring-offset-background transition-all duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "border-b-2 border-transparent",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
