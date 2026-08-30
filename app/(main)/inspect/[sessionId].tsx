import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { GENDER_LABELS } from '@/constants/app';
import {
  DISCIPLINE_ACTION_KEYS,
  DISCIPLINE_ACTION_LABELS,
  INSPECTION_GRADE_LABELS,
  type DisciplineActionKey,
} from '@/constants/inspection';
import { useSession } from '@/providers/SessionProvider';
import { addInspectionEvidence, getInspectionContext, saveInspectionEvaluation } from '@/services/inspectionService';
import { createImprovementOrder } from '@/services/improvementService';
import { recommendDiscipline } from '@/services/disciplineService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh, formatDateZh } from '@/utils/datetime';
import { captureInspectionPhoto } from '@/utils/inspectionPhoto';
import type { InspectionCheckItem, InspectionCriteria } from '@/types';

type Step = 'verify' | 'score';

export default function InspectionSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('verify');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [abnormal, setAbnormal] = useState<Record<string, boolean>>({});
  const [improvementTitle, setImprovementTitle] = useState('');
  const [improvementNote, setImprovementNote] = useState('');
  const [disciplineReason, setDisciplineReason] = useState('');
  const [disciplineKey, setDisciplineKey] = useState<DisciplineActionKey>('verbal_warning');
  const [compensation, setCompensation] = useState('');
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getInspectionContext>> | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const next = await getInspectionContext(actor, sessionId);
    setCtx(next);
    if (next.evaluation?.summary) setSummary(next.evaluation.summary);
    const nextScores: Record<string, number> = {};
    const nextComments: Record<string, string> = {};
    const nextAbnormal: Record<string, boolean> = {};
    for (const item of next.items) {
      nextScores[item.criteriaId] = item.score;
      nextComments[item.criteriaId] = item.comment ?? '';
      nextAbnormal[item.criteriaId] = item.isAbnormal;
    }
    for (const criteria of next.criteria) {
      if (nextScores[criteria.id] == null) nextScores[criteria.id] = criteria.maxScore;
    }
    setScores(nextScores);
    setComments(nextComments);
    setAbnormal(nextAbnormal);
  }, [actor, sessionId]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const levelColor = (level: InspectionCheckItem['level']) =>
    level === 'exception' ? colors.danger : level === 'warning' ? colors.warning : colors.success;

  const drafts = useMemo(
    () =>
      (ctx?.criteria ?? []).map((criteria) => ({
        criteriaId: criteria.id,
        score: scores[criteria.id] ?? criteria.maxScore,
        comment: comments[criteria.id] ?? null,
        isAbnormal: Boolean(abnormal[criteria.id]),
      })),
    [abnormal, comments, ctx?.criteria, scores],
  );

  if (!ctx) {
    return (
      <Screen>
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  const { session, card, verification, criteria, evaluation, patrolHint } = ctx;
  const completed = session.status === 'completed' || evaluation?.status === 'completed';

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinCard style={{ marginBottom: spacing.md, borderColor: colors.borderStrong, borderWidth: 1 }}>
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, letterSpacing: 1 })}>
          QR 只負責識別，不是身份驗證
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, alignItems: 'center' }}>
          <Avatar uri={card.photoUri} name={card.fullName} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{card.fullName}</Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
              {card.employeeNo ?? '—'} · {GENDER_LABELS[card.gender] ?? card.gender} · 到職 {formatDateZh(card.hireDate)}
            </Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
              {card.jobTitle ?? '—'} · {card.staffingModeLabel}
            </Text>
          </View>
        </View>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: spacing.sm })}>
          案場 {card.currentSiteName ?? session.siteNameSnapshot} · 班表 {card.todayShiftName ?? '—'}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
          應到 {card.scheduledStartAt ? formatDateTimeZh(card.scheduledStartAt) : '—'} · 實到{' '}
          {card.clockInAt ? formatDateTimeZh(card.clockInAt) : '尚未打卡'} · {card.onDuty ? '勤務中' : '未在勤務階段'}
        </Text>
        {card.patrol ? (
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4, color: colors.electric })}>
            巡邏 應巡 {card.patrol.totalRequired} · 準時 {card.patrol.onTime} · 逾時 {card.patrol.late} · 漏巡 {card.patrol.missed} · 重大漏巡{' '}
            {card.patrol.criticalMissed} · 異常 {card.patrol.exceptions}
          </Text>
        ) : null}
      </QinCard>

      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800' })}>現場勤務驗證</Text>
        <Text
          style={textStyle(colors, fontScale, 'sm', {
            color: levelColor(verification.status),
            fontWeight: '800',
            marginTop: 6,
          })}
        >
          {verification.status === 'exception' ? '異常' : verification.status === 'warning' ? '警告' : '正常'}
        </Text>
        {verification.remoteInspectionWarning ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: 6 })}>
            您目前距離案場 {verification.inspectorDistanceMeters ?? '—'} 公尺
          </Text>
        ) : null}
        {verification.checks.map((item) => (
          <View key={item.key} style={{ marginTop: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'sm', { color: levelColor(item.level), fontWeight: '700' })}>
              {item.label} · {item.level === 'exception' ? '異常' : item.level === 'warning' ? '警告' : '正常'}
            </Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted })}>{item.detail}</Text>
          </View>
        ))}
      </QinCard>

      {step === 'verify' && !completed ? (
        <QinButton label="開始評核" onPress={() => setStep('score')} />
      ) : null}

      {step === 'score' || completed ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800' })}>督勤評核</Text>
          {patrolHint ? (
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: 8 })}>{patrolHint}</Text>
          ) : null}
          {criteria.map((item) => (
            <CriteriaRow
              key={item.id}
              criteria={item}
              score={scores[item.id] ?? item.maxScore}
              comment={comments[item.id] ?? ''}
              abnormal={Boolean(abnormal[item.id])}
              disabled={completed}
              onScore={(value) => setScores((prev) => ({ ...prev, [item.id]: value }))}
              onComment={(value) => setComments((prev) => ({ ...prev, [item.id]: value }))}
              onAbnormal={(value) => setAbnormal((prev) => ({ ...prev, [item.id]: value }))}
            />
          ))}
          <QinInput label="總評" value={summary} onChangeText={setSummary} multiline editable={!completed} />
          {evaluation ? (
            <Text style={textStyle(colors, fontScale, 'md', { color: colors.accent, marginTop: spacing.sm })}>
              {evaluation.weightedScore} 分 · {INSPECTION_GRADE_LABELS[evaluation.grade]}
              {evaluation.majorDeficiency ? ' · 重大缺失' : ''}
            </Text>
          ) : null}
        </QinCard>
      ) : null}

      {step === 'score' || completed ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800' })}>現場照片</Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            重大缺失預設僅能使用現場相機，原始檔會保留。
          </Text>
          {can('inspection.evidence.upload') && !completed ? (
            <QinButton
              label="拍攝證據"
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={() => {
                void (async () => {
                  try {
                    const uri = await captureInspectionPhoto({ liveCameraOnly: true });
                    if (!uri || !sessionId) return;
                    await addInspectionEvidence(actor, {
                      sessionId,
                      kind: 'deficiency',
                      localUri: uri,
                      liveCameraOnly: true,
                    });
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '拍照失敗');
                  }
                })();
              }}
            />
          ) : null}
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: spacing.sm })}>
            已保存 {ctx.evidence.length} 張
          </Text>
        </QinCard>
      ) : null}

      {step === 'score' && !completed ? (
        <QinButton
          label="送出評核"
          loading={busy}
          onPress={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                const saved = await saveInspectionEvaluation(actor, {
                  sessionId: session.id,
                  items: drafts,
                  summary,
                  complete: true,
                });
                if (
                  (saved.evaluation.grade === 'needs_improvement' ||
                    saved.evaluation.grade === 'serious_issue' ||
                    saved.evaluation.majorDeficiency) &&
                  improvementTitle.trim() &&
                  can('improvement.create')
                ) {
                  await createImprovementOrder(actor, {
                    evaluationId: saved.evaluation.id,
                    title: improvementTitle.trim(),
                    description: improvementNote.trim() || saved.evaluation.summary || '請依督勤評語改善',
                    severity: saved.evaluation.majorDeficiency ? 'urgent' : 'general',
                    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  });
                }
                if (disciplineReason.trim() && can('discipline.recommend')) {
                  await recommendDiscipline(actor, {
                    evaluationId: saved.evaluation.id,
                    siteId: session.siteId,
                    employeeUserId: session.employeeUserId,
                    actionKey: disciplineKey,
                    reason: disciplineReason.trim(),
                    compensationClaimAmount: compensation ? Number(compensation) : null,
                  });
                }
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : '送出失敗');
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {step === 'score' || completed ? (
        <QinCard style={{ marginTop: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>改善 / 懲處建議</Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.warning, marginTop: 4 })}>
            賠償 / 懲處建議不會直接扣薪，必須另由高權限主管審核。
          </Text>
          <QinInput label="改善標題（選填）" value={improvementTitle} onChangeText={setImprovementTitle} editable={!completed} />
          <QinInput label="改善說明" value={improvementNote} onChangeText={setImprovementNote} multiline editable={!completed} />
          <QinInput label="懲處建議原因（選填）" value={disciplineReason} onChangeText={setDisciplineReason} multiline editable={!completed} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm }}>
            {DISCIPLINE_ACTION_KEYS.map((key) => (
              <Pressable key={key} onPress={() => setDisciplineKey(key)}>
                <Text style={textStyle(colors, fontScale, 'xs', { color: disciplineKey === key ? colors.accent : colors.textMuted })}>
                  {DISCIPLINE_ACTION_LABELS[key]}
                </Text>
              </Pressable>
            ))}
          </View>
          <QinInput
            label="賠償金額（僅建議，不扣薪）"
            value={compensation}
            onChangeText={setCompensation}
            keyboardType="numeric"
            editable={!completed}
          />
        </QinCard>
      ) : null}
    </Screen>
  );
}

