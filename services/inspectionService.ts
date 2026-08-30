import { ROLE_KEYS } from '@/constants/app';
import {
  INSPECTION_CHECK_LEVELS,
  INSPECTION_SESSION_STATUSES,
  INSPECTION_VERIFICATION_STATUSES,
  STAFFING_MODE_LABELS,
  type InspectionCheckLevel,
  type InspectionVerificationStatus,
} from '@/constants/inspection';
import { QR_ASSET_TYPES, QR_SCAN_RESULTS } from '@/constants/qr';
import { listPendingCorrections } from '@/repositories/attendanceRepository';
import { listInspectionCriteria } from '@/repositories/inspectionCatalogRepository';
import {
  deleteEvaluationItems,
  insertEvaluationItem,
  insertInspectionEvaluation,
  insertInspectionEvidence,
  listEvaluationItems,
  listInspectionEvaluations,
  listInspectionEvidence,
  updateInspectionEvaluation,
} from '@/repositories/inspectionEvaluationRepository';
import {
  getInspectionSessionById,
  insertInspectionSession,
  listInspectionSessions,
  updateInspectionSession,
} from '@/repositories/inspectionSessionRepository';
import { listLeaveRequestsForUser } from '@/repositories/leaveRepository';
import { listNotifications, insertNotification } from '@/repositories/notificationRepository';
import { listPatrolExceptions } from '@/repositories/patrolExceptionRepository';
import { listPatrolTasks } from '@/repositories/patrolTaskRepository';
import { listUserRoles } from '@/repositories/permissionRepository';
import { getRoleById } from '@/repositories/roleRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getUserById } from '@/repositories/userRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import { getShiftTemplateById } from '@/repositories/workforceRepository';
import type {
  InspectionCheckItem,
  InspectionCriteria,
  InspectionEmployeeCard,
  InspectionEvaluation,
  InspectionEvaluationItem,
  InspectionEvidence,
  InspectionSession,
  InspectionVerification,
  PatrolTaskStats,
  User,
} from '@/types';
import { formatDateTimeZh, isWithinRange, nowIso, toDateOnly } from '@/utils/datetime';
import { haversineMeters, isValidCoordinate } from '@/utils/geo';
import { computeWeightedScore, resolveInspectionGrade } from '@/utils/inspectionScore';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getPersonDutyCard } from './dashboardService';
import { requireInspectionPolicy } from './inspectionCatalogService';
import { getLocationProvider } from './locationProvider';
import { actorCanAccessSiteId } from './patrolAccess';
import { refreshPatrolTask } from './patrolTaskService';
import { applyPatrolWatermark } from './patrolWatermarkService';
import { scanQr } from './qrScannerService';
import { getAuthorizedSites } from './siteService';
import { requireActorTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { userHasSiteAuthorization } from './workforceWarningService';

export class InspectionUnauthorizedError extends Error {
  readonly code = 'unauthorized';

  constructor(message = 'unauthorized：您沒有權限督勤此案場人員') {
    super(message);
    this.name = 'InspectionUnauthorizedError';
  }
}

function worstStatus(levels: InspectionCheckLevel[]): InspectionVerificationStatus {
  if (levels.includes(INSPECTION_CHECK_LEVELS.EXCEPTION)) return INSPECTION_VERIFICATION_STATUSES.EXCEPTION;
  if (levels.includes(INSPECTION_CHECK_LEVELS.WARNING)) return INSPECTION_VERIFICATION_STATUSES.WARNING;
  return INSPECTION_VERIFICATION_STATUSES.NORMAL;
}

async function actorIsSuperAdmin(actor: ActorContext): Promise<boolean> {
  if (!actor.userId || !actor.tenantId) return false;
  const assignments = await listUserRoles(actor.userId, actor.tenantId);
  for (const assignment of assignments) {
    const role = await getRoleById(assignment.roleId, actor.tenantId);
    if (role?.roleKey === ROLE_KEYS.SUPER_ADMIN) return true;
  }
  return false;
}

async function resolveInspectorFix(input?: { latitude?: number | null; longitude?: number | null }) {
  if (input?.latitude != null && input.longitude != null && isValidCoordinate(input.latitude, input.longitude)) {
    return { latitude: input.latitude, longitude: input.longitude };
  }
  try {
    const result = await getLocationProvider().getCurrentPosition();
    if (result.ok && isValidCoordinate(result.fix.latitude, result.fix.longitude)) {
      return { latitude: result.fix.latitude, longitude: result.fix.longitude };
    }
  } catch {
    // GPS is optional for inspection.
  }
  return { latitude: null as number | null, longitude: null as number | null };
}

async function loadPatrolContext(tenantId: string, userId: string, siteId: string, at: Date) {
  const today = toDateOnly(at);
  const tasks = await listPatrolTasks(tenantId, { userId, siteId, taskDate: today });
  const task = tasks[0] ?? null;
  if (!task) {
    return { stats: null as PatrolTaskStats | null, missed: 0, criticalMissed: 0, majorExceptions: 0, taskId: null as string | null };
  }
  const refreshed = await refreshPatrolTask(tenantId, task.id, at);
  const exceptions = await listPatrolExceptions(tenantId, { taskId: task.id });
  const majorExceptions = exceptions.filter((item) => item.severity === 'major' || item.severity === 'urgent').length;
  return {
    stats: refreshed.stats,
    missed: refreshed.stats.missed,
    criticalMissed: refreshed.stats.criticalMissed,
    majorExceptions,
    taskId: task.id,
    points: refreshed.points,
    exceptions,
  };
}

export async function buildInspectionEmployeeCard(
  tenantId: string,
  userId: string,
  at: Date = new Date(),
): Promise<InspectionEmployeeCard | null> {
  const user = await getUserById(userId, tenantId);
  if (!user) return null;
  const duty = await getPersonDutyCard(tenantId, userId, at);
  const siteId = duty?.site?.id ?? duty?.schedule?.siteId ?? duty?.session?.siteId ?? null;
  const patrol = siteId ? await loadPatrolContext(tenantId, userId, siteId, at) : { stats: null };
  const shift = duty?.schedule?.shiftTemplateId
    ? await getShiftTemplateById(duty.schedule.shiftTemplateId, tenantId)
    : null;
  return {
    userId: user.id,
    photoUri: user.photoUri,
    fullName: user.fullName,
    employeeNo: user.employeeNo,
    gender: user.gender,
    hireDate: user.hireDate,
    jobTitle: user.jobTitle,
    staffingMode: user.staffingMode,
    staffingModeLabel: STAFFING_MODE_LABELS[user.staffingMode] ?? user.staffingMode,
    currentSiteName: duty?.site?.name ?? null,
    todayShiftName: duty?.shiftName ?? shift?.name ?? null,
    scheduledStartAt: duty?.schedule?.scheduledStartAt ?? null,
    clockInAt: duty?.attendance?.clockInAt ?? null,
    onDuty: duty?.session?.status === 'active',
    patrol: patrol.stats,
  };
}

export async function verifyInspectionScene(input: {
  tenantId: string;
  inspectorSiteId: string | null;
  employee: User;
  at?: Date;
  inspectorLatitude?: number | null;
  inspectorLongitude?: number | null;
}): Promise<{
  verification: InspectionVerification;
  scheduleId: string | null;
  attendanceId: string | null;
  workSessionId: string | null;
  siteId: string | null;
  card: InspectionEmployeeCard;
}> {
  const at = input.at ?? new Date();
  const today = toDateOnly(at);
  const duty = await getPersonDutyCard(input.tenantId, input.employee.id, at);
  const siteId = duty?.site?.id ?? duty?.schedule?.siteId ?? duty?.session?.siteId ?? input.inspectorSiteId;
  const site = siteId ? await getSiteById(siteId, input.tenantId) : null;
  const authorized = siteId ? await userHasSiteAuthorization(input.employee.id, input.tenantId, siteId) : false;
  const leaves = (await listLeaveRequestsForUser(input.tenantId, input.employee.id)).filter(
    (item) => item.status === 'approved' && item.startDate <= today && item.endDate >= today,
  );
  const pendingCorrections = (await listPendingCorrections(input.tenantId)).filter(
    (item) => item.userId === input.employee.id,
  );
  const patrol = siteId
    ? await loadPatrolContext(input.tenantId, input.employee.id, siteId, at)
    : { stats: null, missed: 0, criticalMissed: 0, majorExceptions: 0 };

  const checks: InspectionCheckItem[] = [];
  const push = (key: string, label: string, level: InspectionCheckLevel, detail: string) => {
    checks.push({ key, label, level, detail });
  };

  push(
    'active',
    '人員狀態',
    input.employee.status === 'active' ? INSPECTION_CHECK_LEVELS.NORMAL : INSPECTION_CHECK_LEVELS.EXCEPTION,
    input.employee.status === 'active' ? '人員為在職啟用' : `人員狀態為 ${input.employee.status}`,
  );
  push(
    'site_auth',
    '案場授權',
    authorized ? INSPECTION_CHECK_LEVELS.NORMAL : INSPECTION_CHECK_LEVELS.EXCEPTION,
    authorized ? '具有該案場授權' : '沒有該案場授權',
  );
  push(
    'schedule',
    '今日排班',
    duty?.schedule ? INSPECTION_CHECK_LEVELS.NORMAL : INSPECTION_CHECK_LEVELS.WARNING,
    duty?.schedule ? `今日班表 ${duty.shiftName ?? ''}` : '今天沒有排班',
  );
  push(
    'clock_in',
    '上班打卡',
    duty?.attendance?.clockInAt ? INSPECTION_CHECK_LEVELS.NORMAL : INSPECTION_CHECK_LEVELS.WARNING,
    duty?.attendance?.clockInAt ? `已打卡 ${duty.attendance.clockInAt.replace('T', ' ').slice(0, 16)}` : '尚未上班打卡',
  );
  push(
    'work_session',
    '勤務階段',
    duty?.session?.status === 'active' ? INSPECTION_CHECK_LEVELS.NORMAL : INSPECTION_CHECK_LEVELS.WARNING,
    duty?.session?.status === 'active' ? '目前勤務中' : '沒有進行中的勤務階段',
  );
  const atInspectorSite = Boolean(input.inspectorSiteId && siteId && input.inspectorSiteId === siteId);
  push(
    'current_site',
    '目前督勤案場',
    !input.inspectorSiteId || !siteId
      ? INSPECTION_CHECK_LEVELS.WARNING
      : atInspectorSite
        ? INSPECTION_CHECK_LEVELS.NORMAL
        : INSPECTION_CHECK_LEVELS.EXCEPTION,
    atInspectorSite
      ? `人員位於 ${site?.name ?? '目前案場'}`
      : siteId
        ? `人員目前案場與督勤案場不符（${site?.name ?? siteId}）`
        : '無法判定目前案場',
  );
  push(
    'patrol_miss',
    '本班漏巡',
    patrol.missed > 0 ? INSPECTION_CHECK_LEVELS.WARNING : INSPECTION_CHECK_LEVELS.NORMAL,
    patrol.missed > 0 ? `本班存在 ${patrol.missed} 個漏巡` : '本班尚無漏巡',
  );
  push(
    'patrol_critical',
    '重大巡邏異常',
    patrol.criticalMissed > 0 || patrol.majorExceptions > 0
      ? INSPECTION_CHECK_LEVELS.EXCEPTION
      : INSPECTION_CHECK_LEVELS.NORMAL,
    patrol.criticalMissed > 0 || patrol.majorExceptions > 0
      ? `重大漏巡 ${patrol.criticalMissed}、重大異常 ${patrol.majorExceptions}`
      : '沒有重大巡邏異常',
  );
  push(
    'leave',
    '請假狀態',
    leaves.length > 0 ? INSPECTION_CHECK_LEVELS.WARNING : INSPECTION_CHECK_LEVELS.NORMAL,
    leaves.length > 0 ? '今日有已核准請假' : '今日未在請假中',
  );
  push(
    'correction',
    '補卡待審',
    pendingCorrections.length > 0 ? INSPECTION_CHECK_LEVELS.WARNING : INSPECTION_CHECK_LEVELS.NORMAL,
    pendingCorrections.length > 0 ? `有 ${pendingCorrections.length} 筆補卡待審` : '沒有補卡待審',
  );

  let inspectorDistanceMeters: number | null = null;
  let remoteInspectionWarning = false;
  if (
    site &&
    site.latitude != null &&
    site.longitude != null &&
    site.attendanceRadius != null &&
    input.inspectorLatitude != null &&
    input.inspectorLongitude != null &&
    isValidCoordinate(input.inspectorLatitude, input.inspectorLongitude)
  ) {
    inspectorDistanceMeters = Math.round(
      haversineMeters(input.inspectorLatitude, input.inspectorLongitude, site.latitude, site.longitude),
    );
    if (inspectorDistanceMeters > site.attendanceRadius) {
      remoteInspectionWarning = true;
      push(
        'remote_gps',
        '督勤主管 GPS',
        INSPECTION_CHECK_LEVELS.WARNING,
        `您目前距離案場 ${inspectorDistanceMeters} 公尺`,
      );
    }
  }

  const card = (await buildInspectionEmployeeCard(input.tenantId, input.employee.id, at))!;
  return {
    verification: {
      status: worstStatus(checks.map((item) => item.level)),
      checks,
      remoteInspectionWarning,
      inspectorDistanceMeters,
    },
    scheduleId: duty?.schedule?.id ?? null,
    attendanceId: duty?.attendance?.id ?? null,
    workSessionId: duty?.session?.id ?? null,
    siteId: siteId ?? null,
    card,
  };
}

async function resolveInspectionSite(input: {
  actor: ActorContext;
  employee: User;
  preferredSiteId?: string | null;
}): Promise<string> {
  const tenantId = requireActorTenant(input.actor);
  if (!input.actor.userId) throw new Error('缺少操作者');
  const inspector = await requireUserInTenant(input.actor.userId, tenantId);
  const inspectorSites = await getAuthorizedSites(inspector);
  const grants = await listUserSitePermissions(input.employee.id, tenantId);
  const now = new Date();
  const employeeSiteIds = new Set(
    grants
      .filter((grant) => isWithinRange(now, grant.startsAt, grant.expiresAt, grant.isPermanent))
      .map((grant) => grant.siteId),
  );
  const duty = await getPersonDutyCard(tenantId, input.employee.id, now);
  const currentSite = duty?.site?.id ?? duty?.schedule?.siteId ?? duty?.session?.siteId ?? null;
  if (currentSite) {
    if (!inspectorSites.some((site) => site.id === currentSite)) {
      throw new InspectionUnauthorizedError();
    }
    return currentSite;
  }
  const preferred = input.preferredSiteId ?? input.actor.siteId;
  if (preferred && inspectorSites.some((site) => site.id === preferred) && employeeSiteIds.has(preferred)) {
    return preferred;
  }
  const shared = inspectorSites.find((site) => employeeSiteIds.has(site.id));
  if (!shared) throw new InspectionUnauthorizedError();
  return shared.id;
}

export async function startInspectionFromQr(
  actor: ActorContext,
  rawCode: string,
  input?: {
    at?: Date;
    siteId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    previousInspectionId?: string | null;
    skipCooldown?: boolean;
  },
): Promise<{
  session: InspectionSession;
  card: InspectionEmployeeCard;
  verification: InspectionVerification;
}> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspection.scan');
  await requireActorPermission(actor, 'inspection.create');
  if (!actor.userId) throw new Error('缺少操作者');

  const scan = await scanQr(actor, rawCode, { at: input?.at, skipCooldown: input?.skipCooldown ?? true });
  if (scan.scanResult === QR_SCAN_RESULTS.CROSS_TENANT) {
    throw new TenantAccessError('此 QR 不屬於目前公司');
  }
  if (scan.scanResult === QR_SCAN_RESULTS.UNAUTHORIZED) {
    throw new InspectionUnauthorizedError();
  }
  if (scan.scanResult !== QR_SCAN_RESULTS.VALID || !scan.asset || scan.asset.assetType !== QR_ASSET_TYPES.EMPLOYEE) {
    throw new Error(scan.message || '請掃描員工永久 QR');
  }
  const employee = await requireUserInTenant(scan.asset.targetId, tenantId);
  const siteId = await resolveInspectionSite({
    actor,
    employee,
    preferredSiteId: input?.siteId ?? actor.siteId,
  });
  if (!(await actorCanAccessSiteId(actor, siteId))) {
    throw new InspectionUnauthorizedError();
  }

  const site = await getSiteById(siteId, tenantId);
  if (!site) throw new Error('找不到案場');
  const inspector = await requireUserInTenant(actor.userId, tenantId);
  const at = input?.at ?? new Date();
  const fix = await resolveInspectorFix(input);
  const scene = await verifyInspectionScene({
    tenantId,
    inspectorSiteId: actor.siteId ?? siteId,
    employee,
    at,
    inspectorLatitude: fix.latitude,
    inspectorLongitude: fix.longitude,
  });

  const deviceTime = at.toISOString();
  const session = await insertInspectionSession({
    tenantId,
    siteId,
    employeeUserId: employee.id,
    inspectorUserId: inspector.id,
    employeeQrAssetId: scan.asset.id,
    qrScanLogId: scan.log?.id ?? null,
    startedAt: deviceTime,
    inspectorLatitude: fix.latitude,
    inspectorLongitude: fix.longitude,
    inspectorDistanceMeters: scene.verification.inspectorDistanceMeters,
    remoteInspectionWarning: scene.verification.remoteInspectionWarning,
    verificationStatus: scene.verification.status,
    scheduleId: scene.scheduleId,
    attendanceId: scene.attendanceId,
    workSessionId: scene.workSessionId,
    employeeNameSnapshot: employee.fullName,
    employeeNoSnapshot: employee.employeeNo,
    jobTitleSnapshot: employee.jobTitle,
    siteNameSnapshot: site.name,
    inspectorNameSnapshot: inspector.fullName,
    previousInspectionId: input?.previousInspectionId ?? null,
    deviceTime,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });

  await writeAudit({
    actor,
    action: 'create',
    module: 'inspection',
    description: `${actor.fullName} 於 ${formatDateTimeZh(deviceTime)} 在「${site.name}」掃描員工 QR 並開始督勤「${employee.fullName}」`,
    targetType: 'inspection_session',
    targetId: session.id,
    targetDisplayName: employee.fullName,
    siteId,
    after: { qrScanLogId: session.qrScanLogId, verification: scene.verification.status },
  });
  if (scene.verification.remoteInspectionWarning) {
    await writeAudit({
      actor,
      action: 'warn',
      module: 'inspection',
      description: `${actor.fullName} 於 ${formatDateTimeZh(deviceTime)} 在「${site.name}」遠端 GPS 警告：您目前距離案場 ${scene.verification.inspectorDistanceMeters ?? '—'} 公尺`,
      targetType: 'inspection_session',
      targetId: session.id,
      targetDisplayName: employee.fullName,
      siteId,
      result: 'success',
      after: { remote_inspection_warning: true, distance: scene.verification.inspectorDistanceMeters },
    });
  }
  await writeAudit({
    actor,
    action: 'verify',
    module: 'inspection',
    description: `${actor.fullName} 於 ${formatDateTimeZh(deviceTime)} 在「${site.name}」完成現場驗證「${employee.fullName}」（${scene.verification.status}）`,
    targetType: 'inspection_session',
    targetId: session.id,
    targetDisplayName: employee.fullName,
    siteId,
    after: scene.verification,
  });

  return { session, card: scene.card, verification: scene.verification };
}

