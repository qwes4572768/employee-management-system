export type ColorTokens = {
  bg: string;
  bgElevated: string;
  bgCard: string;
  bgInput: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentMuted: string;
  accentText: string;
  electric: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
  hudLine: string;
  tabBar: string;
  statusBar: 'light' | 'dark';
};

export type ThemeMode = 'cyber' | 'outdoor' | 'night' | 'system';
export type ResolvedThemeMode = 'cyber' | 'outdoor' | 'night';
export type FontScale = 'standard' | 'large' | 'xlarge';

export const cyberColors: ColorTokens = {
  bg: '#05070B',
  bgElevated: '#0B1220',
  bgCard: '#101A2C',
  bgInput: '#0A1424',
  border: '#1E3A5F',
  borderStrong: '#2E6B9E',
  accent: '#00B8FF',
  accentMuted: 'rgba(0, 184, 255, 0.16)',
  accentText: '#041018',
  electric: '#3D8BFF',
  text: '#E8EEF7',
  textMuted: '#8B95A7',
  textSubtle: '#5C6778',
  danger: '#FF4D6A',
  success: '#3DFFB8',
  warning: '#FFC14D',
  overlay: 'rgba(2, 6, 12, 0.78)',
  hudLine: 'rgba(0, 184, 255, 0.35)',
  tabBar: '#070B14',
  statusBar: 'light',
};

export const outdoorColors: ColorTokens = {
  bg: '#F3F6FB',
  bgElevated: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgInput: '#EEF3FA',
  border: '#C5D0E0',
  borderStrong: '#4A7AB5',
  accent: '#005BBB',
  accentMuted: 'rgba(0, 91, 187, 0.12)',
  accentText: '#FFFFFF',
  electric: '#1D4ED8',
  text: '#0A1628',
  textMuted: '#3F4B5C',
  textSubtle: '#6B7789',
  danger: '#C81E3A',
  success: '#0F7B4C',
  warning: '#B45309',
  overlay: 'rgba(8, 16, 28, 0.45)',
  hudLine: 'rgba(0, 91, 187, 0.28)',
  tabBar: '#FFFFFF',
  statusBar: 'dark',
};

export const nightColors: ColorTokens = {
  bg: '#020308',
  bgElevated: '#070A12',
  bgCard: '#0A0E18',
  bgInput: '#080B14',
  border: '#1A2740',
  borderStrong: '#27405F',
  accent: '#3A8FBF',
  accentMuted: 'rgba(58, 143, 191, 0.12)',
  accentText: '#071018',
  electric: '#2F5F9A',
  text: '#B8C4D4',
  textMuted: '#6B7686',
  textSubtle: '#4A5564',
  danger: '#C45A6A',
  success: '#3AA87A',
  warning: '#C49A3A',
  overlay: 'rgba(0, 0, 0, 0.72)',
  hudLine: 'rgba(58, 143, 191, 0.22)',
  tabBar: '#05070C',
  statusBar: 'light',
};

export const fontScaleValues: Record<FontScale, number> = {
  standard: 1,
  large: 1.12,
  xlarge: 1.28,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
};

export const typeSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 34,
};

export type BrandingPreview = {
  companyName: string;
  companyShortName: string;
  logoUri: string | null;
  accentColor: string | null;
};
