import { useState } from 'react';

const PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD as string | undefined;
const STORAGE_KEY = 'smgo_unlocked';

function isUnlocked() {
  if (!PASSWORD) return true; // no password set = open
  try { return localStorage.getItem(STORAGE_KEY) === PASSWORD; } catch { return false; }
}

export default function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);

  if (unlocked) return <>{children}</>;

  const attempt = () => {
    if (input === PASSWORD) {
      try { localStorage.setItem(STORAGE_KEY, PASSWORD); } catch {}
      setUnlocked(true);
    } else {
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">StackMate Go</h1>
        <p className="text-muted-foreground text-lg">Something great is coming soon.</p>
      </div>

      <div className={`flex flex-col gap-3 w-full max-w-xs transition-transform ${shake ? 'animate-shake' : ''}`}>
        <input
          type="password"
          placeholder="Access code"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-center tracking-widest"
          autoFocus
        />
        <button
          onClick={attempt}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
