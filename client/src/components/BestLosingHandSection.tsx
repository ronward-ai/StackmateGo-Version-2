import { useState } from 'react';
import { BestLosingHand } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';

interface BestLosingHandSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function BestLosingHandSection({ tournament }: BestLosingHandSectionProps) {
  const { state, updateBestLosingHand, clearBestLosingHand } = tournament;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<BestLosingHand>(
    state.bestLosingHand || {
      playerName: '',
      handDescription: '',
      beatenBy: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: ''
    }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBestLosingHand(formData);
    setDialogOpen(false);
  };

  const handleClear = () => {
    clearBestLosingHand();
    setFormData({
      playerName: '',
      handDescription: '',
      beatenBy: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: ''
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold">Season's Best Losing Hand</CardTitle>
            <CardDescription>Track the most unfortunate poker hand of the season</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {state.bestLosingHand ? (
          <div className="space-y-2">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between">
                <div className="font-semibold">{state.bestLosingHand.playerName}</div>
                <div className="text-sm text-muted-foreground">{state.bestLosingHand.date}</div>
              </div>
              <div className="mt-2 text-lg font-medium">{state.bestLosingHand.handDescription}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Beaten by: {state.bestLosingHand.beatenBy}
              </div>
              {state.bestLosingHand.notes && (
                <div className="mt-2 text-sm italic">
                  "{state.bestLosingHand.notes}"
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-20 border border-dashed rounded-lg">
            <p className="text-muted-foreground">No record yet. Add the season's most unlucky hand!</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between px-6 pb-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              {state.bestLosingHand ? "Edit Losing Hand" : "Add Losing Hand"}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Record Best Losing Hand</DialogTitle>
                <DialogDescription>
                  Enter details about the season's most unlucky hand
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="playerName" className="text-right">
                    Player
                  </Label>
                  <Input
                    id="playerName"
                    name="playerName"
                    value={formData.playerName}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="handDescription" className="text-right">
                    Hand
                  </Label>
                  <Input
                    id="handDescription"
                    name="handDescription"
                    placeholder="e.g., Pocket Aces"
                    value={formData.handDescription}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="beatenBy" className="text-right">
                    Beaten By
                  </Label>
                  <Input
                    id="beatenBy"
                    name="beatenBy"
                    placeholder="e.g., John's Straight Flush"
                    value={formData.beatenBy}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="date" className="text-right">
                    Date
                  </Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Any additional details..."
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {state.bestLosingHand && (
          <Button variant="ghost" onClick={handleClear}>
            Clear
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}