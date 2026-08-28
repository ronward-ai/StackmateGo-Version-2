import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';

/**
 * Which league everything below applies to.
 *
 * Sits above the tabs rather than beside them. League is the SCOPE; Seasons,
 * Points and Stats are aspects of the league you have selected — settings are
 * stored per league (`leagueSettings:${leagueId}`), so presenting all four as
 * sibling tabs flattened a hierarchy that genuinely exists.
 *
 * Rename and New are labelled buttons, not a bare `⋯` menu: that pattern is
 * what previously hid Delete League inside a menu titled "Season actions".
 */
export default function LeagueScopeBar({ readOnly = false }: { readOnly?: boolean }) {
  const { league, userLeagues, switchLeague, createLeague, renameLeague } = useLeague();

  const [mode, setMode] = useState<'idle' | 'rename' | 'create'>('idle');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset any in-progress edit if the league changes underneath us.
  useEffect(() => { setMode('idle'); setError(null); }, [league?.id]);

  const startRename = () => { setDraft(league?.name ?? ''); setError(null); setMode('rename'); };
  const startCreate = () => { setDraft(''); setError(null); setMode('create'); };
  const cancel = () => { setMode('idle'); setDraft(''); setError(null); };

  const commit = async () => {
    const name = draft.trim();
    if (!name) return;
    setBusy(true); setError(null);
    try {
      if (mode === 'rename') await renameLeague(name);
      else await createLeague(name); // switches to the new league on success
      setMode('idle'); setDraft('');
    } catch (err: any) {
      setError(err?.message || 'That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <div className="pb-3 mb-1 border-b border-border/40 space-y-2">
      {mode === 'idle' ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs text-muted-foreground flex-shrink-0">League</Label>

          {userLeagues.length > 1 ? (
            <Select value={league?.id ? String(league.id) : undefined} onValueChange={id => switchLeague(id)}>
              <SelectTrigger className="h-8 text-sm w-auto min-w-[180px]">
                <SelectValue placeholder="Select league" />
              </SelectTrigger>
              <SelectContent>
                {userLeagues.map((l: any) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm font-medium truncate">{league?.name || 'My League'}</span>
          )}

          {!readOnly && (
            <div className="flex items-center gap-1 ml-auto">
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={startRename}>
                <Pencil className="h-3.5 w-3.5" />
                <span className="text-xs">Rename</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5" />
                <span className="text-xs">New</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {mode === 'rename' ? 'Rename league' : 'New league name'}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') cancel();
              }}
              placeholder={mode === 'create' ? 'e.g. Thursday Night League' : undefined}
              maxLength={99}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 gap-1.5" disabled={busy || !draft.trim()} onClick={commit}>
              <Check className="h-3.5 w-3.5" />
              <span className="text-xs">{mode === 'rename' ? 'Save' : 'Create'}</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={cancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {mode === 'create' && (
            <p className="text-xs text-muted-foreground">
              A separate league with its own players, seasons, standings and points system.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
