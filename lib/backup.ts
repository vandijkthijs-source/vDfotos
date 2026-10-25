import type { Connection } from '../features/sorting/types';
export type Measurement = { files: number; bytes: number; measuredAt: number; recoverableFiles?: number; recoverableBytes?: number };
export type BackupStatus = {
  primary: Measurement | null;
  backup: Measurement | null;
  library: { active: number | null; trashed: number | null };
  backupMissingSince: number | null;
  checkedAt: number;
};
export function validMeasurement(value: unknown): value is Measurement {
  if (!value || typeof value !== 'object') return false;
  const m = value as Measurement;
  return [m.files, m.bytes, m.measuredAt].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && (m.recoverableFiles === undefined || Number.isSafeInteger(m.recoverableFiles) && m.recoverableFiles >= 0)
    && (m.recoverableBytes === undefined || Number.isSafeInteger(m.recoverableBytes) && m.recoverableBytes >= 0)
    && m.measuredAt <= Date.now() + 60000;
}
export function isFresh(m: Measurement | null, now: number) { return !!m && now - m.measuredAt < 120000; }
export function bytes(n: number) {
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
}
export async function fetchBackupStatus(connection: Connection, signal: AbortSignal): Promise<BackupStatus> {
  const url = new URL(connection.url);
  url.port = '2284'; url.pathname = '/backup-status'; url.search = ''; url.hash = '';
  const response = await fetch(url.toString(), { headers: { 'x-api-key': connection.key }, signal });
  if (!response.ok) throw new Error('Backup status unavailable');
  const result = await response.json();
  if (!result || !('primary' in result) || !('backup' in result)) throw new Error('Invalid status');
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const missingSince = result.backupMissingSince;
  return {
    primary: validMeasurement(result.primary) ? result.primary : null,
    backup: validMeasurement(result.backup) ? result.backup : null,
    library: { active: count(result.library?.active), trashed: count(result.library?.trashed) },
    backupMissingSince: typeof missingSince === 'number' && Number.isFinite(missingSince) && missingSince >= 0 && missingSince <= Date.now() + 60000 ? missingSince : null,
    checkedAt: Date.now(),
  };
}
