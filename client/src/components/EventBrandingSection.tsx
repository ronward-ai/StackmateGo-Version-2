import { useState, useRef } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { UploadCloud, X, Eye, EyeOff } from "lucide-react";
import { BrandingSettings } from '@/types';

interface EventBrandingSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function EventBrandingSection({ tournament }: EventBrandingSectionProps) {
  const { state, updateSettings } = tournament;
  const [eventName, setEventName] = useState(state.settings.branding.leagueName);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(state.settings.branding.logoUrl);
  const [isVisible, setIsVisible] = useState(state.settings.branding.isVisible ?? true);
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Apply changes to tournament state
  const applyChanges = async () => {
    setIsApplying(true);
    
    try {
      // Update the settings - this will automatically trigger React re-render
      updateSettings({
        branding: {
          leagueName: eventName.trim(),
          logoUrl,
          isVisible
        }
      });
      
      // Show success state
      setJustApplied(true);
      setTimeout(() => setJustApplied(false), 2000);
      
    } finally {
      setIsApplying(false);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setLogoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const clearLogo = () => {
    setLogoUrl(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Quick toggle for visibility - applies immediately
  const toggleVisibility = (checked: boolean) => {
    setIsVisible(checked);
    updateSettings({
      branding: {
        leagueName: state.settings.branding.leagueName,
        logoUrl: state.settings.branding.logoUrl,
        isVisible: checked
      }
    });
  };
  
  return (
    <Card className="w-full mt-4">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Event Branding</CardTitle>
        <CardDescription>Add your event name and logo - displayed prominently below the main header</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          {/* Quick Visibility Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-3">
              {isVisible ? (
                <Eye className="h-5 w-5 text-green-600" />
              ) : (
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-base font-medium">
                  {isVisible ? "Branding Visible" : "Branding Hidden"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  Quick toggle to show/hide event branding
                </p>
              </div>
            </div>
            <Switch
              checked={isVisible}
              onCheckedChange={toggleVisibility}
            />
          </div>
          
          <Separator className="my-2" />
          
          <div className="grid gap-3">
            <Label htmlFor="eventName">Event Name</Label>
            <Input
              id="eventName"
              placeholder="Your Event Name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
          </div>
          
          <Separator className="my-2" />
          
          <div className="grid gap-3">
            <Label>Event Logo</Label>
            
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
            
            {logoUrl ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="relative w-full max-w-[280px] h-[140px] border-2 border-secondary/30 rounded-md overflow-hidden flex items-center justify-center p-2 bg-muted/30">
                  <img 
                    src={logoUrl} 
                    alt="Event Logo" 
                    className="max-h-full max-w-full object-contain" 
                  />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={clearLogo}
                    aria-label="Remove logo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" onClick={handleUploadClick}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Change Logo
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleUploadClick} className="w-full h-24 flex flex-col gap-2">
                <UploadCloud className="h-6 w-6" />
                <span>Upload Event Logo</span>
              </Button>
            )}
          </div>
          
          <Button
            onClick={applyChanges}
            className="mt-2 w-full h-10 text-sm font-semibold"
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
              'Apply Changes'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}