
import { ButtonProps } from "@/components/ui/button";
import { getButtonVariant } from "./buttonUtils";

interface ButtonUsage {
  component: string;
  line: number;
  actionType: string;
  currentVariant?: string;
  expectedVariant: string;
  isConsistent: boolean;
}

/**
 * Analyzes button usage consistency across components
 */
export class ButtonConsistencyLinter {
  private inconsistencies: ButtonUsage[] = [];
  
  /**
   * Check if a button's variant matches expected variant for its action
   */
  checkButton(
    componentName: string,
    lineNumber: number,
    actionType: string,
    actualProps: ButtonProps
  ): boolean {
    const expectedVariant = getButtonVariant(actionType);
    const isConsistent = actualProps.variant === expectedVariant;
    
    if (!isConsistent) {
      this.inconsistencies.push({
        component: componentName,
        line: lineNumber,
        actionType,
        currentVariant: actualProps.variant || "default",
        expectedVariant,
        isConsistent: false,
      });
    }
    
    return isConsistent;
  }
  
  /**
   * Get all found inconsistencies
   */
  getInconsistencies(): ButtonUsage[] {
    return this.inconsistencies;
  }
  
  /**
   * Generate a report of button inconsistencies
   */
  generateReport(): string {
    if (this.inconsistencies.length === 0) {
      return "✅ All buttons are using consistent variants!";
    }
    
    let report = `❌ Found ${this.inconsistencies.length} button inconsistencies:\n\n`;
    
    this.inconsistencies.forEach((issue, index) => {
      report += `${index + 1}. ${issue.component}:${issue.line}\n`;
      report += `   Action: "${issue.actionType}"\n`;
      report += `   Current: "${issue.currentVariant}" → Expected: "${issue.expectedVariant}"\n\n`;
    });
    
    return report;
  }
  
  /**
   * Clear all recorded inconsistencies
   */
  reset(): void {
    this.inconsistencies = [];
  }
}

// Global instance for use across the app
export const buttonLinter = new ButtonConsistencyLinter();
