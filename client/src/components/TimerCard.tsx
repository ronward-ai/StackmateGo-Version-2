import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonCombinations } from "@/lib/buttonUtils";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Pause, RotateCcw, SkipForward, SkipBack, Volume2, VolumeX, Settings } from 'lucide-react';
import { Slider } from './ui/slider';
import { useSeasons } from '@/hooks/useSeasons';

// Component to show current game count with real-time updates
const GameCountBadge = ({ leagueData }: { leagueData: any }) => {
  const { currentSeason } = useSeasons();

  if (!leagueData?.length || !currentSeason) return null;

  // Calculate game count from league data
  const samplePlayer = leagueData[0];
  const totalGames = samplePlayer?.results?.length || 0;
  const newGameCount = totalGames + 1;

  return (
    <span className="text-xs font-medium text-orange-400 ml-2">
      Game {newGameCount} of {currentSeason.numberOfGames || 12} - {currentSeason.name}
    </span>
  );
};


interface TimerCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  recentLevelChange: boolean;
}

function TimerCard({ tournament, recentLevelChange }: TimerCardProps) {
  const { 
    state, 
    startTimer, 
    pauseTimer, 
    resetTimer, 
    resetTournament,
    formatTime, 
    calculateProgress,
    getCurrentBlinds,
    getCurrentLevelText,
    getRemainingTimeText,
    isBreak,
    skipToNextLevel,
    skipToPreviousLevel,
    updateTimer
  } = tournament;
  const [otherDirectorsActive, setOtherDirectorsActive] = useState(false);

  // Check if tournament is finished (all but one player eliminated)
  const eliminatedPlayers = state.players.filter(p => p.isActive === false);
  const isTournamentFinished = eliminatedPlayers.length >= state.players.length - 1 && state.players.length > 1;
  const activePlayers = state.players.filter(p => p.isActive !== false);
  const winner = isTournamentFinished ? activePlayers[0] : null;

  // Stop timer when tournament is finished
  useEffect(() => {
    if (isTournamentFinished && state.isRunning) {
      pauseTimer();
    }
  }, [isTournamentFinished, state.isRunning, pauseTimer]);

  const currentBreak = isBreak();
  const currentLevelAnte = state.levels[state.currentLevel]?.ante || 0;

  // Calculate next break info
  const getNextBreakInfo = () => {
    // If we're currently on a break, return null
    if (currentBreak) return null;

    // Look for the next break starting from the current level
    for (let i = state.currentLevel + 1; i < state.levels.length; i++) {
      if (state.levels[i].isBreak) {
        // Found the next break
        let secondsUntilBreak = state.secondsLeft; // Current level remaining time

        // Add the duration of all levels between current and break
        for (let j = state.currentLevel + 1; j < i; j++) {
          secondsUntilBreak += state.levels[j].duration;
        }

        // Format the time until break
        const minutesUntilBreak = Math.floor(secondsUntilBreak / 60);
        const secondsRemaining = secondsUntilBreak % 60;

        return {
          levelsUntilBreak: i - state.currentLevel,
          timeUntilBreak: `${minutesUntilBreak}:${secondsRemaining.toString().padStart(2, '0')}`
        };
      }
    }

    // No breaks found in the remaining levels
    return null;
  };

  // Get next level preview
  const getNextLevelPreview = () => {
    if (state.currentLevel + 1 >= state.levels.length) {
      return "Tournament Complete";
    }

    const nextLevel = state.levels[state.currentLevel + 1];

    // If next level is a break
    if (nextLevel.isBreak) {
      return "🍺 Break Time";
    }

    return `Next: ${nextLevel.small}/${nextLevel.big}`;
  };

  const nextBreakInfo = getNextBreakInfo();

  // Get current level text with modified logic for display
  const getCurrentLevelTextModified = useCallback(() => {
    if (state.currentLevel >= state.levels.length) {
      return "Tournament complete";
    }

    const currentLevel = state.levels[state.currentLevel];

    // If this is a break, show it as a break without level number
    if (currentLevel.isBreak) {
      return `🍺 Break`;
    }

    // Calculate the correct blind level number (excluding breaks)
    const blindLevelNumber = state.levels
      .slice(0, state.currentLevel + 1)
      .filter(level => !level.isBreak)
      .length;

    return `Level ${blindLevelNumber}`;
  }, [state.currentLevel, state.levels]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceLanguage, setVoiceLanguage] = useState('en-GB');
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [nextLevelAnnouncement, setNextLevelAnnouncement] = useState('3 minutes');
  const [lastAnnouncementTime, setLastAnnouncementTime] = useState<number | null>(null);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [alarmDuration, setAlarmDuration] = useState(10);
  const [isLevelComplete, setIsLevelComplete] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (state.settings.enableSounds) {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.volume = volume;

      alarmRef.current = new Audio('/level-complete.mp3');
      alarmRef.current.volume = volume;
      alarmRef.current.loop = true;
    }
  }, [state.settings.enableSounds, volume]);

  const handleToggleTimer = () => {
    if (state.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  };

  const handleNextLevel = () => {
    skipToNextLevel();
    setIsLevelComplete(false);
    setIsAlarmActive(false);
    if (alarmRef.current) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }
  };

  const handleResetTimer = () => {
    resetTimer();
    setIsLevelComplete(false);
    setIsAlarmActive(false);
    if (alarmRef.current) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }
  };

  const adjustTime = (minutes: number) => {
    const newTime = Math.max(0, state.secondsLeft + (minutes * 60));
    updateTimer({ secondsLeft: newTime });
  };

  const handleCustomTime = () => {
    if (timeInput) {
      const minutes = parseInt(timeInput, 10);
      if (!isNaN(minutes) && minutes > 0) {
        updateTimer({ secondsLeft: minutes * 60 });
        setTimeInput('');
        setShowTimeInput(false);
      }
    }
  };

  return (
    <Card className="bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20 rounded-xl shadow-lg p-4 sm:p-8 flex flex-col items-center relative">
      {/* Tournament Mode Toggle Buttons */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1">
        <Button
          variant="ghost"
          className={`h-6 sm:h-8 px-2 sm:px-3 py-0 text-xs sm:text-sm font-medium min-h-[24px] sm:min-h-[32px] border rounded-md transition-all ${
            state.details?.type !== 'season'
              ? "btn-timer-toggle-active"
              : "btn-timer-toggle-inactive"
          }`}
          onClick={() => {
            // Toggle to standalone mode
            tournament.updateTournamentDetails({
              ...state.details,
              type: 'standalone'
            });
          }}
        >
          standalone
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className={`h-6 sm:h-8 px-2 sm:px-3 py-0 text-xs sm:text-sm font-medium min-h-[24px] sm:min-h-[32px] border rounded-md transition-all ${
              state.details?.type === 'season'
                ? "btn-timer-toggle-active"
                : "btn-timer-toggle-inactive"
            }`}
            onClick={() => {
              // Toggle to league mode - ensure we set the correct type for broadcasting
              tournament.updateTournamentDetails({
                ...state.details,
                type: 'season'
              });
            }}
          >
            league game
          </Button>
          {state.details?.type === 'season' && (
            <GameCountBadge leagueData={state.players} />
          )}
        </div>
      </div>

      <div className="font-mono text-8xl sm:text-[10rem] md:text-[16rem] lg:text-[20rem] font-bold tracking-tight my-4 sm:my-8 flex-shrink-0 timer-responsive" style={{ lineHeight: '0.85' }}>
        {formatTime()}
      </div>

      <div className={cn(
        "text-2xl sm:text-4xl md:text-6xl font-bold mb-3 sm:mb-7", 
        recentLevelChange && "level-change",
        currentBreak && "text-secondary",
        isTournamentFinished && "animate-pulse text-yellow-400"
      )}>
        {currentBreak ? "BREAK TIME" : getCurrentBlinds()}
      </div>

      {/* Show ante if present and not on break */}
      {!currentBreak && currentLevelAnte > 0 && (
        <div className="text-sm sm:text-md font-medium mb-3 sm:mb-7 text-amber-500">
          {state.settings.bigBlindAnte ? 'BB Ante' : 'Ante'}: {currentLevelAnte}
        </div>
      )}

      {/* Timer Controls with Previous/Next positioned at edges */}
      <div className="flex justify-between items-center w-full px-4 sm:px-8 mb-4 sm:mb-6">
        {/* Previous Button - Left side */}
        <Button 
          variant="ghost"
          size="sm"
          className="flex items-center justify-center gap-1 text-xs px-3 py-2 text-muted-foreground hover:text-foreground"
          onClick={() => skipToPreviousLevel()}
          disabled={state.currentLevel <= 0 || isTournamentFinished}
        >
          <span className="material-icons text-sm">skip_previous</span>
          <span>Previous</span>
        </Button>

        {/* Main Control Button - Center */}
        {!isTournamentFinished ? (
          <Button 
            variant="ghost"
            size="sm"
            className={`flex items-center justify-center gap-1 font-medium py-2 px-4 sm:py-2 sm:px-4 rounded-md cursor-pointer text-sm border transition-all ${
              state.isRunning ? "btn-timer-pause" : "btn-timer-start"
            }`}
            onClick={() => {
              handleToggleTimer()
            }}
          >
            <span className="material-icons text-sm">
              {state.isRunning ? "pause" : "play_arrow"}
            </span>
            <span>{state.isRunning ? "Pause" : "Start"}</span>
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="default" 
                size="sm"
                className="flex items-center justify-center gap-1 font-medium py-2 px-4 rounded-md text-sm opacity-90 hover:opacity-100"
              >
                <span className="material-icons text-sm">add_circle</span>
                <span>New Tournament</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start New Tournament?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear all current tournament data including players, settings, and results. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetTournament}>
                  Start New Tournament
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Next Button - Right side */}
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center justify-center gap-1 text-xs px-3 py-2 text-muted-foreground hover:text-foreground"
          onClick={() => skipToNextLevel()}
          disabled={state.currentLevel >= state.levels.length - 1 || isTournamentFinished}
        >
          <span className="material-icons text-sm">skip_next</span>
          <span>Next</span>
        </Button>
      </div>

      {/* Level Progress Indicator */}
      <Progress 
        value={calculateProgress()} 
        className={cn(
          "w-full h-2.5 mb-3 sm:mb-6",
          currentBreak ? "bg-neutral-800 [&>div]:bg-secondary" : "bg-neutral-800"
        )} 
      />

      {/* Level Info */}
      <div className="flex justify-between items-start text-muted-foreground text-sm w-full px-1 mb-2 sm:mb-3">
        <div className="flex-1 text-left">{getCurrentLevelTextModified()}</div>
        <div className="flex flex-col items-center justify-center flex-1">
          {!currentBreak && nextBreakInfo ? (
            <div className="font-medium text-amber-500 text-center text-sm mb-2">Next Break In: {nextBreakInfo.timeUntilBreak}</div>
          ) : null}
          {state.details?.id && (
            <div className="flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`${window.location.protocol}//${window.location.host}/tournament/${state.details.id}`)}`}
                alt="Viewer QR Code"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-white p-1"
                crossOrigin="anonymous"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-[10px] mt-1">Scan to View</span>
            </div>
          )}
        </div>
        <div className="flex-1 text-right font-medium">{getNextLevelPreview()}</div>
      </div>
    </Card>
  );
}

export default TimerCard;
export { TimerCard };