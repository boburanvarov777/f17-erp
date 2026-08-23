import { StageStatus, StageType } from '@prisma/client';

const CUTTING = 'CUTTING' satisfies StageType;

/** Derive stage status from counters; cutting never auto-completes so over-plan output stays editable. */
export function resolveStageStatus(
  doneQty: number,
  planQty: number,
  prev?: StageStatus,
  stage?: StageType,
): StageStatus {
  if (stage === CUTTING) {
    if (prev === 'BLOCKED' || prev === 'DELAYED') return prev;
    if (doneQty > 0) return 'IN_PROGRESS';
    if (prev === 'NOT_STARTED') return prev;
    return 'WAITING';
  }
  if (planQty > 0 && doneQty >= planQty) return 'COMPLETED';
  if (doneQty > 0) return 'IN_PROGRESS';
  if (prev === 'NOT_STARTED' || prev === 'BLOCKED' || prev === 'DELAYED') return prev;
  return 'WAITING';
}

export function stageProgress(doneQty: number, planQty: number, stage?: StageType): number {
  if (planQty <= 0) return 0;
  const pct = Math.round((doneQty / planQty) * 100);
  return stage === CUTTING ? pct : Math.min(100, pct);
}

export function stageEndDate(status: StageStatus, prev?: Date | null): Date | null {
  return status === 'COMPLETED' ? (prev ?? new Date()) : null;
}

export function isCuttingStage(stage?: StageType): boolean {
  return stage === CUTTING;
}
