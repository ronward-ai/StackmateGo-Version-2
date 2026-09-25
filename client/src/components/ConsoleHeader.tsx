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
import { useIsOffscreen } from '@/hooks/useIsOffscreen';

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

  // The bottom edge is drawn only once something is actually sliding under the
  // bar. Unconditionally, it was a hairline under the logo on an unscrolled page
  // separating nothing — and, because the bar used to live inside the page's
  // max-w-4xl container, an 896px stub floating in the middle of a laptop screen
  // rather than the edge of a bar.
  //
  // A sentinel at the very top of the document answers "has this scrolled",
  // through the same IntersectionObserver hook the clock uses — no scroll
  // listener on a page that re-renders every second. It MUST pass rootMargin
  // '0px'; the hook's -8px default would call it off screen at rest.
  const { ref: topRef, offscreen: detached } = useIsOffscreen<HTMLDivElement>('0px');

  return (
    <>
      <div ref={topRef} aria-hidden="true" className="h-px -mb-px" />
      {/* Full bleed, with the row in its own container: the border and the
          blur run the width of the window while the wordmark and the account
          still line up with the cards below. */}
      <header
        className={`sticky top-0 z-40 border-b transition-colors bg-background/85 backdrop-blur-md ${
          detached ? 'border-border/50' : 'border-transparent'
        }`}
      >
        <div className="container mx-auto max-w-4xl px-4 h-14 flex items-center gap-3 overflow-hidden">
        {/* The WORDMARK, small and quiet — not the four-chip mark, which was
            tried first and does not survive this context. At 24-32px in the
            top-left corner of an app, four orange bars read as a hamburger
            menu, tile or no tile: exactly the association favicon.svg's own
            comment warns about, and the corner position is what sells it. The
            icon is right for a browser tab and an app tile and wrong here.

            24px and full opacity. It shipped at 16px and 80% aiming for
            "quiet" and landed on absent, which is a different thing.

            ON A PHONE THE LOGO STAYS AND THE EVENT NAME GOES — the opposite
            way round to how this first shipped. The arithmetic forces a choice
            rather than the outcome: the wordmark is 7.6:1, so 20px is 152px
            wide, and a 360px phone has 328 usable of which the status pill,
            the avatar and the gaps take ~166. The two cannot coexist. The
            event name was picked first and the director wanted the logo, which
            is their call to make about their own screen.

            Nothing is lost under way: the clock branch below replaces this
            whole cluster once the timer card is off screen, so a phone in play
            reads "Level 5 · 07:42" — the one thing worth that space. */}
        <img
          src="/stackmatelogo.svg"
          alt="StackMate Go"
          className="h-5 sm:h-6 w-auto flex-shrink-0"
        />
        {/* The divider separates the mark from the event name, so it keeps
            that name's company and goes when it goes. */}
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
            {/* The venue's logo belongs with the venue's NAME, so it hides at
                the same width. Left on a phone it would sit beside the
                StackMate wordmark with nothing to label, two marks competing
                for the row that just lost its text. */}
            {venueLogoUrl && (
              <img
                src={venueLogoUrl}
                alt={eventName || 'Event logo'}
                className={`hidden sm:block ${big ? 'h-8' : 'h-6'} w-auto object-contain flex-shrink-0`}
              />
            )}
            {eventName && (
              <h1
                className={`hidden sm:block ${big ? 'text-title' : 'text-body'} font-semibold text-foreground truncate`}
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
    </>
  );
}