export async function requireInspectionSession(id: string, tenantId: string): Promise<InspectionSession> {
  const session = await getInspectionSessionById(id, tenantId);
  if (!session) {
    const other = await getInspectionSessionById(id);
    if (other) throw new TenantAccessError();
    throw new Error('找不到督勤');
  }
  return session;
}

export async function getInspectionContext(
  actor: ActorContext,
  sessionId: string,
  at: Date = new Date(),
): Promise<{
  session: InspectionSession;
  card: InspectionEmployeeCard;
  verification: InspectionVerification;
  criteria: InspectionCriteria[];
  evaluation: InspectionEvaluation | null;
  items: InspectionEvaluationItem[];
  evidence: InspectionEvidence[];
  patrolHint: string | null;
}> {
  const tenantId = requireActorTenant(actor);
  const { actorPermissionKeys } = await import('./access');
  const keys = await actorPermissionKeys(actor);
  if (!keys.includes('inspection.view') && !keys.includes('inspection.viewOwn')) {
    throw new Error('沒有此操作權限');
  }
  const session = await requireInspectionSession(sessionId, tenantId);
  const canViewAll = keys.includes('inspection.view');
  if (!canViewAll && actor.userId !== session.employeeUserId && actor.userId !== session.inspectorUserId) {
    throw new Error('沒有此操作權限');
  }
  if (canViewAll && !(await actorCanAccessSiteId(actor, session.siteId)) && actor.userId !== session.inspectorUserId) {
    throw new InspectionUnauthorizedError();
  }
  const employee = await requireUserInTenant(session.employeeUserId, tenantId);
  const scene = await verifyInspectionScene({
    tenantId,
    inspectorSiteId: session.siteId,
    employee,
    at,
    inspectorLatitude: session.inspectorLatitude,
    inspectorLongitude: session.inspectorLongitude,
  });
  const criteria = (await listInspectionCriteria(tenantId)).filter((item) => item.status === 'active');
  const evaluations = await listInspectionEvaluations(tenantId, { sessionId: session.id });
  const evaluation = evaluations.find((item) => item.status !== 'voided') ?? evaluations[0] ?? null;
  const items = evaluation ? await listEvaluationItems(tenantId, evaluation.id) : [];
  const evidence = await listInspectionEvidence(tenantId, session.id);
  const missed = scene.card.patrol?.missed ?? 0;
  return {
    session,
    card: scene.card,
    verification: scene.verification,
    criteria,
    evaluation,
    items,
    evidence,
    patrolHint: missed > 0 ? `⚠ 本班存在 ${missed} 個漏巡` : null,
  };
}

