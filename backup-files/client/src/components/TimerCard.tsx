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
import { io, Socket } from 'socket.io-client';

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
    updateTimer,
    nextLevel
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
  const [socket, setSocket] = useState<Socket | null>(null);

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

  // Socket connection for director coordination
  useEffect(() => {
    if (state.details?.id) {
      const newSocket = io(window.location.origin);

      newSocket.on('connect', () => {
        console.log('Timer connected to socket:', newSocket.id);
        // Join both director coordination and main tournament room
        newSocket.emit('join-director-coordination', {
          tournamentId: state.details.id,
          directorId: 'main-director'
        });
        newSocket.emit('subscribe_tournament', state.details.id);
      });

      // Listen for director actions from other directors
      newSocket.on('director-action', (data) => {
        console.log('Received director action:', data);
        // Update local state to sync with other directors
        if (data.actionData) {
          // Always sync regardless of director ID to maintain consistency
          window.dispatchEvent(new CustomEvent('tournament-sync', { 
            detail: { tournament: data.actionData } 
          }));
        }
      });

      // Listen for tournament updates
      newSocket.on('tournament_updated', (data) => {
        console.log('Tournament update received:', data);
        if (data.tournament) {
          window.dispatchEvent(new CustomEvent('tournament-sync', { 
            detail: { tournament: data.tournament } 
          }));
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [state.details?.id]);

  // Function to broadcast director actions with tournament state
  const broadcastAction = (action: string, tournamentState?: any) => {
    if (socket && state.details?.id) {
      socket.emit('director-action', {
        tournamentId: state.details.id,
        action,
        actionData: tournamentState || state
      });
    }
  };

  const handleToggleTimer = () => {
    console.log('Timer toggle clicked, current state:', state.isRunning);
    if (state.isRunning) {
      pauseTimer();
      // Use a Promise to ensure state is updated before broadcasting
      setTimeout(() => {
        const updatedState = { ...state, isRunning: false };
        broadcastAction('paused timer', updatedState);
      }, 50);
    } else {
      startTimer();
      // Use a Promise to ensure state is updated before broadcasting
      setTimeout(() => {
        const updatedState = { ...state, isRunning: true };
        broadcastAction('started timer', updatedState);
      }, 50);
    }
  };

  const handleNextLevel = () => {
    nextLevel();
    setIsLevelComplete(false);
    setIsAlarmActive(false);
    if (alarmRef.current) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }
    setTimeout(() => broadcastAction('advanced to next level', state), 100);
  };

  const handleResetTimer = () => {
    resetTimer();
    setIsLevelComplete(false);
    setIsAlarmActive(false);
    if (alarmRef.current) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }
    setTimeout(() => broadcastAction('reset timer', state), 100);
  };

  const adjustTime = (minutes: number) => {
    const newTime = Math.max(0, state.secondsLeft + (minutes * 60));
    updateTimer(newTime);
    setTimeout(() => broadcastAction(`adjusted time by ${minutes} minutes`, state), 100);
  };

  const handleCustomTime = () => {
    if (timeInput) {
      const minutes = parseInt(timeInput, 10);
      if (!isNaN(minutes) && minutes > 0) {
        updateTimer(minutes * 60);
        setTimeInput('');
        setShowTimeInput(false);
        setTimeout(() => broadcastAction(`set timer to ${minutes} minutes`, state), 100);
      }
    }
  };

  return (
    <Card className="bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20 rounded-xl shadow-lg p-4 sm:p-8 flex flex-col items-center">
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
          Ante: {currentLevelAnte}
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
            variant={state.isRunning ? "warning" : "success"}
            size="sm"
            className="flex items-center justify-center gap-1 font-medium py-2 px-4 sm:py-2 sm:px-4 rounded-md cursor-pointer text-sm opacity-90 hover:opacity-100" 
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
      <div className="flex justify-between items-baseline text-muted-foreground text-sm w-full px-1 mb-2 sm:mb-3">
        <div>{getCurrentLevelTextModified()}</div>
        {!currentBreak && nextBreakInfo ? (
          <div className="font-medium text-amber-500 text-center text-sm">Next Break In: {nextBreakInfo.timeUntilBreak}</div>
        ) : null}
        <div className="font-medium">{getNextLevelPreview()}</div>
      </div>
    </Card>
  );
}

export default TimerCard;
export { TimerCard };