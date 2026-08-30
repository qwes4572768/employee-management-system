import { BEREAVEMENT_RELATIONS, type BereavementRelation } from '@/constants/leave';

export function yearsOfService(hireDate: string, at: Date): number {
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) {
    return 0;
  }
  let years = at.getFullYear() - hire.getFullYear();
  const anniversary = new Date(at.getFullYear(), hire.getMonth(), hire.getDate());
  if (at < anniversary) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function monthsOfService(hireDate: string, at: Date): number {
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) {
    return 0;
  }
  return Math.max(
    0,
    (at.getFullYear() - hire.getFullYear()) * 12 + (at.getMonth() - hire.getMonth()) - (at.getDate() < hire.getDate() ? 1 : 0),
  );
}

export class TaiwanLeavePolicyService {
  annualLeaveEntitlementDays(hireDate: string | null, at: Date = new Date()): number {
    if (!hireDate) return 0;
    const months = monthsOfService(hireDate, at);
    if (months < 6) return 0;
    const years = yearsOfService(hireDate, at);
    if (years < 1) return 3;
    if (years < 2) return 7;
    if (years < 3) return 10;
    if (years < 5) return 14;
    if (years < 10) return 15;
    return Math.min(30, 15 + (years - 9));
  }

  bereavementEntitlementDays(relation: BereavementRelation): number {
    switch (relation) {
      case BEREAVEMENT_RELATIONS.PARENT:
      case BEREAVEMENT_RELATIONS.ADOPTIVE_PARENT:
      case BEREAVEMENT_RELATIONS.STEP_PARENT:
      case BEREAVEMENT_RELATIONS.SPOUSE:
        return 8;
      case BEREAVEMENT_RELATIONS.GRANDPARENT:
      case BEREAVEMENT_RELATIONS.CHILD:
      case BEREAVEMENT_RELATIONS.SPOUSE_PARENT:
      case BEREAVEMENT_RELATIONS.SPOUSE_ADOPTIVE_PARENT:
      case BEREAVEMENT_RELATIONS.SPOUSE_STEP_PARENT:
        return 6;
      case BEREAVEMENT_RELATIONS.GREAT_GRANDPARENT:
      case BEREAVEMENT_RELATIONS.SIBLING:
      case BEREAVEMENT_RELATIONS.SPOUSE_GRANDPARENT:
        return 3;
      default:
        return 0;
    }
  }

  personalLeaveAnnualCapDays(): number {
    return 14;
  }

  warnIfBelowStatutory(kind: 'annual' | 'personal' | 'bereavement', configured: number, statutory: number): string | null {
    if (configured < statutory) {
      return `設定值 ${configured} 低於台灣法定最低 ${statutory}（${kind}），請確認是否仍要使用`;
    }
    return null;
  }
}

export const taiwanLeavePolicy = new TaiwanLeavePolicyService();
