import { useState, useRef, useEffect } from 'react';
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

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  const { 
    state, 
    updateSettings
  } = tournament;

  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(localStorage.getItem('tournamentNotes') || '');
  const [leagueName, setLeagueName] = useState(state?.settings?.branding?.leagueName || '');
  const [logoUrl, setLogoUrl] = useState(state?.settings?.branding?.logoUrl || '');
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveNotes = (newNotes: string) => {
    setNotes(newNotes);
    try {
      localStorage.setItem('tournamentNotes', newNotes);
    } catch (error) {
      console.log('Failed to save notes to local storage');
    }
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



  if (!isExpanded) {
    return (
      <Card className="mt-6 bg-card rounded-xl shadow-lg overflow-hidden">
        <button 
          className="w-full p-6 sm:p-5 text-left text-xl font-semibold flex items-center justify-between touch-manipulation min-h-[4rem] sm:min-h-auto" 
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center">
            <span className="material-icons mr-2 text-secondary">settings</span>
            <span>Settings</span>
          </div>
          <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">unfold_more</span>
        </button>
      </Card>
    );
  }

  return (
    <Card className="mt-6 bg-card rounded-xl shadow-lg overflow-hidden bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/20">
      <button 
        className="w-full p-6 sm:p-5 text-left text-xl font-semibold flex items-center justify-between touch-manipulation min-h-[4rem] sm:min-h-auto" 
        onClick={() => setIsExpanded(false)}
      >
        <div className="flex items-center">
          <span className="material-icons mr-2 text-secondary">settings</span>
          <span>Settings</span>
        </div>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">unfold_less</span>
      </button>
      <div className="p-5 pt-0 border-t border-[#2a2a2a]">

      <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12 sm:h-auto">
            <TabsTrigger value="general" className="py-3 sm:py-2 text-base sm:text-sm">General</TabsTrigger>
            <TabsTrigger value="branding" className="py-3 sm:py-2 text-base sm:text-sm">Branding</TabsTrigger>
            <TabsTrigger value="notes" className="py-3 sm:py-2 text-base sm:text-sm">Notes</TabsTrigger>
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
                      />
                      <Label htmlFor="enableVoice" className="text-sm">
                        Enable voice announcements (new blind levels & warnings)
                      </Label>
                    </div>

                    {state.settings.enableVoice && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="py-3 px-4 sm:py-2 sm:px-3 text-base sm:text-sm min-h-[3rem] sm:min-h-auto touch-manipulation"
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
                />
                <Label htmlFor="enableRecentPlayers" className="text-sm">
                  Enable recent players (autocomplete & quick add buttons)
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
                        leagueName: leagueName.trim() || 'Tournament',
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
                className="w-full py-3 px-6 sm:py-2 sm:px-4 text-lg sm:text-base min-h-[3rem] sm:min-h-auto touch-manipulation"
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
                variant="outline"
                className="w-full"
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
                placeholder=""
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