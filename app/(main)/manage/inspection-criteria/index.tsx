import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import {
  getInspectionPolicyForActor,
  listInspectionCriteriaForActor,
  updateInspectionCriteriaForActor,
  updateInspectionPolicyForActor,
} from '@/services/inspectionCatalogService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { InspectionCriteria, InspectionPolicy } from '@/types';

export default function InspectionCriteriaScreen() {
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [policy, setPolicy] = useState<InspectionPolicy | null>(null);
  const [rows, setRows] = useState<InspectionCriteria[]>([]);
  const [excellent, setExcellent] = useState('90');
  const [good, setGood] = useState('80');
  const [pass, setPass] = useState('70');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const nextPolicy = await getInspectionPolicyForActor(actor);
    setPolicy(nextPolicy);
    setExcellent(String(nextPolicy.excellentMinScore));
    setGood(String(nextPolicy.goodMinScore));
    setPass(String(nextPolicy.passMinScore));
    setRows(await listInspectionCriteriaForActor(actor));
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {policy ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>評分門檻</Text>
          <QinInput label="優良最低分" value={excellent} onChangeText={setExcellent} keyboardType="numeric" />
          <QinInput label="良好最低分" value={good} onChangeText={setGood} keyboardType="numeric" />
          <QinInput label="合格最低分" value={pass} onChangeText={setPass} keyboardType="numeric" />
          {can('inspectionCriteria.manage') ? (
            <QinButton
              label="儲存門檻"
              onPress={() => {
                void updateInspectionPolicyForActor(actor, {
                  excellentMinScore: Number(excellent),
                  goodMinScore: Number(good),
                  passMinScore: Number(pass),
                })
                  .then(load)
                  .catch((err) => setError(err instanceof Error ? err.message : '儲存失敗'));
              }}
            />
          ) : null}
        </QinCard>
      ) : null}
      {rows.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '800' })}>
            {item.displayName} · {item.criteriaKey}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            滿分 {item.maxScore} · 權重 {item.weight} · {item.status === 'active' ? '啟用' : '停用'}
          </Text>
          {can('inspectionCriteria.manage') ? (
            <QinButton
              label={item.status === 'active' ? '停用' : '啟用'}
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={() => {
                void updateInspectionCriteriaForActor(actor, item.id, {
                  status: item.status === 'active' ? 'inactive' : 'active',
                })
                  .then(load)
                  .catch((err) => setError(err instanceof Error ? err.message : '更新失敗'));
              }}
            />
          ) : null}
        </QinCard>
      ))}
    </Screen>
  );
}
