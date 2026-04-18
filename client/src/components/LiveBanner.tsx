import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveBannerProps {
  onGoLive: () => void;
}

export function LiveBanner({ onGoLive }: LiveBannerProps) {
  return (
    <div className="mb-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/50 to-indigo-950/50 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative flex-shrink-0 h-8 w-8 flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-30" />
          <Smartphone className="relative h-5 w-5 text-blue-400" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">Let players follow live on their phones</p>
          <p className="text-xs text-blue-300/80 leading-tight mt-0.5 hidden sm:block">Real-time blinds, standings &amp; seat assignments — no app needed</p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={onGoLive}
        className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4"
      >
        Share Live →
      </Button>
    </div>
  );
}
