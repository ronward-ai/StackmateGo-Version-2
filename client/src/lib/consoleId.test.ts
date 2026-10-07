import { describe, it, expect, beforeEach } from 'vitest';
import { getConsoleId, subscribeConsoleId, __resetConsoleIdForTests } from './consoleId';
import { controlOf } from './directorControl';

/** A pretend BroadcastChannel shared by "tabs" in one test. */
function bus() {
  const members: any[] = [];
  return () => {
    const ch: any = {
      onmessage: null,
      postMessage(message: any) {
        for (const m of members) if (m !== ch) queueMicrotask(() => m.onmessage?.({ data: message }));
      },
    };
    members.push(ch);
    return ch;
  };
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe('consoleId (Oct Low)', () => {
  it('names the tab as well as the device, and keeps it across a reload', () => {
    __resetConsoleIdForTests();
    const first = getConsoleId();
    expect(first).toMatch(/^d_.+#t_.+$/);
    __resetConsoleIdForTests(); // a reload: sessionStorage survives
    expect(getConsoleId()).toBe(first);
  });

  it('a duplicated tab gives itself a new id and the original keeps its own', async () => {
    const make = bus();
    // The original tab.
    __resetConsoleIdForTests(make);
    const original = getConsoleId();
    // Simulate the original's listener staying alive: capture its channel by
    // starting a second "tab" with the copied sessionStorage on the same bus.
    // Our module holds one tab at a time, so drive the original by hand.
    const originalChannel = make();
    const originalTab = original.split('#')[1];
    originalChannel.onmessage = (e: any) => {
      if (e.data.type === 'hello' && e.data.id === originalTab) {
        originalChannel.postMessage({ type: 'taken', id: originalTab, nonce: e.data.nonce });
      }
    };
    let changed = 0;
    __resetConsoleIdForTests(make); // the duplicate starts with the same stored id
    subscribeConsoleId(() => { changed++; });
    expect(getConsoleId()).toBe(original);
    await new Promise(r => setTimeout(r, 0));
    expect(changed).toBe(1);
    expect(getConsoleId()).not.toBe(original);
    expect(getConsoleId().split('#')[0]).toBe(original.split('#')[0]);
  });
});

describe('controlOf across tabs (Oct Low)', () => {
  it('another tab on this device is somebody else', () => {
    expect(controlOf('d_1#t_a', 'd_1#t_b')).toBe('other');
    expect(controlOf('d_1#t_a', 'd_1#t_a')).toBe('mine');
  });

  it('a claim from before tabs counted reads as unclaimed on that device, other elsewhere', () => {
    expect(controlOf('d_1', 'd_1#t_a')).toBe('unclaimed');
    expect(controlOf('d_2', 'd_1#t_a')).toBe('other');
  });
});
