
import { type VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];

/**
 * Get the appropriate button variant based on action type
 */
export function getButtonVariant(actionType: string): ButtonVariant {
  const actionMap: Record<string, ButtonVariant> = {
    // Primary actions - Main tournament/game actions
    start: "default",
    create: "default", 
    save: "default",
    submit: "default",
    "start-tournament": "default",
    "auto-seat": "default",
    apply: "default",
    
    // Secondary actions - Supporting actions
    cancel: "secondary",
    back: "secondary",
    close: "secondary",
    "go-back": "secondary",
    
    // Positive actions - Adding/confirming
    add: "success",
    confirm: "success",
    accept: "success",
    seat: "success",
    "add-player": "success",
    "manual-seat": "success",
    "seat-players": "success",
    
    // Warning actions - Caution needed
    pause: "warning",
    reset: "warning",
    override: "warning",
    "pause-timer": "warning",
    "reset-timer": "warning",
    "final-table": "warning",
    
    // Destructive actions - Dangerous operations
    delete: "destructive",
    remove: "destructive",
    bust: "destructive",
    eliminate: "destructive",
    "remove-player": "destructive",
    "bust-out": "destructive",
    "eliminate-player": "destructive",
    
    // Info actions - Informational
    info: "info",
    details: "info",
    "show-details": "info",
    "view-info": "info",
    
    // Neutral actions - Settings/configuration
    edit: "outline",
    settings: "outline",
    view: "outline",
    configure: "outline",
    "edit-player": "outline",
    "table-settings": "outline",
    
    // Subtle actions - UI controls
    menu: "ghost",
    minimize: "ghost",
    expand: "ghost",
    collapse: "ghost",
  };
  
  return actionMap[actionType.toLowerCase()] || "outline";
}

/**
 * Common button combinations for frequent use cases
 */
export const buttonCombinations = {
  modal: {
    primary: "default" as ButtonVariant,
    secondary: "outline" as ButtonVariant,
  },
  form: {
    submit: "default" as ButtonVariant,
    cancel: "secondary" as ButtonVariant,
  },
  destructive: {
    action: "destructive" as ButtonVariant,
    cancel: "outline" as ButtonVariant,
  },
  player: {
    add: "success" as ButtonVariant,
    remove: "destructive" as ButtonVariant,
    edit: "outline" as ButtonVariant,
    seat: "success" as ButtonVariant,
    eliminate: "destructive" as ButtonVariant,
  },
  tournament: {
    start: "default" as ButtonVariant,
    pause: "warning" as ButtonVariant,
    stop: "destructive" as ButtonVariant,
    settings: "outline" as ButtonVariant,
    reset: "warning" as ButtonVariant,
  },
  timer: {
    start: "default" as ButtonVariant,
    pause: "warning" as ButtonVariant,
    reset: "warning" as ButtonVariant,
  },
  seating: {
    manual: "success" as ButtonVariant,
    auto: "default" as ButtonVariant,
    finalTable: "warning" as ButtonVariant,
  },
};

/**
 * Get button variant for common UI patterns
 */
export function getPatternVariant(pattern: keyof typeof buttonCombinations, action: string): ButtonVariant {
  const combination = buttonCombinations[pattern];
  return (combination as any)[action] || "outline";
}
