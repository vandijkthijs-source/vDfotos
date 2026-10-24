import type { Asset, Progress } from './types';

export function isReviewed(progress: Progress | undefined, id: string) {
  const decision = progress?.completed[id];
  return !!decision && decision.at > (progress?.resetWeeks?.[decision.week] ?? -1);
}

export function isWeekSorted(progress: Progress | undefined, week: string, assets: Asset[]) {
  if (!progress || Object.values(progress.pending).some(d => d.week === week)) return false;
  const hasHistory = Object.values(progress.completed).some(d => d.week === week && d.at > (progress.resetWeeks?.[week] ?? -1));
  return (assets.length > 0 || hasHistory || (!!progress.manualWeeks?.[week] && !progress.resetWeeks?.[week])) && assets.every(a => isReviewed(progress, a.id));
}

// Revalidate false markers too: older builds may have saved one before applying.
export function weeksToRecheck(progress: Progress | undefined) {
  return [...new Set([
    ...Object.keys(progress?.sortedWeeks ?? {}),
    ...Object.keys(progress?.resetWeeks ?? {}),
    ...Object.keys(progress?.manualWeeks ?? {}),
    ...Object.values(progress?.completed ?? {}).map(d => d.week),
  ])].sort().reverse();
}