export interface EvaluationItemDraft {
  criteriaId: string;
  score: number;
  comment?: string | null;
  isAbnormal?: boolean;
  sourcePatrolExceptionId?: string | null;
  sourcePatrolTaskPointId?: string | null;
}

async function writeEvaluationItems(
  tenantId: string,
  evaluationId: string,
  drafts: EvaluationItemDraft[],
  actor: ActorContext,
): Promise<InspectionEvaluationItem[]> {
  const catalog = await listInspectionCriteria(tenantId);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const written: InspectionEvaluationItem[] = [];
  for (const draft of drafts) {
    const criteria = byId.get(draft.criteriaId);
    if (!criteria) throw new Error('找不到評核項目');
    if (criteria.status !== 'active') continue;
    written.push(
      await insertEvaluationItem({
        tenantId,
        evaluationId,
        criteriaId: criteria.id,
        criteriaKeySnapshot: criteria.criteriaKey,
        criteriaNameSnapshot: criteria.displayName,
        score: draft.score,
        maxScore: criteria.maxScore,
        weight: criteria.weight,
        comment: draft.comment ?? null,
        isAbnormal: Boolean(draft.isAbnormal),
        sourcePatrolExceptionId: draft.sourcePatrolExceptionId ?? null,
        sourcePatrolTaskPointId: draft.sourcePatrolTaskPointId ?? null,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      }),
    );
  }
  return written;
}

