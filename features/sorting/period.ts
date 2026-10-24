import type { Asset, Decision, Progress } from './types';
import { dayKey, monday, parseDay, weekBounds, weekLabel } from './week';
import { isReviewed } from './progress';
export type SortPeriod = 'weeks' | 'months';
export function monthStart(value = new Date()) { const date = new Date(value); date.setDate(1); return dayKey(date); }
export function shiftMonth(value: string, amount: number) { const date = parseDay(value); date.setDate(1); date.setMonth(date.getMonth() + amount); return dayKey(date); }
export function monthBounds(value: string) {
  const start = parseDay(value); start.setDate(1); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
export function periodLabel(value: string, mode: SortPeriod) { return mode === 'weeks' ? weekLabel(value) : parseDay(value).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
export function assetWeek(asset: Asset) { return monday(new Date(asset.fileCreatedAt)); }
export function inPeriod(asset: Asset, value: string, mode: SortPeriod) {
  const bounds = mode === 'weeks' ? weekBounds(value) : monthBounds(value);
  const timestamp = Date.parse(asset.fileCreatedAt);
  return timestamp >= Date.parse(bounds.start) && timestamp < Date.parse(bounds.end);
}
export function periodDecisions(progress: Progress | undefined, value: string, mode: SortPeriod): Decision[] {
  return Object.values(progress?.pending ?? {}).filter(d => mode === 'weeks' ? d.week === value : inPeriod(d.asset, value, mode)).sort((a, b) => a.at - b.at);
}
export function remainingPhotos(progress: Progress | undefined, assets: Asset[], reviewAgain = false, reviewedAgain: string[] = []) {
  return assets.filter(asset => !progress?.pending[asset.id] && (!isReviewed(progress, asset.id) || (reviewAgain && !reviewedAgain.includes(asset.id))));
}
export function monthSummary(progress: Progress | undefined, value: string, assets: Asset[]) {
  const reviewed = assets.filter(asset => isReviewed(progress, asset.id)).length;
  const pending = periodDecisions(progress, value, 'months').length;
  const bounds = monthBounds(value);
  const history = Object.values(progress?.completed ?? {}).some(d => {
    const range = weekBounds(d.week);
    return d.at > (progress?.resetWeeks?.[d.week] ?? -1) && range.start < bounds.end && range.end > bounds.start;
  });
  return { reviewed, total: assets.length, pending, sorted: pending === 0 && reviewed === assets.length && (assets.length > 0 || history) };
}
