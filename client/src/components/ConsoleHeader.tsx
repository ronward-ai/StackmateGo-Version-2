import { useState } from 'react';
import { UserCircle, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import TournamentStatusChip from '@/components/TournamentStatusChip';

/**
 * The account control: a circled initial, not a button competing with the
 * controls that actually run the game.
 *
 * It lived in PokerTimer.tsx as a local `UserMenu` and was an outline button of
 * the same weight as every real control on the screen — the sole counterweight
 * to a logo, which is a layout job an account menu should not be doing.
 *
 * Signed out it stays a real Sign In BUTTON. That is a call to action rather
 * than a status, and it is the one thing on this screen a signed-out director
 * needs to find.
 */
function AccountControl() {
  const { user, isAuthenticated, isAnonymous, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // A full page load, deliberately. Logging out is how a game is handed on,
      // so nothing of this director's session may survive it: the console runs
      // from in-memory state that logging out does not clear, and on signing
      // back in the player-sync effect would push that stale state over
      // whatever the next director had done.
      //
      // ?home=1 then suppresses the pin redirect and the resume, so the device
      // lands on a clean home screen. The game itself is safe in Firestore and
      // comes back on the next sign-in.
      window.location.href = '/?home=1';
    }
  };

  const displayName =
    user && ('playerName' in user ? user.playerName : user.firstName || user.name || user.email || 'Account');
  const initial = (displayName || 'A').trim().charAt(0).toUpperCase();

  if (!isAuthenticated || isAnonymous) {
    return (
      <>
        <Button onClick={() => setShowAuthModal(true)} size="sm">
          <User className="mr-2 h-4 w-4" />
          Sign In
        </Button>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Account: ${displayName}`}
          className="h-8 w-8 flex-shrink-0 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold text-label flex items-center justify-center hover:bg-primary/25 transition-colors"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      {/* Tokens, not hard-coded greys. This menu spelled bg-gray-800 /
          border-gray-700, which is the same habit as the .btn-* gradients. */}
      <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
        <div className="px-3 py-2 border-b border-border">
          <div className="font-medium text-foreground text-label truncate">
            {user && ('playerName' in user
              ? user.playerName
              : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || 'User'))}
          </div>
          {user && !('playerName' in user) && user.email && (
            <div className="text-caption text-muted-foreground mt-0.5 truncate">{user.email}</div>
          )}
        </div>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-400 focus:text-red-300 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The top of the director's console.
 *
 * It was a StackMate wordmark, the tagline "Your poker night, sorted." and an
 * outline Account button — with the VENUE's logo and event name centred
 * underneath, smaller. Two brands competing, and the wrong one winning: on the
 * night, the thing that matters is whose game this is. The tagline belongs on
 * the landing page, which now has one.
 *
 * So: the event is the headline, StackMate is the four-chip mark, and the strip
 * finally carries STATUS — which used to sit in a card halfway down the page
 * while the most valuable space on the screen held a link to sign out.
 *
 * **The clock replaces the event name rather than joining it.** On a phone
 * there is not room for both, and once the timer card is off screen the clock
 * is the thing wanted. It is the SAME clock: `formatTime` from the tournament
 * hook, not a second derivation — see `hooks/useIsOffscreen.ts` for why the two
 * are never visible at once.
 *
 * `branding.isVisible` still means something: with it on, the venue's logo and
 * name render larger. It is the one place either is stated, so nothing can
 * disagree with it.
 */
export default function ConsoleHeader({
  eventName,
  venueLogoUrl,
  brandingVisible,
  syncBlocked,
  isLive,
  clock,
  levelLabel,
}: {
  eventName?: string;
  venueLogoUrl?: string;
  brandingVisible?: boolean;
  syncBlocked?: boolean;
  isLive?: boolean;
  /** Set only while the timer card is off screen. */
  clock?: string | null;
  levelLabel?: string | null;
}) {
  const showClock = !!clock;
  const big = brandingVisible === true;

  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 mb-4 border-b border-border/50 bg-background/85 backdrop-blur-md">
      <div className="h-14 flex items-center gap-3 overflow-hidden">
        {/* The WORDMARK, small and quiet — not the four-chip mark, which was
            tried first and does not survive this context. At 24-32px in the
            top-left corner of an app, four orange bars read as a hamburger
            menu, tile or no tile: exactly the association favicon.svg's own
            comment warns about, and the corner position is what sells it. The
            icon is right for a browser tab and an app tile and wrong here.

            16px is the point of the size: the product's name belongs on this
            screen, but quietly, because whoever is looking at it is already
            inside the product and cares about whose game this is. */}
        <img
          src="/stackmatelogo.svg"
          alt="StackMate Go"
          className="h-4 w-auto flex-shrink-0 opacity-80"
        />
        <span className="hidden sm:block h-5 w-px bg-border flex-shrink-0" aria-hidden="true" />

        {showClock ? (
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            {levelLabel && (
              <span className="text-label text-muted-foreground whitespace-nowrap">{levelLabel}</span>
            )}
            <span className="font-mono text-title font-semibold text-foreground tabular-nums">
              {clock}
            </span>
          </div>
        ) : (
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            {venueLogoUrl && (
              <img
                src={venueLogoUrl}
                alt={eventName || 'Event logo'}
                className={`${big ? 'h-8' : 'h-6'} w-auto object-contain flex-shrink-0`}
              />
            )}
            {eventName && (
              <h1
                className={`${big ? 'text-title' : 'text-body'} font-semibold text-foreground truncate`}
              >
                {eventName}
              </h1>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
          <TournamentStatusChip syncBlocked={syncBlocked} isLive={isLive} />
          <AccountControl />
        </div>
      </div>
    </header>
  );
}
