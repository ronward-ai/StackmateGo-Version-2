import { useState, useCallback, useEffect, useRef } from 'react';
import { withBonuses } from '@/lib/pointsBonuses';
import { bandsOf, pointsForBand } from '@/lib/pointsBands';
import { evaluateFormula } from '@/lib/formulaEval';
import { defaultSettingsDocId } from '@/lib/leagueSettingsId';
import {
  LeagueSettings,
  PointsSystem,
  DEFAULT_LEAGUE_SETTINGS,
  PositionPoints,
  POINTS_SYSTEMS
} from '@/types/leagueSettings';
import { useAuth } from './useAuth';
import { lastSignedInUid, readScoped, writeScoped } from '@/lib/scopedStorage';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { sanitizeForFirestore } from '@/lib/utils';
import { useSharedSnapshot } from '@/lib/sharedSnapshot';

/** Stable empty reference — required by useSharedSnapshot. */
const EMPTY_SETTINGS_DOCS: any[] = [];

function loadFromStorage(storageKey: string, uid: string | null): LeagueSettings {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return DEFAULT_LEAGUE_SETTINGS;
    }
    const saved = readScoped(storageKey, uid);
    if (!saved) return DEFAULT_LEAGUE_SETTINGS;

    const parsed = JSON.parse(saved);
    if (!parsed.pointsSystem || !parsed.statsToTrack || !parsed.displaySettings) return DEFAULT_LEAGUE_SETTINGS;
    if (!parsed.pointsSystem.formula) return DEFAULT_LEAGUE_SETTINGS;

    return {
      ...DEFAULT_LEAGUE_SETTINGS,
      ...parsed,
      statsToDisplay: {
        ...DEFAULT_LEAGUE_SETTINGS.statsToDisplay,
        ...parsed.statsToDisplay
      },
      pointsSystem: {
        ...DEFAULT_LEAGUE_SETTINGS.pointsSystem,
        ...parsed.pointsSystem,
        formula: { ...parsed.pointsSystem.formula }
      }
    };
  } catch (error) {
    console.error('Failed to load league settings:', error);
    return DEFAULT_LEAGUE_SETTINGS;
  }
}

