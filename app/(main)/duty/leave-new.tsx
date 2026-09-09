import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { BEREAVEMENT_RELATION_LABELS, LEAVE_TYPE_LABELS, type BereavementRelation, type LeaveType } from '@/constants/leave';
import { useSession } from '@/providers/SessionProvider';
import { submitLeaveRequest } from '@/services/leaveService';

const TYPES: LeaveType[] = [
  'preferred_day_off',
  'annual_leave',
  'sick_leave',
  'bereavement_leave',
  'personal_leave',
  'official_leave',
];

export default function NewLeaveScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [leaveType, setLeaveType] = useState<LeaveType>('preferred_day_off');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [urgentReason, setUrgentReason] = useState('');
  const [officialBasis, setOfficialBasis] = useState('');
  const [relation, setRelation] = useState<BereavementRelation | ''>('');
  const [hospitalized, setHospitalized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      {info ? <InfoBanner message={info} /> : null}
      <QinSelect
        label="假別"
        value={leaveType}
        options={TYPES.map((item) => ({ value: item, label: LEAVE_TYPE_LABELS[item] }))}
        onChange={setLeaveType}
      />
      <QinInput label="開始日期 YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
      <QinInput label="結束日期 YYYY-MM-DD" value={endDate} onChangeText={setEndDate} />
      <QinInput label="原因 / 說明" value={reason} onChangeText={setReason} multiline />
      {leaveType === 'annual_leave' || leaveType === 'personal_leave' ? (
        <QinInput label="未提前申請原因（急件時必填：事假）" value={urgentReason} onChangeText={setUrgentReason} />
      ) : null}
      {leaveType === 'official_leave' ? (
        <QinInput label="公假依據" value={officialBasis} onChangeText={setOfficialBasis} />
      ) : null}
      {leaveType === 'bereavement_leave' ? (
        <QinSelect
          label="與亡者關係"
          value={relation}
          options={Object.entries(BEREAVEMENT_RELATION_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setRelation(v as BereavementRelation)}
        />
      ) : null}
      {leaveType === 'sick_leave' ? (
        <SwitchRow label="是否住院" value={hospitalized} onValueChange={setHospitalized} />
      ) : null}
      <QinButton
        label="送出申請"
        loading={loading}
        onPress={() => {
          void (async () => {
            setLoading(true);
            setError(null);
            try {
              const created = await submitLeaveRequest(actor, {
                leaveType,
                startDate,
                endDate: endDate || startDate,
                siteId: currentSite?.id ?? null,
                reason,
                urgentReason: urgentReason || null,
                hospitalized,
                bereavementRelation: relation || null,
                officialBasis: officialBasis || null,
              });
              setInfo('已送出，待主管審核');
              router.replace({ pathname: '/(main)/duty/leave-detail', params: { id: created.id } });
            } catch (err) {
              setError(err instanceof Error ? err.message : '送出失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
