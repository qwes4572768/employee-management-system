import type { InspectionGrade } from '@/constants/inspection';
import type { InspectionPolicy } from '@/types';

export interface WeightedScoreInput {
  score: number;
  maxScore: number;
  weight: number;
}

export function computeWeightedScore(items: WeightedScoreInput[]): {
  totalScore: number;
  maxScore: number;
  weightedScore: number;
} {
  let totalScore = 0;
  let maxScore = 0;
  let weightSum = 0;
  let weighted = 0;
  for (const item of items) {
    const max = item.maxScore > 0 ? item.maxScore : 0;
    totalScore += item.score;
    maxScore += max;
    if (item.weight > 0 && max > 0) {
      weighted += (item.score / max) * item.weight;
      weightSum += item.weight;
    }
  }
  const weightedScore = weightSum > 0 ? Math.round((weighted / weightSum) * 1000) / 10 : 0;
  return { totalScore, maxScore, weightedScore };
}

export function resolveInspectionGrade(
  weightedScore: number,
  majorDeficiency: boolean,
  policy: Pick<InspectionPolicy, 'excellentMinScore' | 'goodMinScore' | 'passMinScore'>,
): InspectionGrade {
  if (majorDeficiency && weightedScore < policy.passMinScore) return 'serious_issue';
  if (majorDeficiency || weightedScore < policy.passMinScore) return 'needs_improvement';
  if (weightedScore >= policy.excellentMinScore) return 'excellent';
  if (weightedScore >= policy.goodMinScore) return 'good';
  if (weightedScore >= policy.passMinScore) return 'pass';
  return 'needs_improvement';
}
