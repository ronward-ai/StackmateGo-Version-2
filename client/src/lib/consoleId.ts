import { getDeviceId } from '@/lib/deviceId';

/**
 * Which CONSOLE this is — the device AND the browser tab — for director
 * control (October audit, Low).
 *
 * Control was recorded by `getDeviceId()`, which every tab of a browser
 * shares, so two tabs on one laptop were both `mine` and both drove the game:
 * the "one writer per fact" rule the lock exists for, broken by a second tab.
 * The lock now names `<deviceId>#<tabId>`.
 *
 * The tab id lives in sessionStorage, so a RELOAD keeps it — a director who
 * refreshes the tab that holds control must still hold it. A DUPLICATED tab
 * copies sessionStorage too, so a duplicate starts with the original's id;
 * a BroadcastChannel probe catches that. Every console announces its id when
 * it starts, any console already using that id answers, and the newcomer
 * mints itself a fresh one — the original keeps the id, and with it control.
 *
 * Check-in (`PlayerClaimView`) still uses the bare device id: a seat claimed
 * on a player's phone belongs to the phone, not to a tab.
 */

const KEY = 'consoleTabId';
const CHANNEL = 'stackmate-console-id';

type Message = { type: 'hello' | 'taken'; id: string; nonce: string };

interface ChannelLike {
  postMessage(message: Message): void;
  onmessage: ((event: { data: Message }) => void) | null;
}

const mint = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let tabId: string | null = null;
let nonce = '';
let channel: ChannelLike | null = null;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
function store(id: string) {
  try { sessionStorage.setItem(KEY, id); } catch { /* memory is enough for this tab */ }
}

function defaultChannel(): ChannelLike | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    const ch = new BroadcastChannel(CHANNEL);
    // Node's channel holds the process open (tests); a browser has no unref.
    (ch as unknown as { unref?: () => void }).unref?.();
    return ch as unknown as ChannelLike;
  } catch {
    return null;
  }
}

function onMessage(message: Message) {
  if (!message || message.id !== tabId) return;
  if (message.type === 'hello' && message.nonce !== nonce) {
    // Somebody else has started with OUR id — a duplicated tab. Tell them.
    channel?.postMessage({ type: 'taken', id: message.id, nonce: message.nonce });
  } else if (message.type === 'taken' && message.nonce === nonce) {
    // We are the duplicate. The original keeps the id, and any control it holds.
    tabId = mint();
    store(tabId);
    listeners.forEach(l => l());
  }
}

function start(make: () => ChannelLike | null) {
  tabId = readStored() || mint();
  store(tabId);
  nonce = mint();
  channel = make();
  if (channel) {
    channel.onmessage = event => onMessage(event.data);
    channel.postMessage({ type: 'hello', id: tabId, nonce });
  }
}

export function getConsoleId(): string {
  if (tabId === null) start(defaultChannel);
  return `${getDeviceId()}#${tabId}`;
}

/** For useSyncExternalStore: the id changes once, if this tab was a duplicate. */
export function subscribeConsoleId(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only: start again with a given channel. */
export function __resetConsoleIdForTests(make: () => ChannelLike | null = () => null) {
  tabId = null;
  listeners.clear();
  start(make);
}
