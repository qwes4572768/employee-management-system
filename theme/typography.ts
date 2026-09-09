import type { ColorValue, TextStyle } from 'react-native';

import { fontScaleValues, typeSizes, type ColorTokens, type FontScale } from './tokens';

export function scaledSize(size: number, scale: FontScale): number {
  return Math.round(size * fontScaleValues[scale]);
}

export function textStyle(
  colors: ColorTokens,
  scale: FontScale,
  size: keyof typeof typeSizes,
  extra?: TextStyle,
): TextStyle {
  return {
    color: colors.text,
    fontSize: scaledSize(typeSizes[size], scale),
    includeFontPadding: false,
    ...extra,
  };
}

export function withAlpha(color: string, alpha: number): ColorValue {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
