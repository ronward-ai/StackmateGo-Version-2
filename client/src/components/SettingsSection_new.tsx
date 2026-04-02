import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BrandingSection from "@/components/BrandingSection";

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { 
    state, 
    updateSettings
  } = tournament;

  if (!isExpanded) {
    return (
      <Card className="p-4">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(true)}
        >
          <h2 className="text-xl font-semibold flex items-center">
            <span className="material-icons mr-2 text-secondary">settings</span>
            Settings
          </h2>
          <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
            unfold_more
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(false)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">settings</span>
          Settings
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          unfold_less
        </span>
      </div>
      
      <div className="pt-4 space-y-6">

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="tabs-list grid w-full grid-cols-2 bg-transparent border-0 p-0 gap-2 h-auto mb-4">
            <TabsTrigger value="general" variant="settings" className="tab-settings flex items-center justify-center gap-1 border border-border bg-background hover:bg-accent hover:text-accent-foreground font-medium py-2 px-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary">
              <span className="material-icons text-sm">settings</span>
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="branding" variant="settings" className="tab-settings flex items-center justify-center gap-1 border border-border bg-background hover:bg-accent hover:text-accent-foreground font-medium py-2 px-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary">
              <span className="material-icons text-sm">palette</span>
              <span>Branding</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableSounds"
                  checked={state.settings.enableSounds}
                  onCheckedChange={(checked) => updateSettings({ enableSounds: !!checked })}
                />
                <Label htmlFor="enableSounds" className="text-sm">
                  Enable sound notifications
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showSeconds"
                  checked={state.settings.showSeconds}
                  onCheckedChange={(checked) => updateSettings({ showSeconds: !!checked })}
                />
                <Label htmlFor="showSeconds" className="text-sm">
                  Show seconds on timer
                </Label>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="enableVoice"
                    checked={state.settings.enableVoice}
                    onCheckedChange={(checked) => {
                      updateSettings({ enableVoice: !!checked });

                      if (checked) {
                        setTimeout(() => {
                          if (speechSynthesis.speaking) {
                            speechSynthesis.cancel();
                          }

                          const testUtterance = new SpeechSynthesisUtterance('Voice announcements enabled');
                          testUtterance.rate = 0.8;
                          testUtterance.volume = 1.0;
                          speechSynthesis.speak(testUtterance);
                        }, 100);
                      }
                    }}
                  />
                  <Label htmlFor="enableVoice" className="text-sm">
                    Enable voice announcements
                  </Label>
                </div>

                {state.settings.enableVoice && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (speechSynthesis.speaking) {
                        speechSynthesis.cancel();
                      }

                      const testMessage = "This is a test voice announcement";
                      const utterance = new SpeechSynthesisUtterance(testMessage);
                      utterance.rate = 0.8;
                      utterance.volume = 1.0;
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
            </div>
          </TabsContent>



          <TabsContent value="branding">
            <BrandingSection tournament={tournament} />
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}