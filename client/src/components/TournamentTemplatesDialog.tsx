import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookmarkPlus, Download, Trash2 } from 'lucide-react';
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
  const { templates: allTemplates, isLoading, saveTemplate, deleteTemplate } = useTournamentTemplates();
  const templates = allTemplates.filter(t => t.templateType === 'tournament');
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!templateName.trim()) return;
    try {
      setIsSaving(true);
      await saveTemplate({
        name: templateName.trim(),
        blindLevels: currentBlindLevels,
        prizeStructure: currentPrizeStructure,
        templateType: 'tournament'
      });
      toast({ title: 'Template saved', description: `"${templateName.trim()}" saved to your templates.` });
      setTemplateName('');
      setSaveOpen(false);
    } catch {
      toast({ title: 'Save failed', description: 'Could not save template. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast({ title: 'Template deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const handleLoad = (template: any) => {
    onLoadTemplate(template.blindLevels, template.prizeStructure);
    toast({ title: 'Template loaded', description: template.name });
    setLoadOpen(false);
  };

  if (!user) return null;

  return (
    <div className="flex gap-2">
      {/* Save as Template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save as Template
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-purple-400" />
              Save as Template
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Template name (e.g. Friday Night)"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isSaving && templateName.trim() && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button disabled={!templateName.trim() || isSaving} onClick={handleSave}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Template */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Load Template
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Load Tournament Template</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved templates yet. Use "Save as Template" to create one.</p>
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
                        title="Load template"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => template.id && handleDelete(template.id)}
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
