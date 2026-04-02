
import { Button } from "@/components/ui/button";
import { getButtonVariant, buttonCombinations } from "@/lib/buttonUtils";

/**
 * Comprehensive Button Usage Guide
 * 
 * This component demonstrates the proper button variants for different actions
 * across the poker tournament application.
 */
export function ButtonUsageGuide() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <h2 className="text-2xl font-bold">Button Color Scheme Guide</h2>
      
      {/* Tournament Actions */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Tournament Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button variant={buttonCombinations.tournament.start}>Start Tournament</Button>
          <Button variant={buttonCombinations.tournament.pause}>Pause Timer</Button>
          <Button variant={buttonCombinations.tournament.stop}>End Tournament</Button>
          <Button variant={buttonCombinations.tournament.settings}>Settings</Button>
        </div>
      </section>

      {/* Player Management */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Player Management</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button variant={buttonCombinations.player.add}>Add Player</Button>
          <Button variant={buttonCombinations.player.edit}>Edit Player</Button>
          <Button variant={buttonCombinations.player.eliminate}>Eliminate</Button>
          <Button variant={buttonCombinations.player.remove}>Remove Player</Button>
        </div>
      </section>

      {/* Seating Actions */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Seating Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Button variant={buttonCombinations.seating.auto}>Auto Seat</Button>
          <Button variant={buttonCombinations.seating.manual}>Manual Seat</Button>
          <Button variant={buttonCombinations.seating.finalTable}>Final Table</Button>
        </div>
      </section>

      {/* Modal/Dialog Actions */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Modal & Dialog Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button variant={buttonCombinations.modal.primary}>Confirm</Button>
          <Button variant={buttonCombinations.modal.secondary}>Cancel</Button>
          <Button variant={buttonCombinations.form.submit}>Save Changes</Button>
          <Button variant={buttonCombinations.destructive.action}>Delete Item</Button>
        </div>
      </section>

      {/* Action Type Examples */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Action Type Examples</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button variant={getButtonVariant("create")}>Create</Button>
          <Button variant={getButtonVariant("info")}>Show Info</Button>
          <Button variant={getButtonVariant("reset")}>Reset</Button>
          <Button variant={getButtonVariant("view")}>View Details</Button>
        </div>
      </section>

      {/* Color Meanings */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Color Meanings</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <Button variant="default" size="sm">Primary</Button>
            <span>Main actions (Start, Create, Save)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="success" size="sm">Success</Button>
            <span>Positive actions (Add, Confirm, Seat)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="warning" size="sm">Warning</Button>
            <span>Caution actions (Pause, Reset, Final Table)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="destructive" size="sm">Destructive</Button>
            <span>Dangerous actions (Delete, Remove, Eliminate)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="info" size="sm">Info</Button>
            <span>Informational actions (Details, Info)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">Neutral</Button>
            <span>Neutral actions (Edit, Settings, View)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm">Secondary</Button>
            <span>Supporting actions (Cancel, Back, Close)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm">Ghost</Button>
            <span>Subtle actions (Menu, Minimize, Expand)</span>
          </div>
        </div>
      </section>
    </div>
  );
}
