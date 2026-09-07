import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { VISITOR_KIND_LABELS, VISITOR_PASS_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { checkInVisitor, checkOutVisitor, getVisitorPassForActor } from '@/services/visitorService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { captureCommunityPhoto } from '@/utils/communityPhoto';
import { formatDateTimeZh } from '@/utils/datetime';
import type { VisitorMovement, VisitorPass } from '@/types';

export default function DutyVisitorGateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [pass, setPass] = useState<VisitorPass | null>(null);
  const [movements, setMovements] = useState<VisitorMovement[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getVisitorPassForActor(actor, id);
    setPass(detail.pass);
    setMovements(detail.movements);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const submit = (direction: 'in' | 'out') => {
    if (!id) return;
    setBusy(true);
    const run = direction === 'in' ? checkInVisitor : checkOutVisitor;
    void run(actor, id, { photoUri, note })
      .then(() => router.back())
      .catch((err) => setError(err instanceof Error ? err.message : '辦理失敗'))
      .finally(() => setBusy(false));
  };

  return (
    <Screen>
      <ErrorBanner message={error} />
      {pass ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{pass.visitorName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {VISITOR_KIND_LABELS[pass.visitorKind]} · {VISITOR_PASS_STATUS_LABELS[pass.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>
            {pass.unitLabelSnapshot} · {pass.hostNameSnapshot}
          </Text>
        </QinCard>
      ) : null}
      <QinInput label="備註" value={note} onChangeText={setNote} />
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 12 }} />
      ) : null}
      <QinButton
        label={photoUri ? '重新拍攝進出照片' : '拍攝進出照片'}
        variant="secondary"
        onPress={() => {
          void captureCommunityPhoto('visitor')
            .then((uri) => {
              if (uri) setPhotoUri(uri);
            })
            .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
        }}
      />
      {can('visitor.check') && pass?.status === 'registered' ? (
        <QinButton label="辦理進場" loading={busy} onPress={() => submit('in')} />
      ) : null}
      {can('visitor.check') && pass?.status === 'checked_in' ? (
        <QinButton label="辦理離場" loading={busy} onPress={() => submit('out')} />
      ) : null}
      {movements.map((item) => (
        <QinCard key={item.id} style={{ marginTop: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {item.direction === 'in' ? '進場' : '離場'} · {formatDateTimeZh(item.occurredAt)}
          </Text>
        </QinCard>
      ))}
    </Screen>
  );
}
