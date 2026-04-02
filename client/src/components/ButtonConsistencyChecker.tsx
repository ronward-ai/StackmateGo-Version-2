
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonLinter } from "@/lib/buttonLinter";
import { commonButtons } from "@/lib/buttonConsistency";
import { getButtonVariant } from "@/lib/buttonUtils";

/**
 * Development tool for checking button consistency across the app
 * Remove this component in production builds
 */
export function ButtonConsistencyChecker() {
  const [report, setReport] = useState<string>("");
  const [showGuide, setShowGuide] = useState(false);
  
  const runConsistencyCheck = () => {
    // In a real implementation, you'd scan through components
    // For now, we'll just show the available consistent buttons
    const availableButtons = Object.keys(commonButtons);
    setReport(`Available consistent button configurations:\n\n${availableButtons.join(", ")}`);
  };
  
  const actionTypes = [
    "start", "create", "save", "submit", "cancel", "back", "close",
    "add", "confirm", "accept", "delete", "remove", "bust", "eliminate",
    "pause", "reset", "override", "info", "details", "edit", "settings",
    "view", "menu", "minimize"
  ];
  
  return (
    <div className="space-y-4 p-4 border-2 border-dashed border-orange-300 bg-orange-50 rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-orange-800">
          🔧 Button Consistency Checker (Dev Tool)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowGuide(!showGuide)}
        >
          {showGuide ? "Hide" : "Show"} Guide
        </Button>
      </div>
      
      {showGuide && (
        <Card>
          <CardHeader>
            <CardTitle>Button Variant Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {actionTypes.map((action) => {
                const variant = getButtonVariant(action);
                return (
                  <div key={action} className="flex flex-col items-center space-y-1">
                    <Button variant={variant} size="sm">
                      {action}
                    </Button>
                    <Badge variant="outline" className="text-xs">
                      {variant}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="flex gap-2">
        <Button onClick={runConsistencyCheck} size="sm">
          Check Consistency
        </Button>
        <Button onClick={() => setReport("")} variant="outline" size="sm">
          Clear
        </Button>
      </div>
      
      {report && (
        <Alert>
          <AlertDescription>
            <pre className="whitespace-pre-wrap text-sm">{report}</pre>
          </AlertDescription>
        </Alert>
      )}
      
      <Alert>
        <AlertDescription>
          <strong>Quick Fix:</strong> Import <code>commonButtons</code> from{" "}
          <code>@/lib/buttonConsistency</code> and use predefined button configurations
          like <code>&#123;...commonButtons.startTournament&#125;</code>
        </AlertDescription>
      </Alert>
    </div>
  );
}
