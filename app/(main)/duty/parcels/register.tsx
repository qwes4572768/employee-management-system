import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { PARCEL_KIND_LABELS, type ParcelKind } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { registerParcel } from '@/services/parcelService';
import { listResidentsForActor } from '@/services/residentService';
import { listSiteUnitsForActor } from '@/services/unitService';
import { captureCommunityPhoto } from '@/utils/communityPhoto';
import type { Resident, SiteUnit } from '@/types';

const KIND_OPTIONS = (Object.keys(PARCEL_KIND_LABELS) as ParcelKind[]).map((value) => ({
  value,
  label: PARCEL_KIND_LABELS[value],
}));

export default function DutyParcelRegisterScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [unitId, setUnitId] = useState('');
  const [residentId, setResidentId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [courierName, setCourierName] = useState('');
  const [parcelKind, setParcelKind] = useState<ParcelKind>('general');
  const [locationNote, setLocationNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const siteUnits = await listSiteUnitsForActor(actor, currentSite?.id ?? null);
      setUnits(siteUnits);
      setUnitId((current) => current || siteUnits[0]?.id || '');
    })().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
  }, [actor, currentSite?.id]);

  useEffect(() => {
    if (!unitId) {
      setResidents([]);
      return;
    }
    void listResidentsForActor(actor, { unitId, status: 'active' })
      .then(setResidents)
      .catch((err) => setError(err instanceof Error ? err.message : '讀取住戶失敗'));
  }, [actor, unitId]);

  const residentOptions = [
    { value: '', label: '未指定住戶（僅用收件姓名）' },
    ...residents.map((item) => ({ value: item.id, label: item.fullName })),
  ];

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="戶別"
        value={unitId}
        options={units.map((item) => ({ value: item.id, label: item.displayName }))}
        onChange={setUnitId}
      />
      <QinSelect
        label="收件住戶（選填）"
        value={residentId}
        options={residentOptions}
        onChange={(value) => {
          setResidentId(value);
          const person = residents.find((item) => item.id === value);
          if (person && !recipientName) setRecipientName(person.fullName);
        }}
      />
      <QinInput label="收件人姓名" value={recipientName} onChangeText={setRecipientName} />
      <QinSelect label="種類" value={parcelKind} options={KIND_OPTIONS} onChange={setParcelKind} />
      <QinInput label="物流單號（選填）" value={trackingNo} onChangeText={setTrackingNo} />
      <QinInput label="物流／來源（選填）" value={courierName} onChangeText={setCourierName} />
      <QinInput label="存放位置" value={locationNote} onChangeText={setLocationNote} placeholder="例如：櫃檯第三層" />
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 12 }} />
      ) : null}
      <QinButton
        label={photoUri ? '重新拍攝到件照片' : '拍攝到件照片'}
        variant="secondary"
        onPress={() => {
          void captureCommunityPhoto('parcel')
            .then((uri) => {
              if (uri) setPhotoUri(uri);
            })
            .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
        }}
      />
      <QinButton
        label="完成登記"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void registerParcel(actor, {
            unitId,
            residentId: residentId || null,
            recipientName,
            trackingNo,
            courierName,
            parcelKind,
            locationNote,
            photoUri,
          })
            .then((item) => router.replace({ pathname: '/(main)/duty/parcels/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
