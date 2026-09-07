import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { PARCEL_KIND_LABELS, PARCEL_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { cancelParcel, getParcelForActor, notifyParcel, returnParcel, reverseParcelEvent } from '@/services/parcelService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { Parcel, ParcelEvent } from '@/types';

export default function ManageParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [events, setEvents] = useState<ParcelEvent[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getParcelForActor(actor, id);
    setParcel(detail.parcel);
    setEvents(detail.events);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {parcel ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{parcel.recipientNameSnapshot}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {PARCEL_KIND_LABELS[parcel.parcelKind]} · {PARCEL_STATUS_LABELS[parcel.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>{parcel.unitLabelSnapshot}</Text>
          {parcel.trackingNo ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>單號 {parcel.trackingNo}</Text>
          ) : null}
          {parcel.pickupByName ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 8 })}>
              領取人 {parcel.pickupByName} · {parcel.pickupAt ? formatDateTimeZh(parcel.pickupAt) : ''}
            </Text>
          ) : null}
          {parcel.pickupPhotoUri ? (
            <Image source={{ uri: parcel.pickupPhotoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 8 }} />
          ) : null}
        </QinCard>
      ) : null}
      {can('parcel.register') && parcel && (parcel.status === 'registered' || parcel.status === 'notified') ? (
        <QinButton
          label="標記已通知"
          loading={busy}
          onPress={() => {
            if (!id) return;
            setBusy(true);
            void notifyParcel(actor, id)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '更新失敗'))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {can('parcel.manage') && parcel && parcel.status !== 'picked_up' && parcel.status !== 'returned' ? (
        <QinButton
          label="退件"
          variant="secondary"
          onPress={() => {
            if (!id) return;
            void returnParcel(actor, id)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '退件失敗'));
          }}
        />
      ) : null}
      {can('parcel.manage') && parcel && parcel.status !== 'picked_up' && parcel.status !== 'cancelled' ? (
        <QinButton
          label="取消包裹"
          variant="danger"
          onPress={() => {
            if (!id) return;
            void cancelParcel(actor, id)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '取消失敗'));
          }}
        />
      ) : null}
      {can('parcel.manage') && parcel && (parcel.status === 'picked_up' || parcel.status === 'returned' || parcel.status === 'cancelled') ? (
        <>
          <QinInput label="更正原因" value={reason} onChangeText={setReason} />
          <QinButton
            label="更正狀態（保留原事件）"
            variant="secondary"
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              void reverseParcelEvent(actor, id, { reason })
                .then(() => {
                  setReason('');
                  return load();
                })
                .catch((err) => setError(err instanceof Error ? err.message : '更正失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        事件紀錄
      </Text>
      {events.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '700' })}>
            {item.action} · {item.actorNameSnapshot}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, marginTop: 4 })}>
            {formatDateTimeZh(item.createdAt)}
          </Text>
          {item.reason ? <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>原因 {item.reason}</Text> : null}
          {item.note ? <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>{item.note}</Text> : null}
        </QinCard>
      ))}
    </Screen>
  );
}
