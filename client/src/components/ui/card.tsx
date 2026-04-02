import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'rose' | 'emerald' | 'indigo' | 'slate' | 'glass' | 'glass-blue' | 'glass-purple' | 'glass-green' | 'glass-orange' | 'glass-rose' | 'glass-emerald' | 'glass-indigo' | 'glass-slate'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border text-card-foreground shadow-sm grid-pattern",
      variant === 'default' && "bg-card",
      variant === 'blue' && "card-blue",
      variant === 'purple' && "card-purple", 
      variant === 'green' && "card-green",
      variant === 'orange' && "card-orange",
      variant === 'rose' && "card-rose",
      variant === 'emerald' && "card-emerald",
      variant === 'indigo' && "card-indigo",
      variant === 'slate' && "card-slate",
      variant === 'glass' && "card-glass",
      variant === 'glass-blue' && "card-glass-blue",
      variant === 'glass-purple' && "card-glass-purple",
      variant === 'glass-green' && "card-glass-green",
      variant === 'glass-orange' && "card-glass-orange",
      variant === 'glass-rose' && "card-glass-rose",
      variant === 'glass-emerald' && "card-glass-emerald",
      variant === 'glass-indigo' && "card-glass-indigo",
      variant === 'glass-slate' && "card-glass-slate",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
