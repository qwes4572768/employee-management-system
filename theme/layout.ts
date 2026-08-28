import { Dimensions } from 'react-native';

export const BREAKPOINTS = {
  compact: 0,
  medium: 600,
  expanded: 900,
  large: 1200,
} as const;

export type LayoutSize = 'compact' | 'medium' | 'expanded';

export function getLayoutSize(width: number): LayoutSize {
  if (width >= BREAKPOINTS.expanded) {
    return 'expanded';
  }
  if (width >= BREAKPOINTS.medium) {
    return 'medium';
  }
  return 'compact';
}

export function getContentMaxWidth(width: number): number {
  if (width >= BREAKPOINTS.large) {
    return 1120;
  }
  if (width >= BREAKPOINTS.expanded) {
    return 980;
  }
  if (width >= BREAKPOINTS.medium) {
    return 720;
  }
  return width;
}

export function getColumnCount(width: number, minColumnWidth = 280): number {
  const usable = Math.min(width, getContentMaxWidth(width));
  return Math.max(1, Math.min(4, Math.floor(usable / minColumnWidth)));
}

export function isLandscape(width?: number, height?: number): boolean {
  const window = Dimensions.get('window');
  const w = width ?? window.width;
  const h = height ?? window.height;
  return w > h;
}
