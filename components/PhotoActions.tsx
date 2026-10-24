import { downloadForSharing, expiredExport, shareMime } from '../lib/photoSharing';
import { setPhotoFavorite } from '../lib/favorites';
import { AlbumPicker } from './AlbumPicker';
import { favoriteSelection } from '../features/sorting/selection';
import { useRef, useState } from 'react';
import { ActivityIndicator, NativeModules, Platform, Pressable, Text, View } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Asset, Connection } from '../features/sorting/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as c } from '../constants/theme';
import { ImmichClient } from '../lib/immich';
import { Button, Icon, Notice, s } from './ui';

export function PhotoActions({ assets, connection, onClose, onChange, onBusyChange, compact = false }: {
  compact?: boolean; assets: Asset[]; onBusyChange: (busy: boolean) => void; connection: Connection; onClose: () => void; onChange: (asset: Asset) => void;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [albumPicker, setAlbumPicker] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const lock = useRef(false);
  const makeFavorite = favoriteSelection(assets);
  async function act(action: 'share' | 'download' | 'trash' | 'favorite') {
    if (lock.current) return;
    lock.current = true; onBusyChange(true); setBusy(true); setError(''); setMessage('');
    let directory: string | undefined;
    let handedToShare = false;
    try {
      const api = new ImmichClient(connection);
      const selection = [...assets];
      if (action === 'trash' || action === 'favorite') {
        for (const asset of selection) {
          const updated = { ...asset };
          if (action === 'trash') { if (!connection.demo) await api.trash(asset); updated.isTrashed = true; }
          else {
            updated.isFavorite = makeFavorite;
            if (!connection.demo) await setPhotoFavorite(api, asset.id, updated.isFavorite);
          }
          onChange(updated);
        }
        if (!compact) onClose(); return;
      }
      if (connection.demo) throw new Error('Connect to Immich to share or download original photos.');
      if (Platform.OS === 'web') throw new Error('Sharing and downloading are available in the Android app.');
      if (action === 'share' && Platform.OS !== 'android' && selection.length > 1) throw new Error('Sharing multiple photos is available in the Android app.');
      if (!FS.cacheDirectory) throw new Error('Temporary storage is unavailable.');
      let destination: string | undefined;
      if (action === 'download' && Platform.OS === 'android') {
        const permission = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        destination = permission.directoryUri;
      } else if (Platform.OS === 'android' ? !NativeModules.PhotoSharing : !(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
      // Keep handed-off files available while receiving apps import them.
      // Only remove exports from previous days, never the current hand-off.
      for (const name of await FS.readDirectoryAsync(FS.cacheDirectory)) {
        if (expiredExport(name)) await FS.deleteAsync(FS.cacheDirectory + name, { idempotent: true }).catch(() => {});
      }
      directory = `${FS.cacheDirectory}photo-export-${Date.now()}/`;
      await FS.makeDirectoryAsync(directory, { intermediates: true });
      const files: { uri: string; mimeType: string }[] = [];
      for (const [index, asset] of selection.entries()) {
        const filename = (asset.originalFileName || asset.id).replace(/[^a-zA-Z0-9._-]/g, '_');
        setMessage(`Preparing ${index + 1} of ${selection.length}…`);
        const transfer = FS.createDownloadResumable(`${connection.url}/api/assets/${encodeURIComponent(asset.id)}/original`, directory + index + '-' + filename, { headers: { 'x-api-key': connection.key } }, progress => {
          const percent = progress.totalBytesExpectedToWrite > 0 ? ` · ${Math.round(progress.totalBytesWritten / progress.totalBytesExpectedToWrite * 100)}%` : '';
          setMessage(`Preparing ${index + 1} of ${selection.length}${percent}…`);
        });
        const result = await downloadForSharing(transfer);
        if (!result) throw new Error('Photo download was interrupted. Please try again.');
        if (result.status !== 200) throw new Error(`Download failed (${result.status}). Check the API key has asset.download permission.`);
        const mime = shareMime(filename, Object.entries(result.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]);
        if (destination) {
          const data = await FS.readAsStringAsync(result.uri, { encoding: FS.EncodingType.Base64 });
          const target = await FS.StorageAccessFramework.createFileAsync(destination, filename, mime);
          try { await FS.writeAsStringAsync(target, data, { encoding: FS.EncodingType.Base64 }); }
          catch (e) { await FS.deleteAsync(target, { idempotent: true }).catch(() => {}); throw e; }
          setMessage(`Saved ${index + 1} of ${selection.length} to your selected folder.`);
        } else files.push({ uri: result.uri, mimeType: mime });
      }
      if (files.length) {
        setMessage('Opening share options…');
        // Chooser completion is not confirmation that the receiving app read the files.
        handedToShare = true;
        if (Platform.OS === 'android') await NativeModules.PhotoSharing.share(files);
        else await Sharing.shareAsync(files[0].uri, { mimeType: files[0].mimeType, dialogTitle: 'Share photo' });
        setMessage('');
      }
    } catch (e) { setMessage(''); setError(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally {
      if (directory && !handedToShare) await FS.deleteAsync(directory, { idempotent: true }).catch(() => {});
      lock.current = false; onBusyChange(false); setBusy(false);
    }
  }
  const actions = compact ? [
    { title: makeFavorite ? 'Favorite' : 'Unfavorite', icon: makeFavorite ? 'heart-outline' as const : 'heart' as const, action: 'favorite' as const },
    { title: 'Share', icon: 'share-outline' as const, action: 'share' as const },
    { title: 'Delete', icon: 'trash-outline' as const, action: 'trash' as const },
  ] : [
    { title: 'Add to', icon: 'albums-outline' as const, action: 'album' as const },
    { title: 'Share', icon: 'share-outline' as const, action: 'share' as const },
    { title: 'Download', icon: 'download-outline' as const, action: 'download' as const },
    { title: 'Trash', icon: 'trash-outline' as const, action: 'trash' as const },
    { title: makeFavorite ? 'Favorite' : 'Unfavorite', icon: makeFavorite ? 'heart-outline' as const : 'heart' as const, action: 'favorite' as const },
  ];
  return <><View style={{ backgroundColor: compact ? '#000' : c.panel, borderTopWidth: compact ? 0 : 1, borderColor: c.border, padding: 12, paddingBottom: Math.max(12, insets.bottom), gap: 10 }}>
    {!compact && <View style={s.spread}>
      <Text style={s.label}>{busy ? 'Working…' : `${assets.length} selected`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Clear selection" disabled={busy} onPress={onClose} style={{ padding: 10 }}><Icon name="close" /></Pressable>
    </View>}
    {busy && <ActivityIndicator accessibilityLabel="Preparing photo action" color={c.text} />}
    {error ? <Notice error>{error}</Notice> : null}{message ? <Notice>{message}</Notice> : null}
    {confirmTrash ? <>
      <Text style={s.body}>Move {assets.length} selected {assets.length === 1 ? 'photo' : 'photos'} to Immich Trash? You can restore it before the server’s retention period ends.</Text>
      <View style={s.row}><View style={{ flex: 1 }}><Button title="Cancel" tone="quiet" disabled={busy} onPress={() => setConfirmTrash(false)} /></View><View style={{ flex: 1 }}><Button title="Move to Trash" tone="danger" busy={busy} onPress={() => void act('trash')} /></View></View>
    </> : <View style={{ flexDirection: 'row', justifyContent: compact ? 'center' : undefined, gap: compact ? 24 : 0 }}>{actions.map(item => <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={item.title} disabled={busy} onPress={() => item.action === 'album' ? setAlbumPicker(true) : item.action === 'trash' ? setConfirmTrash(true) : void act(item.action)} style={{ flex: compact ? undefined : 1, width: compact ? 64 : undefined, alignItems: 'center', paddingVertical: 12, gap: 6, opacity: busy ? .4 : 1 }}>
      <Icon name={item.icon} color={item.action === 'trash' ? c.danger : c.text} />{!compact && <Text style={[s.small, { color: c.text }]}>{item.title}</Text>}
    </Pressable>)}</View>}
  </View>{albumPicker && <AlbumPicker assets={assets} connection={connection} onClose={() => setAlbumPicker(false)} onDone={onClose} onBusyChange={value => { setBusy(value); onBusyChange(value); }} />}</>;
}
