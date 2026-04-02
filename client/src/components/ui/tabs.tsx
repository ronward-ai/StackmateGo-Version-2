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
      "inline-flex w-full h-10 sm:h-auto items-center justify-start sm:justify-center rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto scrollbar-hide",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: "timer" | "players" | "tables" | "settings" | "league" | "buy-ins" | "default"
  }
>(({ className, variant = "default", ...props }, ref) => {
  const getVariantClass = (variant: string) => {
    switch (variant) {
      case "timer":
        return "tabs-trigger-timer"
      case "players":
        return "tabs-trigger-players"
      case "tables":
        return "tabs-trigger-tables"
      case "settings":
        return "tabs-trigger-settings"
      case "league":
        return "tabs-trigger-league"
      case "buy-ins":
        return "tabs-trigger-buy-ins"
      default:
        return ""
    }
  }

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 sm:px-4 py-2 sm:py-1.5 text-xs sm:text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-shrink-0 min-w-fit border-r border-muted-foreground/20 last:border-r-0 border border-transparent",
        getVariantClass(variant),
        className
      )}
      {...props}
    />
  )
})
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
