import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Smartphone, Trophy, BarChart3, BookTemplate, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const FEATURES = [
  { icon: Smartphone, text: 'Live QR sharing — players follow the game on their phones in real time, no app needed' },
  { icon: Trophy, text: 'League & season tracking across multiple games' },
  { icon: BarChart3, text: 'Full results history, leaderboards & stats' },
  { icon: BookTemplate, text: 'Saved tournament templates & custom points formulas' },
];

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureHint?: string;
}

export function UpgradeModal({ open, onClose, featureHint }: UpgradeModalProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.id, email: ('email' in user ? user.email : undefined) }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the payment server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-orange-500" />
            <DialogTitle>Unlock StackMate Go Pro</DialogTitle>
          </div>
          {featureHint && (
            <p className="text-sm text-muted-foreground">{featureHint} is a Pro feature.</p>
          )}
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-orange-500/15 flex items-center justify-center mt-0.5">
                <Check className="h-3 w-3 text-orange-500" />
              </span>
              <span className="text-muted-foreground leading-snug">{text}</span>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2 pt-1">
          <Button
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            onClick={handleUpgrade}
            disabled={isLoading || !user}
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecting…</>
            ) : (
              'Upgrade — £9.99 / month'
            )}
          </Button>
          {!user && (
            <p className="text-xs text-center text-muted-foreground">Sign in first to upgrade</p>
          )}
          <p className="text-xs text-center text-muted-foreground">Cancel any time · Secure payment via Stripe</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