function detectMajor(items: InspectionEvaluationItem[], catalog: InspectionCriteria[], patrolCritical: boolean): boolean {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  if (patrolCritical) return true;
  return items.some((item) => {
    const criteria = byId.get(item.criteriaId);
    if (item.criteriaKeySnapshot === 'sleeping' || item.criteriaKeySnapshot === 'leaving_post') {
      return item.isAbnormal || item.score <= item.maxScore * 0.4;
    }
    if (item.criteriaKeySnapshot === 'equipment' && item.isAbnormal && criteria?.majorEligible) return true;
    if (item.criteriaKeySnapshot === 'courtesy' && item.isAbnormal && criteria?.majorEligible) return true;
    return Boolean(criteria?.majorEligible && item.isAbnormal);
  });
}

export async function saveInspectionEvaluation(
  actor: ActorContext,
  input: {
    sessionId: string;
    items: EvaluationItemDraft[];
    summary?: string | null;
    complete?: boolean;
    revisesEvaluationId?: string | null;
  },
): Promise<{ evaluation: InspectionEvaluation; items: InspectionEvaluationItem[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspection.evaluate');
  if (!actor.userId) throw new Error('缺少操作者');
  const session = await requireInspectionSession(input.sessionId, tenantId);
  if (!(await actorCanAccessSiteId(actor, session.siteId))) {
    throw new InspectionUnauthorizedError();
  }
  if (session.status === INSPECTION_SESSION_STATUSES.VOIDED) {
    throw new Error('此督勤已撤銷，不能評核');
  }
  if (session.status === INSPECTION_SESSION_STATUSES.CANCELLED) {
    throw new Error('此督勤已取消');
  }

  const existing = (await listInspectionEvaluations(tenantId, { sessionId: session.id })).filter(
    (item) => item.status !== 'voided',
  );
  const current = existing.find((item) => item.status === 'draft') ?? null;
  const completed = existing.find((item) => item.status === 'completed') ?? null;
  if (completed && !input.revisesEvaluationId) {
    throw new Error('已完成的評核不能直接覆寫，請建立更正版本');
  }

  const catalog = await listInspectionCriteria(tenantId);
  const active = catalog.filter((item) => item.status === 'active');
  for (const criteria of active.filter((item) => item.required)) {
    const draft = input.items.find((item) => item.criteriaId === criteria.id);
    if (!draft) throw new Error(`評核項目「${criteria.displayName}」為必填`);
  }

  const policy = await requireInspectionPolicy(tenantId);
  const scored = input.items.map((draft) => {
    const criteria = catalog.find((item) => item.id === draft.criteriaId);
    if (!criteria) throw new Error('找不到評核項目');
    return { score: draft.score, maxScore: criteria.maxScore, weight: criteria.weight };
  });
  const totals = computeWeightedScore(scored);
  const employee = await requireUserInTenant(session.employeeUserId, tenantId);
  const patrol = await loadPatrolContext(tenantId, employee.id, session.siteId, new Date());
  const previewItems = input.items.map((draft) => {
    const criteria = catalog.find((item) => item.id === draft.criteriaId)!;
    return {
      criteriaId: criteria.id,
      criteriaKeySnapshot: criteria.criteriaKey,
      isAbnormal: Boolean(draft.isAbnormal),
      score: draft.score,
      maxScore: criteria.maxScore,
    };
  });
  const majorDeficiency = detectMajor(
    previewItems as InspectionEvaluationItem[],
    catalog,
    patrol.criticalMissed > 0,
  );
  const grade = resolveInspectionGrade(totals.weightedScore, majorDeficiency, policy);

  let evaluation: InspectionEvaluation;
  if (current && !input.revisesEvaluationId) {
    await deleteEvaluationItems(tenantId, current.id);
    evaluation = await updateInspectionEvaluation(current.id, tenantId, {
      totalScore: totals.totalScore,
      maxScore: totals.maxScore,
      weightedScore: totals.weightedScore,
      grade,
      summary: input.summary ?? current.summary,
      majorDeficiency,
      status: input.complete ? 'completed' : 'draft',
    });
    await writeAudit({
      actor,
      action: 'update',
      module: 'inspection',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」修改 draft 評核「${session.employeeNameSnapshot}」`,
      targetType: 'inspection_evaluation',
      targetId: evaluation.id,
      targetDisplayName: session.employeeNameSnapshot,
      siteId: session.siteId,
    });
  } else {
    evaluation = await insertInspectionEvaluation({
      tenantId,
      siteId: session.siteId,
      inspectionSessionId: session.id,
      employeeUserId: session.employeeUserId,
      inspectorUserId: actor.userId,
      totalScore: totals.totalScore,
      maxScore: totals.maxScore,
      weightedScore: totals.weightedScore,
      grade,
      summary: input.summary ?? null,
      majorDeficiency,
      revisesEvaluationId: input.revisesEvaluationId ?? completed?.id ?? null,
      status: input.complete ? 'completed' : 'draft',
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    await writeAudit({
      actor,
      action: 'create',
      module: 'inspection',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」建立評核「${session.employeeNameSnapshot}」`,
      targetType: 'inspection_evaluation',
      targetId: evaluation.id,
      targetDisplayName: session.employeeNameSnapshot,
      siteId: session.siteId,
    });
  }

  const items = await writeEvaluationItems(tenantId, evaluation.id, input.items, actor);
  if (input.complete) {
    await updateInspectionSession(session.id, tenantId, {
      status: INSPECTION_SESSION_STATUSES.COMPLETED,
      completedAt: nowIso(),
    });
    await writeAudit({
      actor,
      action: 'complete',
      module: 'inspection',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」完成評核「${session.employeeNameSnapshot}」（${evaluation.weightedScore} / ${evaluation.grade}）`,
      targetType: 'inspection_evaluation',
      targetId: evaluation.id,
      targetDisplayName: session.employeeNameSnapshot,
      siteId: session.siteId,
      after: { weightedScore: evaluation.weightedScore, grade: evaluation.grade, majorDeficiency },
    });
    if (majorDeficiency) {
      await writeAudit({
        actor,
        action: 'flag',
        module: 'inspection',
        description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」標示重大缺失「${session.employeeNameSnapshot}」`,
        targetType: 'inspection_evaluation',
        targetId: evaluation.id,
        targetDisplayName: session.employeeNameSnapshot,
        siteId: session.siteId,
      });
    }
  }
  return { evaluation, items };
}

