import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { Album, Asset, Connection } from '../features/sorting/types';
import { demoAlbums } from '../features/sorting/demo';
import { ImmichClient } from '../lib/immich';
import { colors as c } from '../constants/theme';
import { Button, Icon, Notice, s } from './ui';

export function AlbumPicker({ assets, connection, onClose, onDone, onBusyChange }: {
  assets: Asset[]; connection: Connection; onClose: () => void; onDone?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const api = useMemo(() => new ImmichClient(connection), [connection]);
  const insets = useSafeAreaInsets();
  const [albums, setAlbums] = useState<Album[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0); const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    (connection.demo ? Promise.resolve(demoAlbums) : api.albums()).then(value => { if (active) setAlbums(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, connection.demo, retry]);
  async function add() {
    if (lock.current || !selected.length) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      for (const id of selected) {
        if (!connection.demo) await api.addToAlbum(id, assets.map(asset => asset.id));
        setSelected(old => old.filter(value => value !== id));
      }
      onDone?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add photos.'); }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={[s.screen, { padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, gap: 14 }]}>
      <View style={s.spread}><Text style={s.heading}>Add to albums</Text><Button title="Cancel" tone="quiet" disabled={busy} onPress={onClose} /></View>
      <Text style={s.body}>{assets.length} {assets.length === 1 ? 'photo' : 'photos'} · Choose one or more albums</Text>
      {error ? <Notice error>{error}</Notice> : null}
      {loading ? <ActivityIndicator color={c.text} /> : <FlatList data={albums} keyExtractor={item => item.id} ListEmptyComponent={<Text style={s.body}>No albums yet. Create one with + in Albums.</Text>} renderItem={({ item }) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id), disabled: busy }} disabled={busy} onPress={() => setSelected(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id])} style={{ padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ height: 56, width: 56, borderRadius: 8, backgroundColor: c.raised, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>{item.albumThumbnailAssetId && !connection.demo ? <Image source={api.media({ id: item.albumThumbnailAssetId } as Asset, false, 'thumbnail')} style={{ width: 56, height: 56 }} contentFit="cover" cachePolicy="memory-disk" /> : <Icon name="folder-outline" />}</View>
        <Text style={[s.label, { flex: 1 }]}>{item.albumName}</Text><Icon name={selected.includes(item.id) ? 'checkmark-circle' : 'ellipse-outline'} color={selected.includes(item.id) ? '#65a5ff' : c.muted} />
      </Pressable>} />}
      {error && !albums.length && <Button title="Retry" tone="quiet" onPress={() => setRetry(n => n + 1)} />}
      <Button title={`Add to ${selected.length} ${selected.length === 1 ? 'album' : 'albums'}`} disabled={!selected.length || loading} busy={busy} onPress={() => void add()} />
    </View>
  </Modal>;
}
