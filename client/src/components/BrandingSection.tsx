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

interface BrandingSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function BrandingSection({ tournament }: BrandingSectionProps) {
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
      // Update the branding settings with validation
      const updatedBranding = {
        leagueName: eventName.trim() || 'Tournament',
        logoUrl: logoUrl || undefined,
        isVisible: true
      };

      updateSettings({ branding: updatedBranding });

      // Update local state to match
      setIsVisible(true);

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
            disabled={isApplying || justApplied}
            className="w-full h-10 text-sm font-semibold"
          >
            {isApplying ? (
              <>
                <span className="animate-spin mr-1">⟳</span>
                Applying...
              </>
            ) : justApplied ? (
              <>
                <span className="mr-1">✓</span>
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
              setEventName('');
              setLogoUrl(undefined);
              setIsVisible(false);
            }}
            variant="outline"
            size="sm"
            className="mt-2 w-full text-xs"
          >
            Remove Branding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}