function CriteriaRow({
  criteria,
  score,
  comment,
  abnormal,
  disabled,
  onScore,
  onComment,
  onAbnormal,
}: {
  criteria: InspectionCriteria;
  score: number;
  comment: string;
  abnormal: boolean;
  disabled: boolean;
  onScore: (value: number) => void;
  onComment: (value: string) => void;
  onAbnormal: (value: boolean) => void;
}) {
  const { colors, fontScale } = useTheme();
  const stars = Math.max(1, Math.round(criteria.maxScore));
  return (
    <View style={{ marginTop: spacing.md, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm }}>
      <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
        {criteria.displayName}
        {criteria.required ? ' *' : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {Array.from({ length: stars }, (_, index) => index + 1).map((value) => (
          <Pressable key={value} disabled={disabled} onPress={() => onScore(value)}>
            <Text style={textStyle(colors, fontScale, 'lg', { color: score >= value ? colors.accent : colors.textSubtle })}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
      <QinInput
        label="分數"
        value={String(score)}
        onChangeText={(value) => onScore(Number(value) || 0)}
        keyboardType="numeric"
        editable={!disabled}
      />
      <QinInput label="備註" value={comment} onChangeText={onComment} editable={!disabled} />
      <Pressable disabled={disabled} onPress={() => onAbnormal(!abnormal)}>
        <Text style={textStyle(colors, fontScale, 'xs', { color: abnormal ? colors.danger : colors.textMuted, marginTop: 6 })}>
          {abnormal ? '已標異常 / 重大缺失候選' : '標為異常'}
        </Text>
      </Pressable>
    </View>
  );
}
