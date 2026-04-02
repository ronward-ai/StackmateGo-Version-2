import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Download, Trash2 } from 'lucide-react';
import { useTournamentTemplates } from '@/hooks/useTournamentTemplates';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { BlindLevel, PrizeStructure } from '@/types';

interface TournamentTemplatesDialogProps {
  currentBlindLevels: BlindLevel[];
  currentPrizeStructure: PrizeStructure;
  onLoadTemplate: (blindLevels: BlindLevel[], prizeStructure: PrizeStructure) => void;
}

export default function TournamentTemplatesDialog({ 
  currentBlindLevels, 
  currentPrizeStructure, 
  onLoadTemplate 
}: TournamentTemplatesDialogProps) {
  const { user } = useAuth();
  const { templates, isLoading, saveTemplate, deleteTemplate } = useTournamentTemplates();
  const [isOpen, setIsOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast({ title: "Error", description: "Please enter a template name", variant: "destructive" });
      return;
    }

    try {
      setIsSaving(true);
      await saveTemplate({
        name: templateName.trim(),
        blindLevels: currentBlindLevels,
        prizeStructure: currentPrizeStructure
      });
      toast({ title: "Success", description: "Template saved successfully" });
      setTemplateName('');
    } catch (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast({ title: "Success", description: "Template deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    }
  };

  const handleLoad = (template: any) => {
    onLoadTemplate(template.blindLevels, template.prizeStructure);
    toast({ title: "Success", description: `Loaded template: ${template.name}` });
    setIsOpen(false);
  };

  if (!user) {
    return null; // Only show for logged in users
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Save className="h-4 w-4" />
          Saved Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Tournament Templates</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Save Current Configuration */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Save Current Configuration</h4>
            <div className="flex gap-2">
              <Input 
                placeholder="Template Name" 
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <Button onClick={handleSave} disabled={isSaving || !templateName.trim()}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          {/* Load Existing Templates */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Saved Templates</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved templates found.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-2 border rounded-md">
                    <span className="text-sm font-medium truncate flex-1">{template.name}</span>
                    <div className="flex items-center gap-1 ml-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleLoad(template)}
                        title="Load Template"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive"
                        onClick={() => template.id && handleDelete(template.id)}
                        title="Delete Template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
