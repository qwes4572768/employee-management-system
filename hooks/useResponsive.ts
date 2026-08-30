import { useWindowDimensions } from 'react-native';

import { getColumnCount, getContentMaxWidth, getLayoutSize, isLandscape } from '@/theme/layout';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const size = getLayoutSize(width);
  return {
    width,
    height,
    size,
    landscape: isLandscape(width, height),
    contentMaxWidth: getContentMaxWidth(width),
    columns: getColumnCount(width),
    isTablet: size !== 'compact',
    isCompact: size === 'compact',
  };
}
