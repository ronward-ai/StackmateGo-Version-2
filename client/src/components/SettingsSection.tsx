import { useState, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image, X, Volume2, Mic, Eye, Layers, Users, RefreshCw, Settings2, Palette, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

// Consistent toggle row — label on left, control on right
function SettingRow({
  id, label, hint, checked, onCheckedChange, children
}: {
  id: string; label: string; hint?: string;
  checked?: boolean; onCheckedChange?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/20 last:border-0">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {children}
        {onCheckedChange !== undefined && (
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(c) => onCheckedChange(!!c)}
            className="checkbox-nav-style h-5 w-5"
          />
        )}
      </div>
    </div>
  );
}

// Grouped settings card
function SettingsGroup({ icon: Icon, title, color, children }: {
  icon: any; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <Card className="card-glass rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-4 w-4", color)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        </div>
        <div className="divide-y divide-border/20">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  const { state, updateSettings, updateNotes } = tournament;
  const [notes, setNotes] = useState(state?.notes || '');
  const [leagueName, setLeagueName] = useState(state?.settings?.branding?.leagueName || '');
  const [logoUrl, setLogoUrl] = useState(state?.settings?.branding?.logoUrl || '');
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local (staged) copy of general settings — only written to tournament on Apply
  const [localSettings, setLocalSettings] = useState(() => ({ ...state.settings }));
  const [generalDirty, setGeneralDirty] = useState(false);
  const [generalJustApplied, setGeneralJustApplied] = useState(false);

  const setLocal = (patch: Partial<typeof state.settings>) => {
    setLocalSettings(prev => ({ ...prev, ...patch }));
    setGeneralDirty(true);
  };

  const applyGeneralSettings = () => {
    updateSettings(localSettings);
    setGeneralDirty(false);
    setGeneralJustApplied(true);
    setTimeout(() => setGeneralJustApplied(false), 2000);
  };

  const saveNotes = (v: string) => {
    setNotes(v);
    updateNotes(v);
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
        branding: { leagueName: leagueName.trim(), logoUrl: logoUrl || undefined, isVisible: true }
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

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-10 mb-5">
              <TabsTrigger value="general" variant="settings" className="text-xs gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />General
              </TabsTrigger>
              <TabsTrigger value="branding" variant="tables" className="text-xs gap-1.5">
                <Palette className="h-3.5 w-3.5" />Branding
              </TabsTrigger>
              <TabsTrigger value="notes" variant="players" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />Notes
              </TabsTrigger>
            </TabsList>

            {/* ── General Tab ─────────────────────────────── */}
            <TabsContent value="general" className="space-y-4 mt-0">
              <SettingsGroup icon={Volume2} title="Audio" color="text-cyan-400">
                <SettingRow
                  id="enableSounds"
                  label="Sound Alerts"
                  hint="30-second warning & level complete sounds"
                  checked={localSettings.enableSounds}
                  onCheckedChange={(v) => setLocal({ enableSounds: v })}
                />
                <SettingRow
                  id="enableVoice"
                  label="Voice Announcements"
                  hint="Blind level changes & countdown warnings"
                  checked={localSettings.enableVoice}
                  onCheckedChange={(v) => {
                    setLocal({ enableVoice: v });
                    if (v) setTimeout(() => testVoice('Voice announcements enabled'), 100);
                  }}
                >
                  {localSettings.enableVoice && (
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
              </SettingsGroup>

              <SettingsGroup icon={Eye} title="Display" color="text-blue-400">
                <SettingRow
                  id="showNextLevel"
                  label="Next Level Preview"
                  hint="Show upcoming blinds in the timer"
                  checked={localSettings.showNextLevel}
                  onCheckedChange={(v) => setLocal({ showNextLevel: v })}
                />
              </SettingsGroup>

              <SettingsGroup icon={Layers} title="Blind Levels" color="text-purple-400">
                <SettingRow
                  id="applyDurationToAll"
                  label="Sync Level Durations"
                  hint="Editing one level duration updates all levels"
                  checked={localSettings.applyDurationToAll || false}
                  onCheckedChange={(v) => setLocal({ applyDurationToAll: v })}
                />
                <SettingRow
                  id="bigBlindAnte"
                  label="Big Blind Ante"
                  hint="BB posts the ante on behalf of the whole table"
                  checked={localSettings.bigBlindAnte || false}
                  onCheckedChange={(v) => setLocal({ bigBlindAnte: v })}
                />
              </SettingsGroup>

              <SettingsGroup icon={Users} title="Players" color="text-green-400">
                <SettingRow
                  id="enableRecentPlayers"
                  label="Recent Players"
                  hint="Autocomplete & quick-add from past tournaments"
                  checked={localSettings.enableRecentPlayers || false}
                  onCheckedChange={(v) => setLocal({ enableRecentPlayers: v })}
                />
              </SettingsGroup>

              <Button
                className="w-full h-10"
                onClick={applyGeneralSettings}
                disabled={!generalDirty}
              >
                {generalJustApplied
                  ? <><Check className="h-3.5 w-3.5 mr-1.5" />Applied!</>
                  : 'Apply Settings'}
              </Button>
            </TabsContent>

            {/* ── Branding Tab ─────────────────────────────── */}
            <TabsContent value="branding" className="space-y-4 mt-0">
              <Card className="card-glass rounded-xl">
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="leagueName" className="text-sm font-medium">Event Name</Label>
                    <Input
                      id="leagueName"
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      placeholder="e.g. Wednesday Night Poker"
                      className="h-10"
                    />
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
                            className="absolute top-2 right-2 h-6 w-6"
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
                      className="btn-apply-branding flex-1 h-10"
                      disabled={isApplying}
                      onClick={applyBranding}
                    >
                      {isApplying ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying...</>
                       : justApplied ? <>✓ Applied!</>
                       : 'Apply Branding'}
                    </Button>
                    <Button
                      className="btn-remove-branding h-10 px-3"
                      onClick={() => {
                        updateSettings({ branding: { leagueName: '', logoUrl: undefined, isVisible: false } });
                        setLeagueName('');
                        setLogoUrl('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Notes Tab ─────────────────────────────── */}
            <TabsContent value="notes" className="mt-0">
              <Card className="card-glass rounded-xl">
                <CardContent className="p-4 space-y-2">
                  <Textarea
                    placeholder="Add tournament notes, house rules, or announcements..."
                    value={notes}
                    onChange={(e) => saveNotes(e.target.value)}
                    className="min-h-[140px] text-sm resize-none border-border/30"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Notes auto-save as you type and are shown to players in the participant view.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
