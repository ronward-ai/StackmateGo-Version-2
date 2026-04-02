import { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SettingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function SettingsSection({ tournament }: SettingsSectionProps) {
  
  const [breakDuration, setBreakDuration] = useState(10);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [leagueName, setLeagueName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    state, 
    updateSettings, 
    addBreak
  } = tournament;
  
  // Initialize the branding fields from state
  useEffect(() => {
    if (state.settings.branding) {
      setLeagueName(state.settings.branding.leagueName);
      setLogoUrl(state.settings.branding.logoUrl || null);
    }
  }, [state.settings.branding]);
  
  // Handler for file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setLogoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Settings</h2>
        <span className="text-2xl">⚙️</span>
      </div>
      
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="breaks">Breaks</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
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
                  Enable sound notifications
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableVoice"
                  checked={state.settings.enableVoice}
                  onCheckedChange={(checked) => updateSettings({ enableVoice: !!checked })}
                />
                <Label htmlFor="enableVoice" className="text-sm">
                  Enable voice announcements
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
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="breaks">
          <div className="space-y-4 max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-2">Break Management</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="breakDuration" className="text-sm font-medium mb-2 block">
                  Break Duration (minutes)
                </Label>
                <Input
                  id="breakDuration"
                  type="number"
                  min={1}
                  max={60}
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(parseInt(e.target.value) || 10)}
                />
              </div>
              
              <div>
                <Label htmlFor="levelSelect" className="text-sm font-medium mb-2 block">
                  Add Break After Level
                </Label>
                <Select value={selectedLevel?.toString() || ""} onValueChange={(value) => setSelectedLevel(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.levels.map((level, index) => (
                      !level.isBreak && (
                        <SelectItem key={index} value={index.toString()}>
                          Level {index + 1}: {level.small}/{level.big}
                        </SelectItem>
                      )
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={() => {
                  if (selectedLevel !== null) {
                    addBreak(selectedLevel, breakDuration * 60);
                    setSelectedLevel(null);
                  }
                }}
                disabled={selectedLevel === null}
                className="w-full"
              >
                Add Break
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="branding">
          <div className="space-y-4 max-w-md mx-auto">
            <h3 className="text-lg font-medium flex items-center mb-2">
              <Image className="mr-2 h-5 w-5 text-secondary" />
              League Branding
            </h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="leagueName" className="text-sm font-medium mb-2 block">
                  League Name
                </Label>
                <Input
                  id="leagueName"
                  type="text"
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="Enter league name"
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  League Logo
                </Label>
                
                {logoUrl ? (
                  <div className="space-y-2">
                    <div className="relative w-32 h-32 border-2 border-dashed border-muted rounded-lg overflow-hidden">
                      <img 
                        src={logoUrl} 
                        alt="League logo" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={removeLogo}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div 
                      className="w-32 h-32 border-2 border-dashed border-muted rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="text-center">
                        <Image className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">Click to upload</p>
                      </div>
                    </div>
                  </div>
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
                onClick={() => {
                  updateSettings({
                    branding: {
                      leagueName: leagueName,
                      logoUrl: logoUrl || undefined
                    }
                  });
                }}
                className="w-full"
              >
                Save Branding
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}