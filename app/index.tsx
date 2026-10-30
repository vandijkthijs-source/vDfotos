import { BackupOverview } from '../components/BackupOverview';
import { useImagePreload } from '../lib/imagePreload';
import { assetWeek, monthStart, shiftMonth, periodLabel, periodDecisions, remainingPhotos, monthSummary, type SortPeriod } from '../features/sorting/period';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors as c } from '../constants/theme';
import { Button, Field, Icon, IconButton, Notice, s } from '../components/ui';
import { Library } from '../components/Library';
import { PhotoCard } from '../components/PhotoCard';
import type { Album, Asset, Connection } from '../features/sorting/types';
import { monday, shiftWeek, weekBounds } from '../features/sorting/week';
import { demoAlbums, demoAssets, demoMonth } from '../features/sorting/demo';
import { isReviewed, isWeekSorted, weeksToRecheck } from '../features/sorting/progress';
import { commitDecisions } from '../features/sorting/commit';
import { ImmichClient, normalizeUrl } from '../lib/immich';
import { syncProgress } from '../lib/sync';
import { loadConnection, saveConnection } from '../lib/credentials';
import { useSortStore } from '../store/useSortStore';

const message = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
type Page = 'backup' | 'photos' | 'albums' | 'search' | 'weeks' | 'sort' | 'settings';
const EMPTY_MONTH_SUMMARIES: Record<string, { reviewed: number; total: number; sorted: boolean; checkedAt: number }> = {};
const MONTH_SUMMARY_CACHE_TTL = 5 * 60 * 1000;

