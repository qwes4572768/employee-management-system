import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { ensureTenantWorkforceDefaults } from '@/repositories/workforceRepository';
import { ensureLeavePolicy } from '@/repositories/leaveRepository';
import { saveWorkforceSettings } from '@/services/scheduleService';
import { saveLeavePolicy } from '@/services/leaveService';

export default function WorkforceSettingsScreen() {
  const { actor, tenant } = useSession();
  const [minimumRest, setMinimumRest] = useState('480');
  const [lateGrace, setLateGrace] = useState('5');
  const [earlyGrace, setEarlyGrace] = useState('5');
  const [annualAdvance, setAnnualAdvance] = useState('30');
  const [personalAdvance, setPersonalAdvance] = useState('30');
  const [sickHours, setSickHours] = useState('72');
  const [pdoLimit, setPdoLimit] = useState('2');
  const [interview, setInterview] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenant) return;
    const wf = await ensureTenantWorkforceDefaults(tenant.id);
    const lp = await ensureLeavePolicy(tenant.id);
    if (wf) {
      setMinimumRest(String(wf.minimumRestMinutes));
      setLateGrace(String(wf.lateGraceMinutes));
      setEarlyGrace(String(wf.earlyLeaveGraceMinutes));
    }
    if (lp) {
      setAnnualAdvance(String(lp.annualLeaveRecommendedAdvanceDays));
      setPersonalAdvance(String(lp.personalLeaveRecommendedAdvanceDays));
      setSickHours(String(lp.sickLeaveDocumentDueHours));
      setPdoLimit(String(lp.preferredDayOffMonthlyLimit));
      setInterview(String(lp.personalLeaveMonthlyInterviewThreshold));
    }
  }, [tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {info ? <InfoBanner message={info} /> : null}
      <QinInput label="最低休息分鐘 minimum_rest_minutes" value={minimumRest} onChangeText={setMinimumRest} keyboardType="number-pad" />
      <QinInput label="遲到寬限分鐘" value={lateGrace} onChangeText={setLateGrace} keyboardType="number-pad" />
      <QinInput label="早退寬限分鐘" value={earlyGrace} onChangeText={setEarlyGrace} keyboardType="number-pad" />
      <QinInput label="特休建議提前日數" value={annualAdvance} onChangeText={setAnnualAdvance} keyboardType="number-pad" />
      <QinInput label="事假建議提前日數" value={personalAdvance} onChangeText={setPersonalAdvance} keyboardType="number-pad" />
      <QinInput label="病假補件時數" value={sickHours} onChangeText={setSickHours} keyboardType="number-pad" />
      <QinInput label="每月指定休上限" value={pdoLimit} onChangeText={setPdoLimit} keyboardType="number-pad" />
      <QinInput label="事假每月面談門檻（日）" value={interview} onChangeText={setInterview} keyboardType="number-pad" />
      <QinButton
        label="儲存設定"
        onPress={() => {
          void (async () => {
            setError(null);
            try {
              await saveWorkforceSettings(actor, {
                minimumRestMinutes: Number(minimumRest),
                lateGraceMinutes: Number(lateGrace),
                earlyLeaveGraceMinutes: Number(earlyGrace),
              });
              await saveLeavePolicy(actor, {
                annualLeaveRecommendedAdvanceDays: Number(annualAdvance),
                personalLeaveRecommendedAdvanceDays: Number(personalAdvance),
                sickLeaveDocumentDueHours: Number(sickHours),
                preferredDayOffMonthlyLimit: Number(pdoLimit),
                personalLeaveMonthlyInterviewThreshold: Number(interview),
              });
              setInfo('已儲存');
            } catch (err) {
              setError(err instanceof Error ? err.message : '儲存失敗');
            }
          })();
        }}
      />
    </Screen>
  );
}
