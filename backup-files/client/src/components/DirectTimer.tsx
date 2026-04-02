import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function DirectTimer() {
  const [time, setTime] = useState(300); // 5 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  
  // Timer effect
  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setTime(prev => {
          if (prev <= 0) {
            clearInterval(timerRef.current!);
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);
  
  // Format time as MM:SS
  const formatTime = () => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Calculate progress percentage
  const calculateProgress = () => {
    return (time / 300) * 100;
  };
  
  return (
    <Card className="p-6 mb-4">
      <h3 className="text-xl font-bold mb-4 text-center">Tournament Timer (Direct Implementation)</h3>
      
      <div className="font-mono text-5xl font-bold text-center mb-6">
        {formatTime()}
      </div>
      
      <div className="flex justify-center gap-3 mb-6">
        <Button 
          variant="default"
          onClick={() => setIsRunning(true)}
          disabled={isRunning}
        >
          Start
        </Button>
        
        <Button 
          variant="outline"
          onClick={() => setIsRunning(false)}
          disabled={!isRunning}
        >
          Pause
        </Button>
        
        <Button 
          variant="destructive"
          onClick={() => {
            setIsRunning(false);
            setTime(300);
          }}
        >
          Reset
        </Button>
      </div>
      
      <Progress value={calculateProgress()} className="h-2.5 mb-4" />
    </Card>
  );
}