export function useLeagueSettings(overrideOwnerId?: string, leagueId?: string | null) {
  const { user, isAnonymous } = useAuth();

  const targetOwnerId = overrideOwnerId || (isAnonymous ? null : user?.id);
  const storageKey = leagueId ? `leagueSettings:${leagueId}` : 'leagueSettings';

  // The cache is per account as well as per league — see lib/scopedStorage.ts.
  // A league id alone was not enough: two accounts on one browser shared the
  // bare `leagueSettings` key outright, so a second director inherited the
  // first one's points system before Firestore had said anything.
  const storageUid = isAnonymous ? null : (user?.id ?? lastSignedInUid());

  // Two shapes of read, not one. `overrideOwnerId` set means "show me a
  // SPECIFIC director's current settings" — the participant view, or the
  // console's own read-only displays (RealTimeLeagueTable, calculatePoints
  // call sites) — and fetches exactly one document by its deterministic id.
  // Absent means "I am managing MY OWN settings" — the League Settings
  // dialog — which genuinely needs to list every saved doc (templates
  // included), and is scoped to the caller's own account by the rule.
  const isParticipantRead = !!overrideOwnerId;

  // Store saved settings from database
  const [savedSettings, setSavedSettings] = useState<Array<{
    id: string | number;
    name: string;
    settings: LeagueSettings;
    isDefault: boolean;
    leagueId?: string;
  }>>([]);

  const [settings, setSettings] = useState<LeagueSettings>(() => loadFromStorage(storageKey, storageUid));

  // Always-current ref so calculatePoints never reads a stale closure value
  const settingsRef = useRef<LeagueSettings>(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // When the league context changes, reload settings from the scoped storage key
  useEffect(() => {
    setSettings(loadFromStorage(storageKey, storageUid));
  }, [storageKey, storageUid]);

  // Save settings to localStorage under the scoped key
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && settings) {
        writeScoped(storageKey, JSON.stringify(settings), storageUid);
      }
    } catch (error) {
      console.error('Failed to save league settings:', error);
    }
  }, [settings, storageKey, storageUid]);

  // Listen for settings reload events
  useEffect(() => {
    const handleSettingsChange = () => {
      try {
        if (typeof window === 'undefined') return;
        const saved = readScoped(storageKey, storageUid);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!parsed.pointsSystem || !parsed.statsToTrack || !parsed.displaySettings) return;
        if (!parsed.pointsSystem.formula) return;
        setSettings(loadFromStorage(storageKey, storageUid));
      } catch (error) {
        console.error('Failed to reload league settings:', error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('leagueSettingsChanged', handleSettingsChange);
      return () => window.removeEventListener('leagueSettingsChanged', handleSettingsChange);
    }
  }, [storageKey, storageUid]);

  // Calculate points based on current points system.
  // Reads from settingsRef so this callback is always stable and never stale —
  // safe to call even when React hasn't yet re-rendered with new settings.
  const calculatePoints = useCallback((
    position: number,
    totalPlayers: number,
    knockouts: number = 0,
    buyIn: number = 0,
    totalCost: number = 0,
    prizepool: number = 0
  ): number => {
    try {
      const currentSettings = settingsRef.current;
      if (!currentSettings?.pointsSystem?.formula) {
        return 0;
      }
      // The bonuses ride on top of every scheme, custom included — see
      // lib/pointsBonuses.ts. They were declared on the type and read by
      // nobody, so wanting points per knockout meant writing a formula.
      const bonuses = currentSettings.pointsSystem.formula;

      const { formula } = currentSettings.pointsSystem;

      switch (formula.type) {
        case 'logarithmic': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.5;
          const points = baseMultiplier * Math.log(totalPlayers - position + 2);
          return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
        }

        case 'squareRoot': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.2;
          const points = baseMultiplier * Math.sqrt(totalPlayers - position + 1);
          return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
        }

        case 'linear': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.0;
          const points = baseMultiplier * (totalPlayers - position + 1);
          return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
        }

        case 'fixed': {
          // Bands, which a stored positionPoints array converts into on read —
          // see lib/pointsBands.ts. `fixedPoints` is the older-still shape and
          // only answers when there is nothing else at all.
          const bands = bandsOf(formula);
          const points = bands.length
            ? pointsForBand(bands, position, totalPlayers)
            : (formula.fixedPoints ?? 0);
          return withBonuses(points, knockouts, bonuses);
        }

        case 'custom': {
          if (!formula.customFormula?.trim()) {
            return withBonuses(0, knockouts, bonuses);
          }

          // lib/formulaEval.ts, not new Function. This ran a director's stored
          // string through the JS engine directly, and RealTimeLeagueTable
          // loads the DIRECTOR's settings and scores with them in the
          // PARTICIPANT's browser by design — so any signed-in director could
          // put arbitrary JavaScript in a points formula and have it execute
          // on this origin in every visitor's browser. The parser can only
          // ever produce arithmetic; there is no path from a formula string to
          // executing anything, however the string is contrived.
          const evaluation = evaluateFormula(formula.customFormula, {
            position, totalPlayers, knockouts, buyIn, totalCost, prizepool,
          });
          if (evaluation.ok === false) {
            console.error('Error evaluating custom formula:', evaluation.error, 'Formula:', formula.customFormula);
            return 0;
          }
          return withBonuses(evaluation.value, knockouts, bonuses);
        }

        default:
          return 0;
      }
    } catch (error) {
      console.error('Error calculating points:', error);
      return 0;
    }
  // settingsRef is stable; no deps needed — reads always go through the ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update entire settings
  const updateSettings = useCallback((newSettings: LeagueSettings) => {
    setSettings(newSettings);
  }, []);

  // Update specific parts of settings
  const updatePointsSystem = useCallback((pointsSystem: PointsSystem) => {
    setSettings(prev => ({ ...prev, pointsSystem }));
  }, []);

  const updateStatsToTrack = useCallback((statsToTrack: LeagueSettings['statsToTrack']) => {
    setSettings(prev => ({ ...prev, statsToTrack }));
  }, []);

  const updateStatsToDisplay = useCallback((statsToDisplay: Partial<LeagueSettings['statsToDisplay']>) => {
    setSettings(prev => ({
      ...prev,
      statsToDisplay: {
        ...prev.statsToDisplay,
        ...statsToDisplay
      }
    }));
  }, []);

  const updateDisplaySettings = useCallback((displaySettings: LeagueSettings['displaySettings']) => {
    setSettings(prev => ({ ...prev, displaySettings }));
  }, []);

  const updateSeasonSettings = useCallback((seasonSettings: LeagueSettings['seasonSettings']) => {
    setSettings(prev => ({ ...prev, seasonSettings }));
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_LEAGUE_SETTINGS);
  }, []);

  // Update custom formula
  const updateCustomFormula = useCallback((formula: string) => {
    setSettings(prev => ({
      ...prev,
      pointsSystem: {
        ...prev.pointsSystem,
        formula: {
          ...prev.pointsSystem.formula,
          customFormula: formula
        }
      }
    }));
  }, []);

  // Set a predefined points system
  const setPointsSystemType = useCallback((type: keyof typeof POINTS_SYSTEMS) => {
    const systemTemplate = POINTS_SYSTEMS[type] as any;
    setSettings(prev => {
      const newPointsSystem = { ...systemTemplate };

      // If switching to custom type, try to restore the previous custom formula
      if (type === 'custom') {
        // First try to get from current settings if switching back
        if (prev.pointsSystem.formula.type === 'custom' && prev.pointsSystem.formula.customFormula) {
          newPointsSystem.formula = {
            ...newPointsSystem.formula,
            customFormula: prev.pointsSystem.formula.customFormula as string
          };
        } else {
          // Try to restore the most recent custom formula from database
          const recentCustomSettings = savedSettings.find(s =>
            s.settings.pointsSystem.formula.type === 'custom' &&
            s.settings.pointsSystem.formula.customFormula
          );

          if (recentCustomSettings) {
            newPointsSystem.formula = {
              ...newPointsSystem.formula,
              customFormula: recentCustomSettings.settings.pointsSystem.formula.customFormula as string
            };
          }
        }
      }

      return {
        ...prev,
        pointsSystem: newPointsSystem
      };
    });
  }, [savedSettings]);

  // The director's OWN list of saved settings, templates included. Never
  // used for a participant's read (see isParticipantRead above) — the rule
  // only grants `list` to the account that owns the documents, so this key
  // stays idle (null) for anyone reading someone else's settings.
  //
  // Keyed only by userId, so every instance for the same owner shares one
  // listener even when their leagueIds differ — the league scoping below is
  // applied locally.
  const { data: settingsDocs } = useSharedSnapshot<any[]>(
    (!isParticipantRead && targetOwnerId) ? `leagueSettings:${targetOwnerId}` : null,
    (emit, fail) => onSnapshot(
      query(collections.leagueSettings, where('userId', '==', targetOwnerId)),
      snap => emit(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]),
      error => { console.error('Failed to load saved settings:', error); fail(error); },
    ),
    EMPTY_SETTINGS_DOCS,
  );

  // Scope to this league when leagueId is provided. Legacy docs with no leagueId
  // are only used as a fallback when no league-scoped docs exist.
  useEffect(() => {
    if (isParticipantRead || !targetOwnerId) return;
    try {
      let scoped = settingsDocs;
      if (leagueId) {
        const forThisLeague = settingsDocs.filter(s => s.leagueId === leagueId);
        scoped = forThisLeague.length > 0 ? forThisLeague : settingsDocs.filter(s => !s.leagueId);
      }
      setSavedSettings(scoped);

      const defaultSettings = scoped.find((s: any) => s.isDefault);
      if (defaultSettings) {
        setSettings(defaultSettings.settings);
      }
    } catch (error) {
      console.error('Error processing settings snapshot:', error);
    }
  }, [settingsDocs, leagueId, targetOwnerId, isParticipantRead]);

  // A participant — or the console's own read-only displays — reads exactly
  // the one document they need, by its deterministic id. Public get, no
  // session required; never a list, so this can never enumerate another
  // director's settings.
  const { data: remoteDefaultDoc } = useSharedSnapshot<{ settings: LeagueSettings } | null>(
    (isParticipantRead && targetOwnerId)
      ? `leagueSettingsDoc:${defaultSettingsDocId(targetOwnerId, leagueId ?? null)}`
      : null,
    (emit, fail) => onSnapshot(
      doc(db, 'leagueSettings', defaultSettingsDocId(targetOwnerId as string, leagueId ?? null)),
      snap => emit(snap.exists() ? (snap.data() as any) : null),
      error => { console.error('Failed to load settings:', error); fail(error); },
    ),
    null,
  );

  useEffect(() => {
    if (!isParticipantRead) return;
    // Normalised on read: a league whose director has not saved settings
    // since default settings moved to this id scheme has no document here
    // yet, and falls back to defaults — the SAME degradation this hook
    // already had for a settings read that failed outright. Nothing is
    // migrated; the next time the director saves, the doc appears here.
    setSettings(remoteDefaultDoc ? remoteDefaultDoc.settings : DEFAULT_LEAGUE_SETTINGS);
  }, [remoteDefaultDoc, isParticipantRead]);

  const loadSavedSettings = useCallback(async () => {
    // no-op: settings are kept in sync by the real-time Firestore listener above
  }, []);

  // Save settings to database.
  // Accepts an optional settingsToSave to avoid stale closure when called right after updateSettings().
  const saveSettingsToDatabase = useCallback(async (name: string, isDefault: boolean = false, settingsToSave?: LeagueSettings) => {
    if (!user?.id) return;

    const toSave = settingsToSave ?? settings;

    try {
      if (isDefault) {
        // The CURRENT settings for a league always write to the deterministic
        // id — see lib/leagueSettingsId.ts — never to an auto-generated one,
        // because that id is what makes a participant's get() work without
        // this collection needing to be listable by strangers.
        const targetId = defaultSettingsDocId(user.id, leagueId ?? null);

        // Found by CONTENT (isDefault + league scope), not by id, so this
        // still finds a pre-migration doc sitting under its old auto-generated
        // id the first time a league is saved after this shipped.
        const existingDefault = savedSettings.find(s =>
          s.isDefault && (leagueId ? s.leagueId === leagueId : !s.leagueId)
        );

        const payload: Record<string, unknown> = {
          userId: user.id,
          leagueId: leagueId ?? null,
          name: existingDefault?.name ?? name,
          settings: toSave,
          isDefault: true,
          updatedAt: serverTimestamp(),
        };
        // Only set createdAt when there is nothing to preserve it from — an
        // explicit key here, even undefined, would sanitizeForFirestore into
        // null and OVERWRITE a real createdAt on every subsequent save.
        if (!existingDefault) payload.createdAt = serverTimestamp();

        await setDoc(doc(db, 'leagueSettings', targetId), sanitizeForFirestore(payload), { merge: true });

        // Migrate off an old auto-id doc for this league, if one was found —
        // a director who saved before this shipped. Leaving it would cost
        // nothing on its own (get-only reads never see it, and it is no
        // longer listed as a match once the new doc exists) — deleted anyway
        // so the director's own list-based lookup above can never find TWO
        // "isDefault" docs for the same league at once.
        if (existingDefault && String(existingDefault.id) !== targetId) {
          deleteDoc(doc(db, 'leagueSettings', String(existingDefault.id))).catch(() => {});
        }
        return;
      }

      // Templates (and any non-default save) keep an auto-generated id —
      // there can legitimately be many per director, and none of them are
      // ever read by a participant.
      const newSetting = sanitizeForFirestore({
        userId: user.id,
        leagueId: leagueId ?? null,
        name,
        settings: toSave,
        isDefault,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const docRef = await addDoc(collections.leagueSettings, newSetting);

      const savedSetting = {
        id: docRef.id,
        ...newSetting
      };

      setSavedSettings(prev => [...prev, savedSetting as any]);
    } catch (error) {
      console.error('Error saving settings to database:', error);
    }
  }, [settings, user?.id, leagueId, savedSettings]);

  // Load settings from database by ID
  const loadSettingsFromDatabase = useCallback((settingId: string | number) => {
    const savedSetting = savedSettings.find(s => s.id === settingId);
    if (savedSetting) {
      setSettings(savedSetting.settings);
    }
  }, [savedSettings]);

  // Delete settings from database
  const deleteSettingsFromDatabase = useCallback(async (settingId: string | number) => {
    if (!user?.id) return;

    try {
      await deleteDoc(doc(db, 'leagueSettings', String(settingId)));
      setSavedSettings(prev => prev.filter(s => s.id !== settingId));
    } catch (error) {
      console.error('Error deleting settings from database:', error);
    }
  }, [user?.id]);

  // Save custom formula as a template
  const saveCustomFormulaTemplate = useCallback(async (formulaName: string, formula: string) => {
    if (!user?.id) return;

    const templateSettings = {
      ...DEFAULT_LEAGUE_SETTINGS,
      pointsSystem: {
        ...DEFAULT_LEAGUE_SETTINGS.pointsSystem,
        ...POINTS_SYSTEMS.custom,
        formula: {
          ...POINTS_SYSTEMS.custom.formula,
          customFormula: formula
        }
      }
    };

    try {
      const newSetting = sanitizeForFirestore({
        userId: user.id,
        leagueId: leagueId ?? null,
        name: `Custom Formula: ${formulaName}`,
        settings: templateSettings,
        isDefault: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const docRef = await addDoc(collections.leagueSettings, newSetting);

      const savedTemplate = {
        id: docRef.id,
        ...newSetting
      };

      setSavedSettings(prev => [...prev, savedTemplate as any]);
      return savedTemplate;
    } catch (error) {
      console.error('Error saving custom formula template:', error);
    }
  }, [user?.id, leagueId]);

  // Get saved custom formulas
  const getSavedCustomFormulas = useCallback(() => {
    return savedSettings.filter(s =>
      s.name.startsWith('Custom Formula:') &&
      s.settings.pointsSystem.formula.type === 'custom'
    );
  }, [savedSettings]);

  // Load settings from database when user changes
  useEffect(() => {
    if (targetOwnerId) {
      loadSavedSettings();
    }
  }, [targetOwnerId, loadSavedSettings]);

  // Update formula parameters for algorithmic systems
  const updateFormulaParameter = useCallback((param: string, value: number | number[]) => {
    const currentFormula = settings.pointsSystem.formula;
    updatePointsSystem({
      ...settings.pointsSystem,
      formula: {
        ...currentFormula,
        [param]: value
      }
    });
  }, [settings.pointsSystem, updatePointsSystem]);

  // Placeholder functions for export/import/save/delete custom formula, and reload settings.
  // These would need actual implementation based on your application's logic.
  const exportSettings = useCallback(() => {
    // Export settings functionality
  }, []);

  const importSettings = useCallback(() => {
    // Import settings functionality
  }, []);

  const saveCustomFormula = useCallback((formulaName: string, formula: string) => {
    // Logic to save custom formula
  }, []);

  const deleteCustomFormula = useCallback((formulaId: string) => {
    // Logic to delete custom formula
  }, []);

  const reloadSettings = useCallback(() => {
    // Logic to reload settings, potentially from localStorage or a default state
    setSettings(DEFAULT_LEAGUE_SETTINGS); // Example: reset to default
  }, []);


  return {
    settings,
    savedSettings,
    calculatePoints,
    updateSettings,
    updatePointsSystem,
    updateStatsToTrack,
    updateStatsToDisplay,
    updateDisplaySettings,
    updateSeasonSettings,
    resetToDefaults,
    updateCustomFormula,
    setPointsSystemType,
    availablePointsSystems: POINTS_SYSTEMS,
    updateFormulaParameter,
    saveSettingsToDatabase,
    loadSettingsFromDatabase,
    deleteSettingsFromDatabase,
    loadSavedSettings,
    saveCustomFormulaTemplate,
    getSavedCustomFormulas
  };
}