
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Users } from "lucide-react";

interface FinalTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  playerCount: number;
  onConfirm: () => void;
}

export default function FinalTableDialog({
  isOpen,
  onClose,
  playerCount,
  onConfirm,
}: FinalTableDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = () => {
    setIsConfirming(true);
    onConfirm();
    setIsConfirming(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Final Table?
          </DialogTitle>
          <DialogDescription>
            There are now {playerCount} players remaining - enough for a final table!
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex items-center justify-center gap-4 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border-2 border-yellow-200">
            <Users className="h-8 w-8 text-yellow-600" />
            <div className="text-center">
              <div className="text-lg font-semibold text-yellow-800">
                {playerCount} Players Remaining
              </div>
              <div className="text-sm text-yellow-600">
                Perfect for a final table
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>If you proceed:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All remaining players will be moved to Table 1</li>
              <li>Seats will be randomly assigned</li>
              <li>This marks the official final table of the tournament</li>
            </ul>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Not Yet
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isConfirming}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {isConfirming ? "Creating Final Table..." : "Go to Final Table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
