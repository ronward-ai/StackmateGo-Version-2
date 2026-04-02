import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as a currency value
 * @param value - The number to format
 * @param currency - The currency symbol (default: £)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, currency: string = "£"): string {
  return `${currency}${value.toFixed(2)}`;
}
