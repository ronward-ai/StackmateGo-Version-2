import { useState, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EventBrandingSection from "@/components/EventBrandingSection";
import { Switch } from "@/components/ui/switch";

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  const { 
    state, 
    updateSettings,
    updateTournamentDetails,
    updateNotes
  } = tournament;

  const [notes, setNotes] = useState(state?.notes || '');
  const [leagueName, setLeagueName] = useState(state?.settings?.branding?.leagueName || '');
  const [logoUrl, setLogoUrl] = useState(state?.settings?.branding?.logoUrl || '');
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const fileInputRef = useRef<HTMLInputElement>(null);


  const saveNotes = (newNotes: string) => {
    setNotes(newNotes);
    updateNotes(newNotes);
  };

  const removeLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setLogoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card className="mt-6 bg-card rounded-xl shadow-lg overflow-hidden bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/20">
      <div className="w-full p-6 sm:p-5 text-left text-xl font-semibold flex items-center justify-between min-h-[4rem] sm:min-h-auto">
        <div className="flex items-center">
          <span className="material-icons mr-2 text-orange-500">settings</span>
          <span>Settings</span>
        </div>
      </div>
      <div className="p-5 pt-0 border-t border-[#2a2a2a]">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="general" variant="settings" className="flex items-center justify-center gap-2 h-full text-sm font-medium">General</TabsTrigger>
            <TabsTrigger value="branding" variant="tables" className="flex items-center justify-center gap-2 h-full text-sm font-medium">Branding</TabsTrigger>
            <TabsTrigger value="notes" variant="players" className="flex items-center justify-center gap-2 h-full text-sm font-medium">Notes</TabsTrigger>
          </TabsList>

        <TabsContent value="general">
          <div className="space-y-4 max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-2">General Settings</h3>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableSounds"
                  checked={state.settings.enableSounds}
                  onCheckedChange={(checked) => updateSettings({ enableSounds: !!checked })}
                  className="checkbox-nav-style"
                />
                <Label htmlFor="enableSounds" className="text-sm">
                  Enable sound alerts (30-second warning & level complete)
                </Label>
              </div>

              <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="enableVoice"
                        checked={state.settings.enableVoice}
                        onCheckedChange={(checked) => {
                          updateSettings({ enableVoice: !!checked });

                          // Test voice when enabled
                          if (checked) {
                            setTimeout(() => {
                              if (speechSynthesis.speaking) {
                                speechSynthesis.cancel();
                              }

                              const testUtterance = new SpeechSynthesisUtterance('Voice announcements enabled');
                              testUtterance.rate = 0.8;
                              testUtterance.volume = 1.0;
                              testUtterance.onstart = () => console.log("🎤 Test voice started");
                              testUtterance.onend = () => console.log("✅ Test voice completed");
                              testUtterance.onerror = (e) => console.error("❌ Test voice error:", e);

                              speechSynthesis.speak(testUtterance);
                            }, 100);
                          }
                        }}
                        className="checkbox-nav-style"
                      />
                      <Label htmlFor="enableVoice" className="text-sm">
                        Enable voice announcements (new blind levels & warnings)
                      </Label>
                    </div>

                    {state.settings.enableVoice && (
                      <Button
                        variant="ghost"
                        className="btn-test-voice py-3 px-4 sm:py-2 sm:px-3 text-base sm:text-sm min-h-[3rem] sm:min-h-auto touch-manipulation border rounded-md transition-all"
                        onClick={() => {
                          if (speechSynthesis.speaking) {
                            speechSynthesis.cancel();
                          }

                          const testMessage = "This is a test voice announcement";
                          console.log("🧪 Testing voice:", testMessage);

                          const utterance = new SpeechSynthesisUtterance(testMessage);
                          utterance.rate = 0.8;
                          utterance.volume = 1.0;
                          utterance.onstart = () => console.log("🎤 Manual test voice started");
                          utterance.onend = () => console.log("✅ Manual test voice completed");
                          utterance.onerror = (e) => console.error("❌ Manual test voice error:", e);

                          speechSynthesis.speak(utterance);
                        }}
                      >
                        Test Voice
                      </Button>
                    )}
                  </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showNextLevel"
                  checked={state.settings.showNextLevel}
                  onCheckedChange={(checked) => updateSettings({ showNextLevel: !!checked })}
                  className="checkbox-nav-style"
                />
                <Label htmlFor="showNextLevel" className="text-sm">
                  Show next level preview
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="applyDurationToAll"
                  checked={state.settings.applyDurationToAll || false}
                  onCheckedChange={(checked) => updateSettings({ applyDurationToAll: !!checked })}
                  className="checkbox-nav-style"
                />
                <Label htmlFor="applyDurationToAll" className="text-sm">
                  Apply duration changes to all blind levels
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableRecentPlayers"
                  checked={state.settings.enableRecentPlayers || false}
                  onCheckedChange={(checked) => updateSettings({ enableRecentPlayers: !!checked })}
                  className="checkbox-nav-style"
                />
                <Label htmlFor="enableRecentPlayers" className="text-sm">
                  Enable recent players (autocomplete & quick add buttons)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bigBlindAnte"
                  checked={state.settings.bigBlindAnte || false}
                  onCheckedChange={(checked) => updateSettings({ bigBlindAnte: !!checked })}
                  className="checkbox-nav-style"
                />
                <Label htmlFor="bigBlindAnte" className="text-sm">
                  Big Blind Ante (BB posts ante for the table)
                </Label>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="branding">
          <div className="space-y-4 max-w-md mx-auto">
            <h3 className="text-lg font-medium flex items-center mb-2">
              <Image className="mr-2 h-5 w-5 text-secondary" />
              Event Branding
            </h3>

            <div className="space-y-4">
              <div>
                <Label htmlFor="leagueName" className="text-sm font-medium mb-2 block">
                  Event Name
                </Label>
                <Input
                  id="leagueName"
                  type="text"
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="Enter event name"
                  className="px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm"
                />
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Event Logo
                </Label>

                {logoUrl ? (
                  <div className="space-y-2">
                    <div className="relative w-full max-w-[280px] h-[140px] border-2 border-secondary/30 rounded-md overflow-hidden flex items-center justify-center p-2 bg-muted/30">
                      <img 
                        src={logoUrl} 
                        alt="Event logo" 
                        className="max-h-full max-w-full object-contain"
                      />
                      <Button 
                        variant="destructive" 
                        size="icon" 
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={removeLogo}
                        aria-label="Remove logo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Image className="mr-2 h-4 w-4" /> Change Logo
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-full h-24 flex flex-col gap-2"
                  >
                    <Image className="h-6 w-6" />
                    <span>Upload Event Logo</span>
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <Button 
                onClick={async () => {
                  setIsApplying(true);

                  try {
                    updateSettings({
                      branding: {
                        leagueName: leagueName.trim(),
                        logoUrl: logoUrl || undefined,
                        isVisible: true
                      }
                    });

                    // Show success state
                    setJustApplied(true);
                    setTimeout(() => setJustApplied(false), 2000);

                  } finally {
                    setIsApplying(false);
                  }
                }}
                className="btn-apply-branding w-full py-3 px-6 sm:py-2 sm:px-4 text-lg sm:text-base min-h-[3rem] sm:min-h-auto touch-manipulation"
                disabled={isApplying}
              >
                {isApplying ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Applying...
                  </>
                ) : justApplied ? (
                  <>
                    <span className="mr-2">✓</span>
                    Applied!
                  </>
                ) : (
                  'Apply Branding'
                )}
              </Button>

              <Button 
                onClick={() => {
                  updateSettings({
                    branding: {
                      leagueName: '',
                      logoUrl: undefined,
                      isVisible: false
                    }
                  });
                  setLeagueName('');
                  setLogoUrl('');
                }}
                className="btn-remove-branding w-full"
              >
                Remove Branding
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <div className="space-y-4 max-w-md mx-auto">
            <div className="space-y-2">
              <Textarea
                id="tournament-notes"
                placeholder="Add tournament notes..."
                value={notes}
                onChange={(e) => saveNotes(e.target.value)}
                className="min-h-[120px] text-sm"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Notes are automatically saved as you type and persist between sessions.
              </p>
            </div>
          </div>
        </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}