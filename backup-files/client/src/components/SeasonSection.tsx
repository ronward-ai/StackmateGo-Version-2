import { useState } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, ChevronDownIcon, PlusIcon, Edit2Icon, Trash2Icon, CheckIcon } from "lucide-react";
import { cn } from '@/lib/utils';

export default function SeasonSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [isCreatingNewSeason, setIsCreatingNewSeason] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editSeasonName, setEditSeasonName] = useState('');
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(undefined);
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { 
    seasons, 
    currentSeason, 
    addSeason, 
    updateSeason, 
    deleteSeason, 
    switchSeason,
    formatSeasonDateRange,
    isSeasonActive
  } = useSeasons();

  // Toggle form for creating a new season
  const toggleNewSeasonForm = () => {
    setIsCreatingNewSeason(!isCreatingNewSeason);
    if (!isCreatingNewSeason) {
      // Reset form when opening
      setNewSeasonName('');
      setStartDate(new Date());
    }
  };

  // Create a new season
  const handleCreateSeason = () => {
    if (newSeasonName.trim() === '') return;
    
    addSeason(newSeasonName, startDate);
    
    // Reset form and close it
    setNewSeasonName('');
    setStartDate(new Date());
    setIsCreatingNewSeason(false);
  };

  // Start editing a season
  const handleEditSeason = (id: string) => {
    const season = seasons.find(s => s.id === id);
    if (season) {
      setEditingSeasonId(id);
      setEditSeasonName(season.name);
      setEditStartDate(new Date(season.startDate));
      setEditEndDate(new Date(season.endDate));
    }
  };

  // Save season edits
  const handleSaveEdit = () => {
    if (editingSeasonId && editSeasonName.trim() !== '' && editStartDate && editEndDate) {
      updateSeason(editingSeasonId, {
        name: editSeasonName,
        startDate: editStartDate.toISOString(),
        endDate: editEndDate.toISOString()
      });
      
      // Reset form
      setEditingSeasonId(null);
    }
  };

  // Cancel season edit
  const handleCancelEdit = () => {
    setEditingSeasonId(null);
  };

  // Make a season active
  const handleSetActiveStatus = (id: string, active: boolean) => {
    updateSeason(id, { isActive: active });
  };

  // Delete a season
  const handleDeleteSeason = (id: string) => {
    if (window.confirm('Are you sure you want to delete this season? All player data and results will be lost.')) {
      deleteSeason(id);
    }
  };

  // Switch to a different season
  const handleSwitchSeason = (id: string) => {
    switchSeason(id);
  };

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">calendar_month</span>
          Season Management
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>
      
      {/* Collapsed content */}
      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Current Season</h3>
              <p className="text-muted-foreground text-sm">
                {currentSeason.name} ({formatSeasonDateRange(currentSeason)})
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={toggleNewSeasonForm}
              className="flex items-center gap-1"
            >
              <PlusIcon className="h-4 w-4" />
              <span>New Season</span>
            </Button>
          </div>
          
          {/* New Season Form */}
          {isCreatingNewSeason && (
            <div className="bg-muted/30 p-4 rounded-md mb-4 border border-border">
              <h3 className="font-medium mb-3">Create New Season</h3>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="seasonName">Season Name</Label>
                  <Input
                    id="seasonName"
                    value={newSeasonName}
                    onChange={(e) => setNewSeasonName(e.target.value)}
                    placeholder="e.g., Spring 2025"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="startDate"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal mt-1",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                          setStartDate(date);
                          setCalendarOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs mt-1">
                    Season will last for 3 months from this date
                  </p>
                </div>
                
                <div className="flex space-x-2 justify-end pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={toggleNewSeasonForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateSeason}
                    disabled={!newSeasonName.trim() || !startDate}
                  >
                    Create Season
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <Separator className="my-4" />
          
          {/* Seasons List */}
          <div>
            <h3 className="font-medium mb-3">All Seasons</h3>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {seasons.map(season => (
                <div 
                  key={season.id} 
                  className={cn(
                    "p-3 rounded-md border flex flex-col md:flex-row md:items-center justify-between",
                    currentSeason.id === season.id 
                      ? "bg-primary/10 border-primary/20" 
                      : "bg-muted/30 border-muted/50"
                  )}
                >
                  {/* View Mode */}
                  {editingSeasonId !== season.id ? (
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{season.name}</span>
                          {season.isActive && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          {currentSeason.id === season.id && (
                            <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {formatSeasonDateRange(season)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {season.players.length} players
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                        {currentSeason.id !== season.id && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSwitchSeason(season.id)}
                            className="text-xs h-8"
                          >
                            Switch to
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEditSeason(season.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2Icon className="h-4 w-4" />
                        </Button>
                        
                        <Button 
                          variant={season.isActive ? "ghost" : "default"}
                          size="icon"
                          onClick={() => handleSetActiveStatus(season.id, !season.isActive)}
                          className={cn(
                            "h-8 w-8",
                            season.isActive
                              ? "text-emerald-400 hover:text-emerald-300" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteSeason(season.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Edit Mode */}
                      <div className="w-full space-y-2">
                        <div>
                          <Label htmlFor={`edit-name-${season.id}`} className="sr-only">Season Name</Label>
                          <Input
                            id={`edit-name-${season.id}`}
                            value={editSeasonName}
                            onChange={(e) => setEditSeasonName(e.target.value)}
                            placeholder="Season Name"
                            className="w-full"
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor={`edit-start-${season.id}`} className="sr-only">Start Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  id={`edit-start-${season.id}`}
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editStartDate ? format(editStartDate, "PPP") : <span>Start Date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={editStartDate}
                                  onSelect={setEditStartDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          
                          <div>
                            <Label htmlFor={`edit-end-${season.id}`} className="sr-only">End Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  id={`edit-end-${season.id}`}
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editEndDate ? format(editEndDate, "PPP") : <span>End Date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={editEndDate}
                                  onSelect={setEditEndDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        
                        <div className="flex justify-end space-x-2 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={!editSeasonName.trim() || !editStartDate || !editEndDate}
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
              
              {seasons.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No seasons created yet. Create your first season to get started.
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-muted/30 mt-4 p-3 rounded-md text-sm border border-muted/50">
            <p className="flex items-center">
              <span className="material-icons mr-2 text-yellow-500 text-base">info</span>
              Seasons last for 3 months and track player statistics and league standings separately.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}