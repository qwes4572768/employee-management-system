export interface PatrolWatermarkInput {
  originalUri: string;
  siteName: string;
  pointName: string;
  personName: string;
  capturedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  liveCameraOnly?: boolean;
}

export interface PatrolWatermarkResult {
  originalUri: string;
  watermarkUri: string | null;
  overlayText: string;
}

export function buildPatrolWatermarkText(input: PatrolWatermarkInput): string {
  const gps =
    input.latitude != null && input.longitude != null
      ? `${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`
      : '無 GPS';
  return ['勤管系統', input.siteName, input.pointName, input.personName, input.capturedAt.replace('T', ' ').slice(0, 16), gps].join(
    ' / ',
  );
}

export async function applyPatrolWatermark(input: PatrolWatermarkInput): Promise<PatrolWatermarkResult> {
  return {
    originalUri: input.originalUri,
    watermarkUri: null,
    overlayText: buildPatrolWatermarkText(input),
  };
}