export default function Home() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [hydrated, setHydrated] = useState(useSortStore.persist.hasHydrated());
  const [booting, setBooting] = useState(true), [page, setPage] = useState<Page>('photos');
  const [url, setUrl] = useState(''), [key, setKey] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [week, setWeek] = useState(monday()), [weekCount, setWeekCount] = useState(52);
  const [periodMode, setPeriodMode] = useState<SortPeriod>('weeks');
  const [monthCount, setMonthCount] = useState(12);
  const [monthPhotos, setMonthPhotos] = useState<Record<string, Asset[]>>({});
  const [periodCovers, setPeriodCovers] = useState<Record<string, Asset>>({});
  const [assets, setAssets] = useState<Asset[]>([]), [albums, setAlbums] = useState<Album[]>([]);
  const [picker, setPicker] = useState(false), [newAlbum, setNewAlbum] = useState('');
  const [applyRemaining, setApplyRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState(''), [albumBusy, setAlbumBusy] = useState(false);
  const [reload] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [unsortedOnly, setUnsortedOnly] = useState(false);
  const [syncState, setSyncState] = useState('');
  const [syncTick, setSyncTick] = useState(0), [syncRevision, setSyncRevision] = useState(0);
  const [manualConfirm, setManualConfirm] = useState(false);
  const syncing = useRef(false);
  const [help, setHelp] = useState(false);
  const markWeek = useSortStore(state => state.markWeek);
  const weeks = useMemo(() => Array.from({ length: weekCount }, (_, i) => shiftWeek(monday(), -i)), [weekCount]);
  const months = useMemo(() => Array.from({ length: monthCount }, (_, index) => shiftMonth(monthStart(), -index)), [monthCount]);
  const periods = periodMode === 'weeks' ? weeks : months;
  const currentPeriodLabel = periodLabel(week, periodMode);
  const periodNoun = periodMode === 'weeks' ? 'week' : 'month';
  const [reviewAgain, setReviewAgain] = useState(false);
  const [reviewedAgain, setReviewedAgain] = useState<string[]>([]);
  const [createAlbumRequest, setCreateAlbumRequest] = useState(0);
  const pendingKeep = useRef<Asset | null>(null), commitLock = useRef(false);
  const mainScroll = useRef<ScrollView>(null);
  const account = connection ? `${connection.url}|${connection.userId}` : '';
  const progress = useSortStore(state => state.accounts[account]);
  const monthSummaries = useSortStore(state => state.monthSummaries[account] ?? EMPTY_MONTH_SUMMARIES);
  const cacheMonthSummary = useSortStore(state => state.cacheMonthSummary);
  const stage = useSortStore(state => state.stage), undo = useSortStore(state => state.undo);
  const complete = useSortStore(state => state.complete), selectAlbum = useSortStore(state => state.selectAlbum);
  const api = useMemo(() => connection && !connection.demo ? new ImmichClient(connection) : null, [connection]);
  const weekPending = useMemo(() => periodDecisions(progress, week, periodMode), [progress, week, periodMode]);
  useEffect(() => {
    if (!unsortedOnly || page !== 'weeks' || !periods.length) return;
    const allSorted = periods.every(value => {
      const pending = periodDecisions(progress, value, periodMode).length > 0;
      if (pending) return false;
      if (periodMode === 'weeks') return !!progress?.sortedWeeks?.[value];
      const photos = monthPhotos[value];
      if (photos) {
        const summary = monthSummary(progress, value, photos);
        return summary.sorted || summary.total === 0;
      }
      const cached = monthSummaries[value];
      if (!cached) return false;
      return cached.total === 0 || cached.reviewed === cached.total;
    });
    if (allSorted) {
      if (periodMode === 'weeks') setWeekCount(count => count + 52);
      else setMonthCount(count => count + 12);
    }
  }, [monthPhotos, monthSummaries, page, periodMode, periods, progress, unsortedOnly]);
  const allPending = Object.values(progress?.pending ?? {});
  const remaining = remainingPhotos(progress, assets, reviewAgain, reviewedAgain);
  useImagePreload(page === 'sort' ? connection : null, remaining.slice(1, 4));
  const latest = weekPending[weekPending.length - 1];

  useEffect(() => {
    const off = useSortStore.persist.onFinishHydration(() => setHydrated(true));
    loadConnection().then(value => { setConnection(value); setUrl(value?.url ?? ''); }).catch(e => setError(message(e))).finally(() => setBooting(false));
    return off;
  }, []);
  useEffect(() => { mainScroll.current?.scrollTo({ y: 0, animated: false }); }, [page, week, connection]);
  useEffect(() => {
    if (!connection || !hydrated || page !== 'sort') return;
    let valid = true;
    const abort = new AbortController();
    setLoading(true); setError(''); setAssets([]);
    if (connection.demo) {
      const photos = periodMode === 'weeks' ? demoAssets(week) : demoMonth(week);
      if (periodMode === 'weeks') markWeek(account, week, isWeekSorted(useSortStore.getState().accounts[account], week, photos));
      setAssets(photos); setAlbums(demoAlbums); setLoading(false); return;
    }
    Promise.all([periodMode === 'weeks' ? api!.week(week, abort.signal) : api!.month(week, abort.signal), api!.albums()]).then(([photos, list]) => {
      if (valid) { setAssets(photos);
        const saved = useSortStore.getState().accounts[account];
        if (periodMode === 'weeks') markWeek(account, week, isWeekSorted(saved, week, photos));
        setAlbums(list.sort((a, b) => a.albumName.localeCompare(b.albumName))); }
    }).catch(e => { if (valid) setError(message(e)); }).finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; abort.abort(); };
  }, [api, connection, hydrated, week, reload, page, account, markWeek, periodMode]);

  // Refresh known weeks, including stale false markers left by older builds.
  useEffect(() => {
    if (!connection || !hydrated || page !== 'weeks' || periodMode !== 'weeks') return;
    const abort = new AbortController();
    const saved = useSortStore.getState().accounts[account];
    const candidates = weeksToRecheck(saved);
    void (async () => {
      for (const value of candidates) {
        try {
          const photos = connection.demo ? demoAssets(value) : await api!.week(value, abort.signal);
          if (abort.signal.aborted) return;
          markWeek(account, value, isWeekSorted(useSortStore.getState().accounts[account], value, photos));
        } catch { if (abort.signal.aborted) return; }
      }
    })();
    return () => abort.abort();
  }, [account, api, connection, hydrated, markWeek, page, syncRevision, periodMode]);

  useEffect(() => { setMonthPhotos({}); }, [account]);
  useEffect(() => { setPeriodCovers({}); }, [account]);
  useEffect(() => {
    if (!connection || !hydrated || page !== 'weeks' || periodMode !== 'weeks' || !weeks.length) return;
    let valid = true;
    if (connection.demo) {
      const samples = weeks.flatMap(value => demoAssets(value).slice(0, 1));
      setPeriodCovers(old => ({ ...old, ...Object.fromEntries(samples.map(asset => [`weeks:${assetWeek(asset)}`, asset])) }));
      return () => { valid = false; };
    }
    const { start } = weekBounds(weeks[weeks.length - 1]);
    const { end } = weekBounds(weeks[0]);
    void api!.randomInRange(start, end, Math.min(1000, weeks.length * 8)).then(samples => {
      if (!valid) return;
      const counts: Record<string, number> = {};
      const covers: Record<string, Asset> = {};
      for (const asset of samples) {
        if (asset.ownerId !== connection.userId || asset.isTrashed || !['IMAGE', 'VIDEO'].includes(asset.type)) continue;
        const value = assetWeek(asset);
        if (!weeks.includes(value)) continue;
        const count = counts[value] ?? 0;
        counts[value] = count + 1;
        if (Math.random() < 1 / (count + 1)) covers[`weeks:${value}`] = asset;
      }
      setPeriodCovers(old => ({ ...old, ...covers }));
    }).catch(() => { /* Keep the lightweight placeholder if cover sampling is unavailable. */ });
    return () => { valid = false; };
  }, [api, connection, hydrated, page, periodMode, weeks]);
  useEffect(() => {
    if (!connection || !hydrated || page !== 'weeks' || periodMode !== 'months') return;
    const abort = new AbortController();
    void (async () => {
      for (const value of months) {
        if (abort.signal.aborted) return;
        try {
          const cached = useSortStore.getState().monthSummaries[account]?.[value];
          if (!connection.demo && cached && Date.now() - cached.checkedAt < MONTH_SUMMARY_CACHE_TTL) continue;
          const photos = connection.demo ? demoMonth(value) : await api!.month(value, abort.signal);
          if (abort.signal.aborted) return;
          setMonthPhotos(old => ({ ...old, [value]: photos }));
          const summary = monthSummary(useSortStore.getState().accounts[account], value, photos);
          const cover = photos.length ? photos[Math.floor(Math.random() * photos.length)] : undefined;
          cacheMonthSummary(account, value, { reviewed: summary.reviewed, total: summary.total, sorted: summary.sorted, checkedAt: Date.now(), cover });
          if (cover) setPeriodCovers(old => old[`months:${value}`] ? old : ({ ...old, [`months:${value}`]: cover }));
        } catch (e) { if (!abort.signal.aborted) setError(message(e)); return; }
      }
    })();
    return () => abort.abort();
  }, [account, api, cacheMonthSummary, connection, hydrated, months, page, periodMode, syncRevision]);

  useEffect(() => {
    if (!connection || connection.demo || !hydrated) return;
    let valid = true;
    async function sync() {
      if (!valid || syncing.current || AppState.currentState === 'background') return;
      syncing.current = true; setSyncState('Syncing progress…');
      try {
        const remote = await syncProgress(connection!, useSortStore.getState().accounts[account]);
        if (!valid) return;
        useSortStore.getState().mergeRemote(account, remote);
        setSyncState('Progress synced'); setSyncRevision(n => n + 1);
      } catch { if (valid) setSyncState('Progress saved on this device. Server sync unavailable; retry when connected.'); }
      finally { syncing.current = false; }
    }
    const start = setTimeout(sync, 700);
    const timer = setInterval(sync, 30000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { valid = false; clearTimeout(start); clearInterval(timer); listener.remove(); };
  }, [account, connection, hydrated, progress?.completed, progress?.manualWeeks, progress?.resetWeeks, syncTick]);

  function toggleSelection(value: string) {
    setSelectedWeeks(old => old.includes(value) ? old.filter(w => w !== value) : [...old, value]);
  }
  async function setSelectedSorted(sorted: boolean) {
    if (busy || !selectedWeeks.length) return;
    if (allPending.some(d => selectedWeeks.includes(d.week))) {
      setError('Apply or undo pending decisions in the selected weeks first.'); return;
    }
    setBusy(true); setError('');
    try {
      // Fetch all snapshots first so a network failure cannot half-mark the selection.
      const snapshots: { week: string; photos: Asset[] }[] = [];
      for (const value of selectedWeeks) snapshots.push({ week: value, photos: sorted ? (connection?.demo ? demoAssets(value) : await api!.week(value)) : [] });
      for (const item of snapshots) {
        if (sorted) useSortStore.getState().markManual(account, item.week, item.photos);
        else useSortStore.getState().resetWeek(account, item.week);
      }
      setSelectionMode(false); setSelectedWeeks([]); setSyncTick(n => n + 1);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function connect() {
    setError(''); setBusy(true);
    try {
      const normalized = normalizeUrl(url);
      if (Platform.OS !== 'web' && ['localhost', '127.0.0.1', '::1'].includes(new URL(normalized).hostname)) throw new Error('On your phone, use the laptop’s Wi-Fi IP address, not localhost.');
      if (!key.trim()) throw new Error('Enter an Immich API key.');
      const draft: Connection = { url: normalized, key: key.trim(), userId: '', name: '' };
      const client = new ImmichClient(draft);
      const [user, version] = await Promise.all([client.me(), client.request<{ major: number; minor: number }>('/server/version')]);
      if (version.major !== 3 || version.minor < 3) throw new Error('This app requires Immich 3.3 or later in the v3 series.');
      await client.albums();
      const value = { ...draft, userId: user.id, name: user.name };
      await saveConnection(value); setConnection(value); setKey(''); setPage('photos');
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function changeServerAddress() {
    if (!connection || connection.demo || busy) return;
    setError(''); setBusy(true);
    try {
      const normalized = normalizeUrl(url);
      if (normalized === connection.url) return;
      const draft: Connection = { ...connection, url: normalized };
      const client = new ImmichClient(draft);
      const [user, version] = await Promise.all([client.me(), client.request<{ major: number; minor: number }>('/server/version')]);
      if (user.id !== connection.userId) throw new Error('That address reached a different Immich account. Nothing was changed.');
      if (version.major !== 3 || version.minor < 3) throw new Error('This app requires Immich 3.3 or later in the v3 series.');
      await client.albums();
      const value = { ...draft, userId: user.id, name: user.name };
      const oldAccount = `${connection.url}|${connection.userId}`;
      const newAccount = `${value.url}|${value.userId}`;
      const previousProgress = useSortStore.getState().accounts[oldAccount];
      if (previousProgress) {
        useSortStore.setState(state => {
          const existing = state.accounts[newAccount];
          const merged = existing ? {
            ...previousProgress,
            ...existing,
            pending: { ...previousProgress.pending, ...existing.pending },
            completed: { ...previousProgress.completed, ...existing.completed },
            resetWeeks: { ...previousProgress.resetWeeks, ...existing.resetWeeks },
            manualWeeks: { ...previousProgress.manualWeeks, ...existing.manualWeeks },
            sortedWeeks: { ...previousProgress.sortedWeeks, ...existing.sortedWeeks },
            selectedAlbum: existing.selectedAlbum ?? previousProgress.selectedAlbum,
          } : previousProgress;
          return {
            accounts: { ...state.accounts, [newAccount]: merged },
            monthSummaries: state.monthSummaries[newAccount]
              ? state.monthSummaries
              : { ...state.monthSummaries, [newAccount]: state.monthSummaries[oldAccount] ?? {} },
          };
        });
      }
      await saveConnection(value);
      setConnection(value); setUrl(value.url); setPage('photos');
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  function demo() {
    setError(''); setWeek(monday()); setPeriodMode('weeks');
    setConnection({ url: 'demo://immich-sort', key: '', name: 'Thijs', userId: 'demo', demo: true }); setPage('photos');
  }
  async function disconnect() {
    if (busy) return;
    try { await saveConnection(null); setConnection(null); setAssets([]); setAlbums([]); setError(''); setKey(''); setPage('weeks'); }
    catch (e) { setError(message(e)); }
  }
  const decide = useCallback((kind: 'keep' | 'trash') => {
    const asset = remaining[0];
    if (!asset || busy || loading || picker) return;
    setStatus('');
    stage(account, { asset, kind, week: assetWeek(asset), at: Date.now() });
  }, [account, busy, loading, picker, remaining, stage]);
  function chooseAlbum(album: Album) {
    selectAlbum(account, album.id);
    if (pendingKeep.current) stage(account, { asset: pendingKeep.current, kind: 'keep', albumId: album.id, albumName: album.albumName, week: assetWeek(pendingKeep.current), at: Date.now() });
    pendingKeep.current = null; setPicker(false); setNewAlbum('');
  }
  async function createAlbum() {
    if (!newAlbum.trim() || albumBusy) return;
    setAlbumBusy(true); setError('');
    try {
      const album = connection?.demo ? { id: `demo-album-${Date.now()}`, albumName: newAlbum.trim(), assetCount: 0 } : await api!.createAlbum(newAlbum.trim());
      setAlbums(list => [...list, album].sort((a, b) => a.albumName.localeCompare(b.albumName))); chooseAlbum(album);
    } catch (e) { setError(message(e)); } finally { setAlbumBusy(false); }
  }
  async function apply() {
    if (commitLock.current || !weekPending.length) return;
    commitLock.current = true; setBusy(true); setError(''); setApplyRemaining(weekPending.length); setStatus(connection?.demo ? 'Applying sample decisions…' : 'Applying to Immich…');
    try {
      if (api && weekPending.some(decision => decision.kind === 'trash')) await api.trashInfo();
      await commitDecisions(weekPending, connection?.demo ? { keep: async () => {}, trash: async () => {} } : api!, id => { complete(account, id); setApplyRemaining(count => Math.max(0, (count ?? 0) - 1)); setReviewedAgain(ids => [...ids, id]); });
      const saved = useSortStore.getState().accounts[account];
      if (periodMode === 'weeks' && assets.length && assets.every(a => isReviewed(saved, a.id)) && !Object.values(saved?.pending ?? {}).some(d => d.week === week)) markWeek(account, week, true);
      setStatus(connection?.demo ? 'Demo complete. No real photos were changed.' : 'Saved to Immich. Your albums and trash are up to date.');
    } catch (e) { setError(message(e)); setStatus('Unfinished decisions are saved. Retry when you are ready.'); }
    finally { commitLock.current = false; setBusy(false); setApplyRemaining(null); }
  }
  function changeWeek(value: string) { setReviewAgain(false); setReviewedAgain([]); setWeek(value); setStatus(''); setPage('sort'); }

  if (booting || !hydrated) return <SafeAreaView style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={c.accent} /><Text style={s.body}>Opening your saved progress…</Text></SafeAreaView>;

  if (!connection) return <SafeAreaView style={s.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={[s.heading, { marginTop: 48 }]}>Connect your Immich server</Text>
    <Field label="Your Immich server" placeholder="http://192.168.1.20:2283" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
    <Field label="API key" placeholder="Paste your Immich API key" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
    {error ? <Notice error>{error}</Notice> : null}
    <Button title="Connect my library" icon="arrow-forward" onPress={connect} busy={busy} />
    <Button title="Try a sample week" tone="quiet" onPress={demo} disabled={busy} />
    <Pressable accessibilityRole="button" onPress={() => setHelp(!help)}><Text style={s.small}>{help ? 'Hide connection help' : 'Connection help'}</Text></Pressable>
    {help && <Text style={s.small}>Create a key in Immich → Account Settings → API Keys. Use your laptop’s Wi-Fi address. Required permissions: user.read, asset.read, asset.view, asset.download, asset.update, asset.delete, asset.statistics, album.read, album.create, album.update, albumAsset.create, albumAsset.delete, person.read, person.update.</Text>}
  </ScrollView></SafeAreaView>;

  return <SafeAreaView style={s.screen}>
    <View style={[s.spread, { maxWidth: 540, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to weeks" disabled={busy} onPress={() => { setPage('weeks'); setError(''); }} style={s.row}><Text style={[s.label, { fontSize: 18 }]}>vDfotos</Text></Pressable>
      <View style={s.row}>{connection.demo && <Text style={[s.eyebrow, { fontSize: 10 }]}>DEMO</Text>}<IconButton name="laptop-outline" label="Backup" active={page === 'backup'} disabled={busy} onPress={() => { setPage('backup'); setError(''); }} /><IconButton name={page === 'albums' ? 'add' : 'settings-outline'} label={page === 'albums' ? 'Create album' : 'Settings'} active={page === 'settings'} disabled={busy} onPress={() => { if (page === 'albums') setCreateAlbumRequest(n => n + 1); else { setPage('settings'); setUrl(connection.url); setError(''); } }} /></View>
    </View>
    {page === 'photos' || page === 'albums' || page === 'search' ? <Library key={`${account}|${page}`} mode={page} connection={connection} createAlbumRequest={createAlbumRequest} /> : <ScrollView ref={mainScroll} scrollEnabled={page !== 'sort'} bounces={page !== 'sort'} overScrollMode={page === 'sort' ? 'never' : 'auto'} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: 16, gap: 18 }, page === 'sort' && { flex: 1, gap: 10, paddingTop: 6, paddingBottom: 12 }]} >
      {page === 'backup' && <BackupOverview connection={connection} />}
      {page === 'settings' ? <>
        <Button title="Back to photos" tone="quiet" icon="arrow-back" onPress={() => { setPage('photos'); setError(''); }} />
        <Text style={s.heading}>Settings</Text>
        {error ? <Notice error>{error}</Notice> : null}
        {!connection.demo && <>
          <Text style={s.body}>{syncState || 'Waiting to sync'}</Text>
          <Button title="Sync progress now" tone="quiet" icon="sync-outline" onPress={() => setSyncTick(n => n + 1)} />
          <View style={s.panel}>
            <Text style={s.label}>Immich server address</Text>
            <Text style={s.small}>For access away from home, use the server laptop’s Tailscale IP with port 2283.</Text>
            <Field label="" placeholder="http://100.118.124.29:2283" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
            <Button title="Update server address" tone="quiet" icon="sync-outline" onPress={() => void changeServerAddress()} busy={busy} disabled={busy || url.trim() === connection.url} />
          </View>
        </>}
        <View style={s.panel}><Text style={s.heading}>{connection.name}</Text><Text style={s.body}>{connection.demo ? 'Sample library · no real photos' : connection.url}</Text><Text style={s.small}>Completed progress syncs with this Immich server across devices. Pending swipe decisions stay on this device. Disconnecting preserves local progress.</Text></View>
        <Notice>Only photos owned by this account and visible in its timeline are loaded. Archived, locked and trashed items are excluded.</Notice>
        <Notice>Delete decisions affect the Immich copy. This app does not access or remove files from your phone’s gallery. Items in Immich Trash will expire according to your server’s retention settings.</Notice>
        <Text style={s.body}>Weeks run Monday–Sunday; months follow calendar months. Both share reviewed-photo progress using this phone’s timezone and the photo’s capture timestamp. Videos are included. Swipes stay on this phone until you press Apply to Immich.</Text>
        <Text style={s.small}>{allPending.length} decisions waiting to be applied across your library. App data is not a substitute for a photo backup.</Text>
        <Button title={connection.demo ? 'Exit demo' : 'Disconnect server'} tone="quiet" onPress={disconnect} disabled={busy} />
      </> : page === 'weeks' ? <>
        <View style={s.row}>{(['weeks', 'months'] as const).map(mode => <View key={mode} style={{ flex: 1 }}><Button title={mode === 'weeks' ? 'Weeks' : 'Months'} tone={periodMode === mode ? 'primary' : 'quiet'} onPress={() => { setPeriodMode(mode); setSelectionMode(false); setSelectedWeeks([]); setError(''); }} /></View>)}</View>
        <View style={s.spread}><Text style={s.heading}>{periodMode === 'weeks' ? 'Weeks' : 'Months'}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Filter unsorted ${periodMode}`} accessibilityState={{ selected: unsortedOnly }} onPress={() => setUnsortedOnly(value => !value)} style={[s.row, { padding: 10, borderRadius: 10, backgroundColor: unsortedOnly ? c.raised : c.panel }]}><Icon name="filter-outline" size={18} /><Text style={s.label}>{unsortedOnly ? 'Unsorted only' : `All ${periodMode}`}</Text></Pressable></View>
        {error ? <Notice error>{error}</Notice> : null}
        <View>
          {periods.map((value, index) => {
            const pending = periodDecisions(progress, value, periodMode).length;
            const cachedMonth = periodMode === 'months' ? monthSummaries[value] : undefined;
            const summary = periodMode === 'months'
              ? monthPhotos[value]
                ? monthSummary(progress, value, monthPhotos[value])
                : cachedMonth
                  ? { ...cachedMonth, pending, sorted: pending === 0 && (cachedMonth.total === 0 || cachedMonth.reviewed === cachedMonth.total) }
                  : null
              : null;
            const sorted = periodMode === 'months' ? !!summary && (summary.sorted || summary.total === 0) : !!progress?.sortedWeeks?.[value] && !pending;
            const cover = periodCovers[`${periodMode}:${value}`] ?? (periodMode === 'months' ? cachedMonth?.cover : undefined);
            if (unsortedOnly && sorted && !selectedWeeks.includes(value)) return null;
            return <Pressable key={value} accessibilityRole="button" accessibilityLabel={index === 0 ? `Open current ${periodNoun}` : `Open ${periodLabel(value, periodMode)}`} accessibilityState={{ selected: selectedWeeks.includes(value) }} disabled={busy} onLongPress={periodMode === 'months' ? undefined : () => { setSelectionMode(true); setSelectedWeeks(old => old.includes(value) ? old : [...old, value]); }} delayLongPress={400} onPress={() => selectionMode ? toggleSelection(value) : changeWeek(value)} style={({ pressed }) => [s.spread, { backgroundColor: selectedWeeks.includes(value) ? '#162b45' : 'transparent', paddingHorizontal: selectionMode ? 12 : 0, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border, opacity: pressed ? .6 : 1 }]}>
              {selectionMode && <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selectedWeeks.includes(value) ? '#529eff' : c.muted, backgroundColor: selectedWeeks.includes(value) ? '#529eff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{selectedWeeks.includes(value) && <Icon name="checkmark" size={16} color="#fff" />}</View>}
              <View style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', backgroundColor: cover?.demoColor ?? c.panel, alignItems: 'center', justifyContent: 'center' }}>
                {cover && connection && !connection.demo ? <Image source={api!.media(cover, false, 'thumbnail')} style={{ width: 58, height: 58 }} contentFit="cover" cachePolicy="memory-disk" /> : cover?.demoColor ? <View style={{ width: '100%', height: '100%', backgroundColor: cover.demoColor, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-outline" size={21} color="#ffffffbb" /></View> : <Icon name="image-outline" size={21} color={c.muted} />}
              </View>
              <View style={{ flex: 1, gap: 5 }}><Text style={[s.label, { fontSize: 15 }]}>{periodLabel(value, periodMode)}</Text>{(sorted || pending > 0) && <Text style={s.small}>{sorted ? 'Sorted' : `${pending} waiting to apply`}</Text>}{periodMode === 'months' && !sorted && !pending && <Text style={s.small}>{summary ? `${summary.reviewed} / ${summary.total} sorted` : 'Loading progress…'}</Text>}</View>
              <Icon name={sorted ? 'checkmark' : 'chevron-forward'} color={sorted ? c.text : c.muted} size={20} />
            </Pressable>;
          })}
        </View>
        {!connection.demo && <Text style={s.small}>{syncState}</Text>}
        <Button title={`Older ${periodMode}`} tone="quiet" onPress={() => periodMode === 'weeks' ? setWeekCount(n => n + 52) : setMonthCount(n => n + 12)} />
      </> : page === 'sort' && <>
        <View style={s.spread}><IconButton label={`Back to ${periodMode}`} name="chevron-back" disabled={busy} onPress={() => setPage('weeks')} /><Text style={s.label}>{currentPeriodLabel}</Text></View>
        {error ? <Notice error>{error}</Notice> : null}
        {status ? <Notice>{status}</Notice> : null}
        {loading ? <ActivityIndicator color={c.accent} /> : <>
          <View style={s.spread}><Text style={s.heading}>{remaining.length ? `${remaining.length} moments left` : weekPending.length ? 'Ready to apply' : `${periodNoun === 'week' ? 'Week' : 'Month'} complete`}</Text><View style={s.row}><Text style={s.small}>{assets.length - remaining.length} / {assets.length}</Text><IconButton name="arrow-undo-outline" label="Undo last decision" disabled={!latest || busy} onPress={() => latest && undo(account, latest.asset.id)} /></View></View>
          {remaining[0] ? <>
            <PhotoCard fill key={remaining[0].id} asset={remaining[0]} assets={remaining} connection={connection} onDecision={decide} onAlbum={() => { if (!busy && !loading && !picker) { pendingKeep.current = remaining[0]; setPicker(true); } }} disabled={busy || picker} />
          </> : <View style={[s.panel, { alignItems: 'center', padding: 32 }]}><Icon name="checkmark-circle-outline" size={56} color={c.accent} /><Text style={s.heading}>{weekPending.length ? 'Ready to apply' : assets.length ? `${periodNoun === 'week' ? 'Week' : 'Month'} sorted` : `No photos this ${periodNoun}`}</Text><Text style={[s.body, { textAlign: 'center' }]}>{weekPending.length ? 'Apply your decisions to save them to Immich.' : `Everything loaded for this ${periodNoun} is sorted. Refresh later for newly uploaded photos.`}</Text></View>}
          {!remaining.length && !weekPending.length && assets.length > 0 && !error && <Button title="Sort further" tone="quiet" icon="refresh-outline" onPress={() => { setReviewAgain(true); setReviewedAgain([]); setStatus(`Reviewing this ${periodNoun} again. Saved changes stay in Immich until you apply new decisions.`); }} />}
          {!remaining.length && !weekPending.length && applyRemaining === null && !error ?
            <Button title={`Next ${periodNoun}`} icon="arrow-forward" disabled={busy} onPress={() => changeWeek(periodMode === 'weeks' ? shiftWeek(week, -1) : shiftMonth(week, -1))} /> :
            <Button title={`${applyRemaining !== null ? 'Applying' : connection.demo ? 'Apply sample' : 'Apply to Immich'} (${applyRemaining ?? weekPending.length})`} icon="checkmark" onPress={() => void apply()} busy={applyRemaining !== null} disabled={busy || !weekPending.length} />}
          {!error && !loading && !weekPending.length && (periodMode === 'weeks' ? !progress?.sortedWeeks?.[week] : remaining.length > 0) && <Button title={`Mark ${periodNoun} sorted`} tone="quiet" onPress={() => setManualConfirm(true)} disabled={busy} />}
        </>}
      </>}

    </ScrollView>}
    {page === 'weeks' && selectionMode && <View style={{ padding: 12, gap: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.panel }}>
      <View style={s.spread}><Text style={s.label}>{selectedWeeks.length} selected</Text><Button title="Cancel selection" tone="quiet" disabled={busy} onPress={() => { setSelectionMode(false); setSelectedWeeks([]); }} /></View>
      <View style={s.row}><View style={{ flex: 1 }}><Button title="Mark sorted" busy={busy} disabled={!selectedWeeks.length} onPress={() => setSelectedSorted(true)} /></View><View style={{ flex: 1 }}><Button title="Mark not sorted" tone="quiet" disabled={busy || !selectedWeeks.length} onPress={() => setSelectedSorted(false)} /></View></View>
    </View>}
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg, paddingVertical: 8 }}>
      {([{ page: 'photos', label: 'Photos', icon: 'images-outline' }, { page: 'albums', label: 'Albums', icon: 'albums-outline' }, { page: 'search', label: 'Search', icon: 'search-outline' }, { page: 'weeks', label: 'Sort', icon: 'swap-horizontal-outline' }] as const).map(tab => {
        const active = page === tab.page || (tab.page === 'weeks' && page === 'sort');
        return <Pressable key={tab.page} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} disabled={busy || albumBusy} onPress={() => { setPage(tab.page); setSelectionMode(false); setSelectedWeeks([]); setError(''); setStatus(''); }} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 }}><Icon name={tab.icon} color={active ? c.text : c.muted} /><Text style={[s.small, { color: active ? c.text : c.muted }]}>{tab.label}</Text></Pressable>;
      })}
    </View>

    <Modal visible={picker} transparent animationType="slide" onRequestClose={() => { if (!albumBusy) { setPicker(false); pendingKeep.current = null; } }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }}><SafeAreaView edges={['bottom']} style={{ backgroundColor: c.bg, maxHeight: '85%', borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: 24 }]}>
          <View style={s.spread}><Text style={s.heading}>Choose an album</Text><IconButton name="close" label="Close albums" disabled={albumBusy} onPress={() => { setPicker(false); pendingKeep.current = null; }} /></View>
          <Text style={s.body}>Choose an existing album, or make a new one.</Text>
          {albums.map(album => <Pressable key={album.id} accessibilityRole="button" accessibilityLabel={`Select album ${album.albumName}`} disabled={albumBusy} onPress={() => chooseAlbum(album)} style={[s.spread, s.panel, { padding: 16 }]}><Icon name="folder-outline" color={c.accent} /><Text style={[s.label, { flex: 1 }]}>{album.albumName}</Text>{album.id === progress?.selectedAlbum && <Icon name="checkmark" color={c.accent} />}</Pressable>)}
          {error && <Notice error>{error}</Notice>}
          <Field label="New album name" placeholder="e.g. Summer with friends" value={newAlbum} onChangeText={setNewAlbum} editable={!albumBusy} />
          <Button title="Create album & select" icon="add" onPress={createAlbum} disabled={!newAlbum.trim()} busy={albumBusy} />
          <Text style={s.small}>Creating an album saves it to Immich immediately. Photo placement happens only when you press Apply to Immich.</Text>
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
    <Modal visible={manualConfirm} transparent animationType="fade" onRequestClose={() => setManualConfirm(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#000b' }}><View style={s.panel}>
        <Text style={s.heading}>Mark {periodNoun} sorted?</Text>
        <Text style={s.body}>This marks the currently loaded photos as reviewed without deleting photos or changing albums. New uploads will reopen this period. This progress will sync to your other devices.</Text>
        <Button title="Mark sorted" onPress={() => { if (periodMode === 'weeks') useSortStore.getState().markManual(account, week, assets); else useSortStore.getState().markAssetsReviewed(account, assets); setManualConfirm(false); setReviewAgain(false); setStatus(`${periodNoun === 'week' ? 'Week' : 'Month'} marked sorted. Photos and albums are unchanged.`); }} />
        <Button title="Cancel" tone="quiet" onPress={() => setManualConfirm(false)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}
