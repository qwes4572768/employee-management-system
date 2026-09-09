import type { Gender } from '@/types';
import { toDateOnly } from '@/utils/datetime';

export interface OnboardingDraft {
  admin: {
    fullName: string;
    phone: string;
    employeeNo: string;
    gender: Gender;
    hireDate: string;
    jobTitle: string;
    account: string;
    password: string;
    confirmPassword: string;
  };
  company: {
    officialName: string;
    shortName: string;
    taxId: string;
    phone: string;
    address: string;
    industryType: string;
  };
  site: {
    siteCode: string;
    name: string;
    address: string;
    attendanceRadius: string;
    requireGps: boolean;
    requireSiteQr: boolean;
  };
}

const empty: OnboardingDraft = {
  admin: {
    fullName: '',
    phone: '',
    employeeNo: '',
    gender: 'unspecified',
    hireDate: toDateOnly(new Date()),
    jobTitle: '',
    account: '',
    password: '',
    confirmPassword: '',
  },
  company: {
    officialName: '',
    shortName: '',
    taxId: '',
    phone: '',
    address: '',
    industryType: 'security',
  },
  site: {
    siteCode: '',
    name: '',
    address: '',
    attendanceRadius: '',
    requireGps: false,
    requireSiteQr: false,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let draft: OnboardingDraft = clone(empty);

export function getOnboardingDraft(): OnboardingDraft {
  return draft;
}

export function patchOnboardingDraft(patch: Partial<OnboardingDraft>): void {
  draft = {
    admin: { ...draft.admin, ...patch.admin },
    company: { ...draft.company, ...patch.company },
    site: { ...draft.site, ...patch.site },
  };
}

export function resetOnboardingDraft(): void {
  draft = clone(empty);
}
