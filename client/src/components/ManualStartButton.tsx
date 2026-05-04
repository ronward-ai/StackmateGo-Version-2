import { Button } from "@/components/ui/button";
import { getButtonVariant } from "@/lib/buttonUtils";
import { useTournament } from '@/hooks/useTournament';

export default function ManualStartButton() {
  const tournament = useTournament();
  const { state } = tournament;
  
  const handleStartTimer = () => {
    console.log("Manual start button clicked");
    // Directly manipulate state without going through the hook
    document.dispatchEvent(new CustomEvent('start-tournament-timer'));
  };
  
  return (
    <Button
      variant="destructive"
      className="w-full mt-4"
      onClick={handleStartTimer}
      disabled={state.isRunning}
    >
      Start Timer (Alternate Method)
    </Button>
  );
}