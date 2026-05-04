import { useState, useCallback, useEffect } from 'react';
import {
  LeagueSettings,
  PointsSystem,
  DEFAULT_LEAGUE_SETTINGS,
  PositionPoints,
  POINTS_SYSTEMS
} from '@/types/leagueSettings';
import { useAuth } from './useAuth';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { sanitizeForFirestore } from '@/lib/utils';

function loadFromStorage(storageKey: string): LeagueSettings {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return DEFAULT_LEAGUE_SETTINGS;
    }
    const saved = localStorage.getItem(storageKey);
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

  // Store saved settings from database
  const [savedSettings, setSavedSettings] = useState<Array<{
    id: string | number;
    name: string;
    settings: LeagueSettings;
    isDefault: boolean;
    leagueId?: string;
  }>>([]);

  const [settings, setSettings] = useState<LeagueSettings>(() => loadFromStorage(storageKey));

  // When the league context changes, reload settings from the scoped storage key
  useEffect(() => {
    setSettings(loadFromStorage(storageKey));
  }, [storageKey]);

  // Save settings to localStorage under the scoped key
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && settings) {
        localStorage.setItem(storageKey, JSON.stringify(settings));
      }
    } catch (error) {
      console.error('Failed to save league settings:', error);
    }
  }, [settings, storageKey]);

  // Listen for settings reload events
  useEffect(() => {
    const handleSettingsChange = () => {
      try {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem(storageKey);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!parsed.pointsSystem || !parsed.statsToTrack || !parsed.displaySettings) return;
        if (!parsed.pointsSystem.formula) return;
        setSettings(loadFromStorage(storageKey));
      } catch (error) {
        console.error('Failed to reload league settings:', error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('leagueSettingsChanged', handleSettingsChange);
      return () => window.removeEventListener('leagueSettingsChanged', handleSettingsChange);
    }
  }, [storageKey]);

  // Calculate points based on current points system
  const calculatePoints = useCallback((
    position: number, 
    totalPlayers: number, 
    knockouts: number = 0,
    buyIn: number = 0,
    totalCost: number = 0,
    prizepool: number = 0
  ): number => {
    try {
      if (!settings?.pointsSystem?.formula) {
        return 0;
      }

      const { formula } = settings.pointsSystem;

      switch (formula.type) {
        case 'logarithmic': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.5;
          const points = baseMultiplier * Math.log(totalPlayers - position + 2);
          return position === 1
            ? Math.floor(points * winnerMultiplier)
            : Math.floor(points);
        }

        case 'squareRoot': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.2;
          const points = baseMultiplier * Math.sqrt(totalPlayers - position + 1);
          return position === 1
            ? Math.floor(points * winnerMultiplier)
            : Math.floor(points);
        }

        case 'linear': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.0;
          const points = baseMultiplier * (totalPlayers - position + 1);
          return position === 1
            ? Math.floor(points * winnerMultiplier)
            : Math.floor(points);
        }

        case 'fixed': {
          return formula.positionPoints?.[position - 1] ?? formula.fixedPoints ?? 0;
        }

        case 'custom': {
          if (!formula.customFormula?.trim()) {
            return 0;
          }

          try {
            // Create safe evaluation context with variables
            const safeEval = new Function(
              'f', 'p', 'k', 'b', 'c', 'z',
              'position', 'totalPlayers', 'knockouts', 'buyIn', 'totalCost', 'prizepool',
              'Math', 
              `"use strict"; return (${formula.customFormula})`
            );
            const result = safeEval(
              position, totalPlayers, knockouts, buyIn, totalCost, prizepool,
              position, totalPlayers, knockouts, buyIn, totalCost, prizepool,
              Math
            );

            const num = Number(result);
            if (isNaN(num)) return 0;
            return Math.max(0, Math.floor(num));
          } catch (error) {
            console.error('Error evaluating custom formula:', error, 'Formula:', formula.customFormula);
            return 0;
          }
        }

        default:
          return 0;
      }
    } catch (error) {
      console.error('Error calculating points:', error);
      return 0;
    }
  }, [settings]);

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

  // Load saved settings from database — scoped to this league when leagueId is provided.
  // Legacy docs with no leagueId are only used as a fallback when no league-scoped docs exist.
  useEffect(() => {
    if (!targetOwnerId) return;

    const q = query(collections.leagueSettings, where('userId', '==', targetOwnerId));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        if (leagueId) {
          const forThisLeague = data.filter(s => s.leagueId === leagueId);
          const legacy = data.filter(s => !s.leagueId);
          const scoped = forThisLeague.length > 0 ? forThisLeague : legacy;
          setSavedSettings(scoped);

          const defaultSettings = scoped.find((s: any) => s.isDefault);
          if (defaultSettings) {
            setSettings(defaultSettings.settings);
          }
        } else {
          setSavedSettings(data);
          const defaultSettings = data.find((s: any) => s.isDefault);
          if (defaultSettings) {
            setSettings(defaultSettings.settings);
          }
        }
      } catch (error) {
        console.error('Error processing settings snapshot:', error);
      }
    }, (error) => {
      console.error('Failed to load saved settings:', error);
    });

    return () => unsubscribe();
  }, [targetOwnerId, leagueId]);

  const loadSavedSettings = useCallback(async () => {
    // no-op: settings are kept in sync by the real-time Firestore listener above
  }, []);

  // Save settings to database — upserts the existing default doc when isDefault is true.
  // Accepts an optional settingsToSave to avoid stale closure when called right after updateSettings().
  const saveSettingsToDatabase = useCallback(async (name: string, isDefault: boolean = false, settingsToSave?: LeagueSettings) => {
    if (!user?.id) return;

    const toSave = settingsToSave ?? settings;

    try {
      if (isDefault) {
        // Find existing default doc scoped to this league (or unscoped legacy) and update it
        const existingDefault = savedSettings.find(s =>
          s.isDefault && (leagueId ? s.leagueId === leagueId : !s.leagueId)
        );
        if (existingDefault) {
          await setDoc(
            doc(db, 'leagueSettings', String(existingDefault.id)),
            sanitizeForFirestore({
              userId: user.id,
              leagueId: leagueId ?? null,
              name: existingDefault.name,
              settings: toSave,
              isDefault: true,
              updatedAt: serverTimestamp()
            }),
            { merge: true }
          );
          return;
        }
      }

      // No existing doc — create a new one
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