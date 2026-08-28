import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { QinSelect } from '@/components/ui/QinSelect';
import { toDateOnly } from '@/utils/datetime';

interface QinDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
}

export function QinDateField({ label, value, onChange, minYear = 1970, maxYear }: QinDateFieldProps) {
  const today = new Date();
  const max = maxYear ?? today.getFullYear() + 1;
  const [year, month, day] = (value || toDateOnly(today)).split('-');

  const years = useMemo(
    () => Array.from({ length: max - minYear + 1 }, (_, i) => max - i).map((y) => ({
      value: String(y),
      label: `${y} 年`,
    })),
    [max, minYear],
  );
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1).padStart(2, '0'),
      label: `${i + 1} 月`,
    })),
    [],
  );
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => ({
      value: String(i + 1).padStart(2, '0'),
      label: `${i + 1} 日`,
    })),
    [daysInMonth],
  );

  const commit = (nextYear: string, nextMonth: string, nextDay: string) => {
    const dim = new Date(Number(nextYear), Number(nextMonth), 0).getDate();
    const safeDay = String(Math.min(Number(nextDay), dim)).padStart(2, '0');
    onChange(`${nextYear}-${nextMonth}-${safeDay}`);
  };

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <QinSelect label={`${label} · 年`} value={year ?? ''} options={years} onChange={(y) => commit(y, month ?? '01', day ?? '01')} />
      </View>
      <View style={styles.col}>
        <QinSelect label="月" value={month ?? ''} options={months} onChange={(m) => commit(year ?? String(today.getFullYear()), m, day ?? '01')} />
      </View>
      <View style={styles.col}>
        <QinSelect label="日" value={day ?? ''} options={days} onChange={(d) => commit(year ?? String(today.getFullYear()), month ?? '01', d)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, width: '100%' },
  col: { flex: 1, minWidth: 90 },
});