export async function addInspectionEvidence(
  actor: ActorContext,
  input: {
    sessionId: string;
    evaluationId?: string | null;
    kind: string;
    localUri: string;
    description?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    liveCameraOnly?: boolean;
  },
): Promise<InspectionEvidence> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspection.evidence.upload');
  const session = await requireInspectionSession(input.sessionId, tenantId);
  if (!input.localUri.trim()) throw new Error('缺少現場照片');
  if (input.liveCameraOnly && (input.localUri.startsWith('file:///fake') || input.localUri.includes('picker'))) {
    throw new Error('重大缺失照片僅能使用現場相機');
  }
  const watermark = await applyPatrolWatermark({
    originalUri: input.localUri,
    siteName: session.siteNameSnapshot,
    pointName: input.kind,
    personName: session.employeeNameSnapshot,
    capturedAt: nowIso(),
    latitude: input.latitude,
    longitude: input.longitude,
    liveCameraOnly: input.liveCameraOnly,
  });
  const evidence = await insertInspectionEvidence({
    tenantId,
    inspectionSessionId: session.id,
    evaluationId: input.evaluationId ?? null,
    kind: input.kind,
    localUri: input.localUri,
    watermarkUri: watermark.watermarkUri,
    capturedBy: actor.userId,
    capturedAt: nowIso(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    description: input.description ?? watermark.overlayText,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'inspection',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」拍攝督勤證據「${session.employeeNameSnapshot}」`,
    targetType: 'inspection_evidence',
    targetId: evidence.id,
    targetDisplayName: session.employeeNameSnapshot,
    siteId: session.siteId,
  });
  return evidence;
}

export async function voidInspection(
  actor: ActorContext,
  sessionId: string,
  reason: string,
): Promise<InspectionSession> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'discipline.approve');
  if (!reason.trim()) throw new Error('撤銷評核必須填寫原因');
  const session = await requireInspectionSession(sessionId, tenantId);
  if (session.status === INSPECTION_SESSION_STATUSES.VOIDED) return session;
  const updated = await updateInspectionSession(session.id, tenantId, {
    status: INSPECTION_SESSION_STATUSES.VOIDED,
    voidReason: reason.trim(),
    voidedBy: actor.userId,
    voidedAt: nowIso(),
  });
  const evaluations = await listInspectionEvaluations(tenantId, { sessionId: session.id });
  for (const evaluation of evaluations) {
    if (evaluation.status !== 'voided') {
      await updateInspectionEvaluation(evaluation.id, tenantId, { status: 'voided' });
    }
  }
  await writeAudit({
    actor,
    action: 'void',
    module: 'inspection',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」撤銷督勤「${session.employeeNameSnapshot}」：${reason.trim()}`,
    targetType: 'inspection_session',
    targetId: session.id,
    targetDisplayName: session.employeeNameSnapshot,
    siteId: session.siteId,
    after: { reason: reason.trim() },
  });
  return updated;
}

