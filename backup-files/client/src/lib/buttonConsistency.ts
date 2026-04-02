
import { ButtonProps } from "@/components/ui/button";
import { getButtonVariant, buttonCombinations, getPatternVariant } from "./buttonUtils";

/**
 * Ensures consistent button props across the application
 */
export function getConsistentButtonProps(
  actionType: string,
  pattern?: keyof typeof buttonCombinations,
  customProps?: Partial<ButtonProps>
): ButtonProps {
  let variant = customProps?.variant;
  
  // If no variant specified, determine from action type or pattern
  if (!variant) {
    if (pattern && (buttonCombinations[pattern] as any)[actionType]) {
      variant = getPatternVariant(pattern, actionType);
    } else {
      variant = getButtonVariant(actionType);
    }
  }
  
  return {
    variant,
    size: customProps?.size || "default",
    ...customProps,
  };
}

/**
 * Common button configurations for quick access
 */
export const commonButtons = {
  // Primary actions
  startTournament: getConsistentButtonProps("start-tournament"),
  createTournament: getConsistentButtonProps("create"),
  saveTournament: getConsistentButtonProps("save"),
  
  // Player actions
  addPlayer: getConsistentButtonProps("add-player"),
  removePlayer: getConsistentButtonProps("remove-player"),
  editPlayer: getConsistentButtonProps("edit-player"),
  seatPlayer: getConsistentButtonProps("seat"),
  eliminatePlayer: getConsistentButtonProps("eliminate-player"),
  
  // Timer actions
  startTimer: getConsistentButtonProps("start", "timer"),
  pauseTimer: getConsistentButtonProps("pause", "timer"),
  resetTimer: getConsistentButtonProps("reset", "timer"),
  
  // Modal actions
  confirmModal: getConsistentButtonProps("confirm", "modal"),
  cancelModal: getConsistentButtonProps("cancel", "modal"),
  
  // Form actions
  submitForm: getConsistentButtonProps("submit", "form"),
  cancelForm: getConsistentButtonProps("cancel", "form"),
  
  // Tournament management
  pauseTournament: getConsistentButtonProps("pause", "tournament"),
  stopTournament: getConsistentButtonProps("stop", "tournament"),
  tournamentSettings: getConsistentButtonProps("settings", "tournament"),
  
  // Seating actions
  manualSeat: getConsistentButtonProps("manual", "seating"),
  autoSeat: getConsistentButtonProps("auto", "seating"),
  finalTable: getConsistentButtonProps("finalTable", "seating"),
  
  // Navigation
  back: getConsistentButtonProps("back"),
  close: getConsistentButtonProps("close"),
  menu: getConsistentButtonProps("menu"),
  
  // Info actions
  viewDetails: getConsistentButtonProps("details"),
  showInfo: getConsistentButtonProps("info"),
} as const;

/**
 * Validate button props against our consistency rules
 */
export function validateButtonProps(props: ButtonProps, actionType: string): boolean {
  const expectedVariant = getButtonVariant(actionType);
  return props.variant === expectedVariant;
}
