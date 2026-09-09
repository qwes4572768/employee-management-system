import { ROLE_KEYS } from '@/constants/app';
import { DISCIPLINE_ACTION_LABELS, type DisciplineActionKey, type DisciplineDecision } from '@/constants/inspection';
import {
  getDisciplinaryRecommendationById,
  insertDisciplinaryRecommendation,
  insertDisciplinaryReview,
  listDisciplinaryRecommendations,
  listDisciplinaryReviews,
  updateDisciplinaryRecommendationStatus,
} from '@/repositories/disciplineRepository';
import { getInspectionEvaluationById } from '@/repositories/inspectionEvaluationRepository';
import { listUserRoles } from '@/repositories/permissionRepository';
import { getRoleById } from '@/repositories/roleRepository';
import type { DisciplinaryRecommendation, DisciplinaryReview } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireInspectionSession } from './inspectionService';
import { actorCanAccessSiteId } from './patrolAccess';
import { requireActorTenant, TenantAccessError } from './tenantGuard';

async function actorIsSuperAdmin(actor: ActorContext): Promise<boolean> {
  if (!actor.userId || !actor.tenantId) return false;
  const assignments = await listUserRoles(actor.userId, actor.tenantId);
  for (const assignment of assignments) {
    const role = await getRoleById(assignment.roleId, actor.tenantId);
    if (role?.roleKey === ROLE_KEYS.SUPER_ADMIN) return true;
  }
  return false;
}

async function requireRecommendation(id: string, tenantId: string): Promise<DisciplinaryRecommendation> {
  const rec = await getDisciplinaryRecommendationById(id, tenantId);
  if (!rec) {
    const other = await getDisciplinaryRecommendationById(id);
    if (other) throw new TenantAccessError();
    throw new Error('找不到懲處建議');
  }
  return rec;
}

export async function recommendDiscipline(
  actor: ActorContext,
  input: {
    evaluationId?: string | null;
    siteId: string;
    employeeUserId: string;
    actionKey: DisciplineActionKey;
    reason: string;
    compensationClaimAmount?: number | null;
  },
): Promise<DisciplinaryRecommendation> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'discipline.recommend');
  if (!actor.userId) throw new Error('缺少操作者');
  if (!input.reason.trim()) throw new Error('請填寫懲處建議原因');
  if (!(await actorCanAccessSiteId(actor, input.siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  if (input.evaluationId) {
    const evaluation = await getInspectionEvaluationById(input.evaluationId, tenantId);
    if (!evaluation) throw new Error('找不到評核');
    await requireInspectionSession(evaluation.inspectionSessionId, tenantId);
  }
  const rec = await insertDisciplinaryRecommendation({
    tenantId,
    siteId: input.siteId,
    inspectionEvaluationId: input.evaluationId ?? null,
    employeeUserId: input.employeeUserId,
    recommendedBy: actor.userId,
    actionKey: input.actionKey,
    actionLabelSnapshot: DISCIPLINE_ACTION_LABELS[input.actionKey],
    reason: input.reason.trim(),
    compensationClaimAmount: input.compensationClaimAmount ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'recommend',
    module: 'discipline',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 提出懲處建議（${rec.actionLabelSnapshot}）`,
    targetType: 'disciplinary_recommendation',
    targetId: rec.id,
    siteId: rec.siteId,
    after: {
      status: rec.status,
      compensationClaimAmount: rec.compensationClaimAmount,
      payrollDeduction: false,
    },
  });
  return rec;
}

export async function reviewDiscipline(
  actor: ActorContext,
  input: {
    recommendationId: string;
    decision: DisciplineDecision;
    reviewNote?: string | null;
    finalAction?: string | null;
    confirmSelfApprove?: boolean;
  },
): Promise<{ recommendation: DisciplinaryRecommendation; review: DisciplinaryReview }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'discipline.approve');
  if (!actor.userId) throw new Error('缺少操作者');
  const rec = await requireRecommendation(input.recommendationId, tenantId);
  if (!(await actorCanAccessSiteId(actor, rec.siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  if (rec.recommendedBy === actor.userId) {
    const superAdmin = await actorIsSuperAdmin(actor);
    if (!superAdmin) {
      throw new Error('推薦人不得自行核准，請上送更高權限主管');
    }
    if (!input.confirmSelfApprove) {
      throw new Error('企業總管理員自行核准需要二次確認');
    }
    await writeAudit({
      actor,
      action: 'self_approve_confirm',
      module: 'discipline',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 二次確認自行核決懲處建議`,
      targetType: 'disciplinary_recommendation',
      targetId: rec.id,
      siteId: rec.siteId,
    });
  }
  const review = await insertDisciplinaryReview({
    tenantId,
    recommendationId: rec.id,
    reviewerUserId: actor.userId,
    decision: input.decision,
    finalAction: input.finalAction ?? null,
    reviewNote: input.reviewNote ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const status =
    input.decision === 'approved'
      ? 'approved'
      : input.decision === 'rejected'
        ? 'rejected'
        : input.decision === 'returned'
          ? 'returned'
          : 'modified';
  const updated = await updateDisciplinaryRecommendationStatus(rec.id, tenantId, status);
  const label =
    input.decision === 'approved' ? '核准' : input.decision === 'rejected' ? '拒絕' : input.decision === 'returned' ? '退回' : '修改';
  await writeAudit({
    actor,
    action: input.decision,
    module: 'discipline',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${label}懲處建議「${rec.actionLabelSnapshot}」`,
    targetType: 'disciplinary_recommendation',
    targetId: rec.id,
    siteId: rec.siteId,
    after: { status, payrollDeduction: false, compensationClaimAmount: rec.compensationClaimAmount },
  });
  return { recommendation: updated, review };
}

export async function listDisciplineForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; status?: DisciplinaryRecommendation['status'] | null },
): Promise<DisciplinaryRecommendation[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'discipline.review');
  const rows = await listDisciplinaryRecommendations(tenantId, input);
  const visible: DisciplinaryRecommendation[] = [];
  for (const row of rows) {
    if (await actorCanAccessSiteId(actor, row.siteId)) visible.push(row);
  }
  return visible;
}

export async function getDisciplineDetail(actor: ActorContext, id: string): Promise<{
  recommendation: DisciplinaryRecommendation;
  reviews: DisciplinaryReview[];
}> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'discipline.review');
  const recommendation = await requireRecommendation(id, tenantId);
  if (!(await actorCanAccessSiteId(actor, recommendation.siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  return { recommendation, reviews: await listDisciplinaryReviews(tenantId, recommendation.id) };
}