export async function requireReinspection(
  actor: ActorContext,
  sessionId: string,
  dueAt: string,
): Promise<InspectionSession> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspection.evaluate');
  const session = await requireInspectionSession(sessionId, tenantId);
  const updated = await updateInspectionSession(session.id, tenantId, {
    reinspectionRequired: true,
    reinspectionDueAt: dueAt,
  });
  await insertNotification({
    tenantId,
    userId: session.inspectorUserId,
    title: '督勤複查到期前提醒',
    body: `${session.siteNameSnapshot}「${session.employeeNameSnapshot}」需於 ${formatDateTimeZh(dueAt)} 前複查`,
    kind: 'inspection_reinspect',
    relatedId: session.id,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'inspection',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」要求複查「${session.employeeNameSnapshot}」`,
    targetType: 'inspection_session',
    targetId: session.id,
    targetDisplayName: session.employeeNameSnapshot,
    siteId: session.siteId,
    after: { reinspectionDueAt: dueAt },
  });
  return updated;
}

export async function startReinspectionFromQr(
  actor: ActorContext,
  previousSessionId: string,
  rawCode: string,
  input?: { at?: Date; siteId?: string | null; latitude?: number | null; longitude?: number | null },
): Promise<{ session: InspectionSession; card: InspectionEmployeeCard; verification: InspectionVerification }> {
  const tenantId = requireActorTenant(actor);
  const previous = await requireInspectionSession(previousSessionId, tenantId);
  return startInspectionFromQr(actor, rawCode, {
    ...input,
    previousInspectionId: previous.id,
    skipCooldown: true,
  });
}

export async function listOwnInspectionHistory(actor: ActorContext): Promise<
  Array<{
    session: InspectionSession;
    evaluation: InspectionEvaluation | null;
    improvementStatus: string | null;
  }>
> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspection.viewOwn');
  if (!actor.userId) throw new Error('缺少操作者');
  const keys = await requireActorPermission(actor, 'inspection.viewOwn');
  const sessions = keys.includes('inspection.view')
    ? await listInspectionSessions(tenantId)
    : await listInspectionSessions(tenantId, { employeeUserId: actor.userId });
  const scoped: InspectionSession[] = [];
  for (const session of sessions) {
    if (keys.includes('inspection.view') && !(await actorCanAccessSiteId(actor, session.siteId))) {
      if (session.employeeUserId !== actor.userId && session.inspectorUserId !== actor.userId) continue;
    }
    scoped.push(session);
  }
  const { listImprovementOrders } = await import('@/repositories/improvementRepository');
  const rows = [];
  for (const session of scoped) {
    const evaluations = await listInspectionEvaluations(tenantId, { sessionId: session.id });
    const evaluation = evaluations.find((item) => item.status === 'completed') ?? evaluations[0] ?? null;
    const orders = evaluation
      ? await listImprovementOrders(tenantId, { employeeUserId: session.employeeUserId })
      : [];
    const related = orders.find((item) => item.inspectionEvaluationId === evaluation?.id) ?? null;
    rows.push({ session, evaluation, improvementStatus: related?.status ?? null });
  }
  return rows;
}

export async function remindDueReinspections(tenantId: string, at: Date = new Date()): Promise<number> {
  const sessions = (await listInspectionSessions(tenantId)).filter(
    (item) => item.reinspectionRequired && item.reinspectionDueAt && item.status !== INSPECTION_SESSION_STATUSES.VOIDED,
  );
  let count = 0;
  for (const session of sessions) {
    const due = new Date(session.reinspectionDueAt!);
    const soon = due.getTime() - at.getTime() <= 24 * 60 * 60 * 1000 && due.getTime() >= at.getTime();
    if (!soon) continue;
    const existing = await listNotifications(tenantId, session.inspectorUserId);
    if (existing.some((item) => item.kind === 'inspection_reinspect_due' && item.relatedId === session.id)) continue;
    await insertNotification({
      tenantId,
      userId: session.inspectorUserId,
      title: '督勤複查即將到期',
      body: `${session.siteNameSnapshot}「${session.employeeNameSnapshot}」複查將於 ${formatDateTimeZh(session.reinspectionDueAt!)} 到期`,
      kind: 'inspection_reinspect_due',
      relatedId: session.id,
    });
    count += 1;
  }
  return count;
}

export { actorIsSuperAdmin };
