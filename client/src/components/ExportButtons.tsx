import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The one pair of export buttons: **Image**, then **CSV**, in one style.
 *
 * The game's results read "CSV" / "Export Results" (outline and green) while the
 * league table beside them read "CSV" / "Image" (both outline) — reported as
 * messy, and fairly: two pairs doing the same two things looked like two
 * features. The card a pair sits on says WHAT is being exported; the buttons
 * only say how. One component, so the two cannot drift again.
 */
export default function ExportButtons({
  onImage,
  onCsv,
  busy = false,
  imageTitle,
  csvTitle,
}: {
  onImage: () => void;
  onCsv: () => void;
  busy?: boolean;
  imageTitle: string;
  csvTitle: string;
}) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={e => { e.stopPropagation(); onImage(); }}
        disabled={busy}
        title={imageTitle}
        className="h-8 px-3 gap-1.5"
      >
        <Download className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
        <span className="text-xs">{busy ? 'Saving…' : 'Image'}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={e => { e.stopPropagation(); onCsv(); }}
        title={csvTitle}
        className="h-8 px-3 gap-1.5"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="text-xs">CSV</span>
      </Button>
    </>
  );
}
