import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Recursively removes undefined values from objects/arrays to prevent Firestore errors
 */
export function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (typeof obj !== 'object') return obj;
  
  // Preserve Firestore FieldValues (like serverTimestamp)
  if (obj && typeof obj === 'object' && obj._methodName) {
    return obj;
  }
  
  // Preserve Dates
  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }

  const sanitized: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      } else {
        sanitized[key] = null;
      }
    }
  }
  return sanitized;
}
