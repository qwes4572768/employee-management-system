import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Site } from '@/types';

interface SiteSwitcherProps {
  visible: boolean;
  sites: Site[];
  currentId?: string | null;
  onClose: () => void;
  onSelect: (siteId: string) => void;
}

export function SiteSwitcher({ visible, sites, currentId, onClose, onSelect }: SiteSwitcherProps) {
  const { colors, fontScale } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={[styles.sheet, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800', marginBottom: spacing.md })}>
            切換案場
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {sites.length === 0 ? (
              <EmptyState title="尚未授權案場" subtitle="請由主管指派可進入的案場" icon="business-outline" />
            ) : (
              sites.map((site) => (
                <ListRow
                  key={site.id}
                  title={site.name}
                  subtitle={site.address ?? site.siteCode}
                  meta={site.id === currentId ? '目前' : site.status === 'active' ? '可進入' : '停用'}
                  onPress={() => {
                    onSelect(site.id);
                    onClose();
                  }}
                />
              ))
            )}
          </ScrollView>
          <View style={{ height: spacing.md }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
});
