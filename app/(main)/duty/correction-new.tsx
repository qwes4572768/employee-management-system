import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { useSession } from '@/providers/SessionProvider';
import { requestAttendanceCorrection } from '@/services/attendanceService';

export default function CorrectionNewScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [requestType, setRequestType] = useState<'missing_in' | 'missing_out' | 'incorrect_time'>('missing_in');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      {info ? <InfoBanner message={info} /> : null}
      <QinSelect
        label="申請類型"
        value={requestType}
        options={[
          { value: 'missing_in', label: '缺上班卡' },
          { value: 'missing_out', label: '缺下班卡' },
          { value: 'incorrect_time', label: '時間不正確' },
        ]}
        onChange={setRequestType}
      />
      <QinInput label="要求上班時間（ISO，選填）" value={clockIn} onChangeText={setClockIn} />
      <QinInput label="要求下班時間（ISO，選填）" value={clockOut} onChangeText={setClockOut} />
      <QinInput label="理由" value={reason} onChangeText={setReason} multiline />
      <QinButton
        label="送出補卡申請"
        loading={loading}
        onPress={() => {
          void (async () => {
            if (!currentSite) {
              setError('請先選擇案場');
              return;
            }
            setLoading(true);
            setError(null);
            try {
              await requestAttendanceCorrection(actor, {
                siteId: currentSite.id,
                requestType,
                requestedClockInAt: clockIn || null,
                requestedClockOutAt: clockOut || null,
                reason,
              });
              setInfo('已送出，待主管審核');
              router.back();
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
