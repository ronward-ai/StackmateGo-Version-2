
import { Button } from "@/components/ui/button";

/**
 * Button Usage Guide Component
 * 
 * Use this as a reference for consistent button styling across the app:
 * 
 * PRIMARY (default) - Main actions (Start Tournament, Save, Create)
 * SECONDARY - Secondary actions (Cancel modals, Navigate back)
 * DESTRUCTIVE - Dangerous actions (Delete, Remove, Bust Out)
 * SUCCESS - Positive confirmations (Confirm, Add, Accept)
 * WARNING - Caution actions (Pause, Reset, Override)
 * OUTLINE - Neutral actions (Edit, Settings, View Details)
 * GHOST - Subtle actions (Close, Minimize, Menu items)
 */

export function ButtonGuide() {
  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Button Color Guide</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium">Action Buttons</h4>
          <Button variant="default">Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="outline">Neutral Action</Button>
          <Button variant="ghost">Subtle Action</Button>
        </div>
        
        <div className="space-y-2">
          <h4 className="font-medium">Status Buttons</h4>
          <Button variant="success">Success Action</Button>
          <Button variant="warning">Warning Action</Button>
          <Button variant="destructive">Destructive Action</Button>
          <Button variant="info">Info Action</Button>
        </div>
      </div>
    </div>
  );
}
