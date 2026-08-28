import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';

import { THEME_PREFS_KEY } from '@/constants/app';
import {
  cyberColors,
  nightColors,
  outdoorColors,
  type BrandingPreview,
  type ColorTokens,
  type FontScale,
  type ResolvedThemeMode,
  type ThemeMode,
} from '@/theme/tokens';

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  colors: ColorTokens;
  fontScale: FontScale;
  reduceMotion: boolean;
  branding: BrandingPreview;
  setMode: (mode: ThemeMode) => void;
  setFontScale: (scale: FontScale) => void;
  setBranding: (branding: BrandingPreview) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(mode: ThemeMode, system: string | null | undefined): ResolvedThemeMode {
  if (mode === 'system') {
    return system === 'light' ? 'outdoor' : 'cyber';
  }
  return mode;
}

function colorsFor(mode: ResolvedThemeMode): ColorTokens {
  if (mode === 'outdoor') {
    return outdoorColors;
  }
  if (mode === 'night') {
    return nightColors;
  }
  return cyberColors;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('cyber');
  const [fontScale, setFontScaleState] = useState<FontScale>('standard');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [branding, setBranding] = useState<BrandingPreview>({
    companyName: '勤管系統',
    companyShortName: '勤管',
    logoUri: null,
    accentColor: null,
  });

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(THEME_PREFS_KEY);
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { mode?: ThemeMode; fontScale?: FontScale };
        if (parsed.mode) {
          setModeState(parsed.mode);
        }
        if (parsed.fontScale) {
          setFontScaleState(parsed.fontScale);
        }
      } catch {
        // ignore corrupt prefs
      }
    })();
  }, []);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => sub.remove();
  }, []);

  const persist = useCallback(async (nextMode: ThemeMode, nextScale: FontScale) => {
    await AsyncStorage.setItem(
      THEME_PREFS_KEY,
      JSON.stringify({ mode: nextMode, fontScale: nextScale }),
    );
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      void persist(next, fontScale);
    },
    [fontScale, persist],
  );

  const setFontScale = useCallback(
    (next: FontScale) => {
      setFontScaleState(next);
      void persist(mode, next);
    },
    [mode, persist],
  );

  const resolvedMode = resolveMode(mode, system);
  const colors = colorsFor(resolvedMode);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      colors,
      fontScale,
      reduceMotion,
      branding,
      setMode,
      setFontScale,
      setBranding,
    }),
    [mode, resolvedMode, colors, fontScale, reduceMotion, branding, setMode, setFontScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('ThemeProvider 尚未就緒');
  }
  return ctx;
}

export { Appearance };
