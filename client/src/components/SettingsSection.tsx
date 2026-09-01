import { useState, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingRow, SettingsGroup, SettingsGroupHeader } from '@/components/ui/setting-row';
import { Image, X, Mic, RefreshCw, Settings2, Palette, FileText, Timer, Check } from "lucide-react";

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  const { state, updateSettings, updateNotes } = tournament;
  const [notes, setNotes] = useState(state?.notes || '');
  // Named eventName throughout: this is the EVENT shown on the big screen, not
  // the league. Reads the legacy `leagueName` key so existing tournaments keep
  // their value; only `eventName` is written from here on.
  const [eventName, setEventName] = useState(
    (state?.settings?.branding as any)?.eventName ?? state?.settings?.branding?.leagueName ?? ''
  );
  const [logoUrl, setLogoUrl] = useState(state?.settings?.branding?.logoUrl || '');
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toggles write straight through, as they do on the Levels and Players tabs.
  // They used to stage into a local copy behind an "Apply Settings" button — but
  // that copy was the WHOLE settings object, snapshotted at mount, and Apply
  // shallow-merged all of it back. Anything changed after the tab was opened
  // (branding, tables, seasonId, gameNumber) was silently reverted by pressing
  // it. There is nothing here worth batching, so the staging is gone.

  const [notesDirty, setNotesDirty] = useState(false);
  const [notesJustSaved, setNotesJustSaved] = useState(false);

  const saveNotes = () => {
    updateNotes(notes);
    setNotesDirty(false);
    setNotesJustSaved(true);
    setTimeout(() => setNotesJustSaved(false), 2000);
  };

  const testVoice = (msg = 'This is a test voice announcement') => {
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    u.rate = 0.8;
    u.volume = 1.0;
    speechSynthesis.speak(u);
  };

  const applyBranding = async () => {
    setIsApplying(true);
    try {
      updateSettings({
        branding: { eventName: eventName.trim(), logoUrl: logoUrl || undefined, isVisible: true }
      });
      setJustApplied(true);
      setTimeout(() => setJustApplied(false), 2000);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="card-glass-indigo rounded-xl">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-5">
            <Settings2 className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Settings</span>
          </div>

          {/* One scrolling panel, not a tab bar inside a tab bar. Three toggles,
              a text field and a textarea did not warrant a second level of tabs
              under the app's own. */}

          <div className="space-y-4">
            <SettingsGroup icon={Timer} title="Timer" color="text-cyan-400">
              <SettingRow
                id="enableSounds"
                label="Sound Alerts"
                hint="30-second warning & level complete sounds"
                checked={state.settings.enableSounds}
                onCheckedChange={(v) => updateSettings({ enableSounds: v })}
              />
              <SettingRow
                id="enableVoice"
                label="Voice Announcements"
                hint="Blind level changes & countdown warnings"
                checked={state.settings.enableVoice}
                onCheckedChange={(v) => {
                  updateSettings({ enableVoice: v });
                  if (v) setTimeout(() => testVoice('Voice announcements enabled'), 100);
                }}
              >
                {state.settings.enableVoice && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="btn-test-voice h-7 text-xs px-2"
                    onClick={() => testVoice()}
                  >
                    <Mic className="h-3 w-3 mr-1" />
                    Test
                  </Button>
                )}
              </SettingRow>
              <SettingRow
                id="showNextLevel"
                label="Next Level Preview"
                hint="Show upcoming blinds in the timer"
                checked={state.settings.showNextLevel}
                onCheckedChange={(v) => updateSettings({ showNextLevel: v })}
              />
            </SettingsGroup>
            <Card className="card-glass rounded-xl">
              <CardContent className="p-4 space-y-4">
                <SettingsGroupHeader icon={Palette} title="Branding" color="text-purple-400" />

                <div className="space-y-1.5">
                  <Label htmlFor="eventName" className="text-sm font-medium">Event Name</Label>
                  <Input
                    id="eventName"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g. Wednesday Night Poker"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the big screen and to players. This is the event, not the league —
                    leave it blank during a league game to use the league&rsquo;s own name, which
                    you set in League &rarr; Manage League.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Event Logo</Label>
                  {logoUrl ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-32 rounded-lg border border-border/30 overflow-hidden flex items-center justify-center bg-muted/20 p-3">
                        <img src={logoUrl} alt="Event logo" className="max-h-full max-w-full object-contain" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8"
                          onClick={() => setLogoUrl('')}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
                        <Image className="h-3.5 w-3.5 mr-1.5" />Change Logo
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-24 flex flex-col gap-2 border-dashed border-border/50 hover:border-primary/50"
                    >
                      <Image className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload Event Logo</span>
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 h-10"
                    disabled={isApplying}
                    onClick={applyBranding}
                  >
                    {isApplying ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying...</>
                     : justApplied ? <>✓ Applied!</>
                     : 'Apply Branding'}
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-10 px-3"
                    onClick={() => {
                      updateSettings({ branding: { eventName: '', logoUrl: undefined, isVisible: false } });
                      setEventName('');
                      setLogoUrl('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="card-glass rounded-xl">
              <CardContent className="p-4 space-y-3">
                <SettingsGroupHeader icon={FileText} title="Notes" color="text-emerald-400" />

                <Textarea
                  placeholder="Add tournament notes, house rules, or announcements..."
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                  className="min-h-[140px] text-sm resize-none border-border/30"
                  rows={6}
                />
                <Button
                  className="w-full h-10"
                  onClick={saveNotes}
                  disabled={!notesDirty}
                >
                  {notesJustSaved
                    ? <><Check className="h-3.5 w-3.5 mr-1.5" />Saved!</>
                    : 'Save Notes'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
