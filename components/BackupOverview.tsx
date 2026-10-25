import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Connection } from '../features/sorting/types';
import { colors as c } from '../constants/theme';
import { bytes, fetchBackupStatus, isFresh, type BackupStatus, type Measurement } from '../lib/backup';
import { Icon, s } from './ui';

const green = '#8bd6b0', amber = '#e4bc76', red = '#ef8585';
function Laptop({ title, address, measurement, total, tint, status, backup = false }: { title: string; address: string; measurement: Measurement | null; total: number | null; tint: string; status: string; backup?: boolean }) {
  return <View style={styles.device}>
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={[styles.screen, { borderColor: tint }]}><Icon name={backup ? 'shield-checkmark-outline' : 'images-outline'} color={tint} size={24} /></View>
      <View style={[styles.base, { backgroundColor: tint }]} />
    </View>
    <Text style={[s.label, { textAlign: 'center' }]}>{title}</Text>
    <Text style={[s.small, { textAlign: 'center', fontSize: 10 }]}>{address}</Text>
    <Text style={[styles.total, { color: measurement ? c.text : c.muted }]}>{measurement ? bytes(measurement.bytes) : '—'}</Text>
    <Text style={[s.label, { textAlign: 'center', fontSize: 12 }]}>{`${measurement?.files.toLocaleString() ?? '—'} / ${total?.toLocaleString() ?? '—'} files`}</Text>
    <Text style={{ color: tint, fontSize: 11, textAlign: 'center', fontWeight: '600' }}>{status}</Text>
  </View>;
}

function CountRow({ label, immich, server, backup, header = false }: { label: string; immich?: number | null; server?: number | null; backup?: number | null; header?: boolean }) {
  const value = (n: number | null | undefined) => n === undefined ? '' : n === null ? '—' : n.toLocaleString();
  return <View style={[styles.countRow, header && styles.countHeader]}>
    <Text style={[styles.countLabel, header && styles.countHeading]}>{label}</Text>
    <Text style={[styles.countValue, header && styles.countHeading]}>{header ? 'Immich' : value(immich)}</Text>
    <Text style={[styles.countValue, header && styles.countHeading]}>{header ? 'Server' : value(server)}</Text>
    <Text style={[styles.countValue, header && styles.countHeading]}>{header ? 'Backup' : value(backup)}</Text>
  </View>;
}

export function BackupOverview({ connection, refreshKey = 0 }: { connection: Connection; refreshKey?: number }) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now()), [retry, setRetry] = useState(0);
  useEffect(() => {
    setStatus(null); setFailed(false);
  }, [connection]);
  useEffect(() => {
    if (connection.demo) return;
    let disposed = false, inFlight = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (inFlight || disposed || AppState.currentState === 'background') return;
      inFlight = true; controller = new AbortController(); setBusy(true);
      const timer = setTimeout(() => controller?.abort(), 30000);
      try {
        const next = await fetchBackupStatus(connection, controller.signal);
        if (!disposed) { setStatus(next); setFailed(false); }
      } catch { if (!disposed) setFailed(true); }
      finally { clearTimeout(timer); inFlight = false; if (!disposed) { setBusy(false); setNow(Date.now()); } }
    }
    void refresh();
    const poll = setInterval(() => { setNow(Date.now()); void refresh(); }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { disposed = true; controller?.abort(); clearInterval(poll); subscription.remove(); };
  }, [connection, refreshKey, retry]);
  const primary = status?.primary ?? null, backup = status?.backup ?? null;
  const primaryFresh = !failed && isFresh(primary, now), backupFresh = !failed && isFresh(backup, now);
  const complete = primaryFresh && backupFresh && !!primary && !!backup && primary.files === backup.files && primary.bytes === backup.bytes;
  const unavailable = failed || !primary || !backup;
  const outOfDate = !primaryFresh || !backupFresh;
  const tint = complete ? green : unavailable || outOfDate ? red : amber;
  const state = complete ? 'Fully backed up' : unavailable ? 'Unavailable' : outOfDate ? 'Out of date' : 'Copies differ';
  const ratio = primaryFresh && backupFresh && primary && backup && primary.files > 0 ? Math.min(1, backup.files / primary.files) : null;
  return <View style={styles.panel}>
    <View style={{ alignItems: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh photo backup status" disabled={busy || connection.demo} onPress={() => setRetry(n => n + 1)} style={{ padding: 12, opacity: connection.demo ? .4 : 1 }}>
        {busy ? <ActivityIndicator size="small" color={c.text} /> : <Icon name="refresh-outline" size={20} />}
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Laptop title="Server laptop" address={new URL(connection.url).hostname} measurement={primary} total={primary?.files ?? null} tint={tint} status={state} />
      <Icon name="arrow-forward-outline" size={18} color={c.muted} />
      <Laptop title="Backup laptop" address="192.168.68.117" measurement={backup} total={primary?.files ?? null} tint={tint} status={state} backup />
    </View>
    {ratio !== null && <View accessibilityRole="progressbar" accessibilityLabel="Backup file count compared with server" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={styles.track}><View style={{ height: 5, width: `${ratio * 100}%`, backgroundColor: tint, borderRadius: 3 }} /></View>}
    <View style={styles.counts}>
      <CountRow label="Measurement" header />
      <CountRow label="Active photos" immich={status?.library.active} />
      <CountRow label="Photos in Trash" immich={status?.library.trashed} />
      <CountRow label="Files physically stored" server={primary?.files ?? null} backup={backup?.files ?? null} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  panel: { backgroundColor: c.panel, borderColor: c.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 16 },
  device: { flex: 1, gap: 5, alignItems: 'stretch', minWidth: 0 },
  screen: { width: 72, height: 45, borderWidth: 2, borderRadius: 5, backgroundColor: '#20242a', alignItems: 'center', justifyContent: 'center' },
  base: { width: 88, height: 3, borderRadius: 4, marginTop: -4, marginBottom: 7 },
  total: { fontSize: 23, fontWeight: '700', textAlign: 'center', marginTop: 7 },
  track: { height: 5, backgroundColor: c.raised, borderRadius: 3, overflow: 'hidden' },
  counts: { borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden' },
  countRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: c.border },
  countHeader: { borderTopWidth: 0, backgroundColor: c.raised },
  countLabel: { flex: 1.5, color: c.text, fontSize: 11 },
  countValue: { flex: 0.75, color: c.text, fontSize: 11, fontVariant: ['tabular-nums'], textAlign: 'right' },
  countHeading: { color: c.muted, fontSize: 10, fontWeight: '600' },
});
