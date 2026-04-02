import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";

export default function TimerTest() {
  const [count, setCount] = useState(100);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: number | null = null;

    if (isRunning) {
      timer = window.setInterval(() => {
        setCount(prev => {
          if (prev <= 0) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning]);

  const startTimer = () => {
    console.log("Starting test timer");
    setIsRunning(true);
  };

  const stopTimer = () => {
    console.log("Stopping test timer");
    setIsRunning(false);
  };

  const resetTimer = () => {
    console.log("Resetting test timer");
    setIsRunning(false);
    setCount(100);
  };

  return (
    <div className="p-6 border rounded-lg mb-6 flex flex-col items-center justify-center bg-card shadow-md">
      <h2 className="text-xl font-bold mb-4">Timer Test</h2>

      <div className="text-5xl font-mono font-bold mb-6">
        {count}
      </div>

      <div className="flex gap-2">
        <Button 
          variant="default"
          onClick={startTimer}
          disabled={isRunning}
        >
          Start
        </Button>

        <Button 
          variant="outline"
          onClick={stopTimer}
          disabled={!isRunning}
        >
          Pause
        </Button>

        <Button 
          {...commonButtons.resetTimer}
          onClick={resetTimer}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}