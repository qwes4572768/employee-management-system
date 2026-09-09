import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { PARCEL_KIND_LABELS, PARCEL_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { getParcelForActor, pickupParcel } from '@/services/parcelService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { captureCommunityPhoto } from '@/utils/communityPhoto';
import { formatDateTimeZh } from '@/utils/datetime';
import type { Parcel } from '@/types';

export default function DutyParcelPickupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [pickupByName, setPickupByName] = useState('');
  const [pickupPhotoUri, setPickupPhotoUri] = useState<string | null>(null);
  const [signatureNote, setSignatureNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getParcelForActor(actor, id);
    setParcel(detail.parcel);
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
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>
            {parcel.unitLabelSnapshot}
            {parcel.locationNote ? ` · ${parcel.locationNote}` : ''}
          </Text>
          {parcel.pickupAt ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 8 })}>
              已於 {formatDateTimeZh(parcel.pickupAt)} 由 {parcel.pickupByName} 領取
            </Text>
          ) : null}
        </QinCard>
      ) : null}
      {parcel && !parcel.pickupAt ? (
        <>
          <QinInput label="領取人姓名" value={pickupByName} onChangeText={setPickupByName} />
          <QinInput label="簽收備註" value={signatureNote} onChangeText={setSignatureNote} />
          {pickupPhotoUri ? (
            <Image source={{ uri: pickupPhotoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 12 }} />
          ) : null}
          <QinButton
            label={pickupPhotoUri ? '重新拍攝簽收照片' : '拍攝簽收照片'}
            variant="secondary"
            onPress={() => {
              void captureCommunityPhoto('parcel')
                .then((uri) => {
                  if (uri) setPickupPhotoUri(uri);
                })
                .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
            }}
          />
          {can('parcel.pickup') ? (
            <QinButton
              label="完成領取簽收"
              loading={busy}
              onPress={() => {
                if (!id) return;
                setBusy(true);
                void pickupParcel(actor, id, {
                  pickupByName,
                  pickupPhotoUri: pickupPhotoUri ?? '',
                  pickupSignatureNote: signatureNote,
                })
                  .then(() => router.back())
                  .catch((err) => setError(err instanceof Error ? err.message : '領取失敗'))
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
