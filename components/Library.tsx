import { syncFavoritesAlbum } from '../lib/favorites';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderAlbums } from '../features/sorting/albums';
import { AlbumGrid } from './AlbumGrid';
import { togglePhotoSelection } from '../features/sorting/selection';
import { PhotoViewer } from './PhotoViewer';
import { PhotoActions } from './PhotoActions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Album, Asset, Connection } from '../features/sorting/types';
import { demoAlbums, demoAssets } from '../features/sorting/demo';
import { galleryRows } from '../features/sorting/gallery';
import { monday } from '../features/sorting/week';
import { ImmichClient } from '../lib/immich';
import { colors as c } from '../constants/theme';
import { Button, Field, Icon, Notice, s } from './ui';

export function Library({ mode, connection, createAlbumRequest = 0 }: { createAlbumRequest?: number; mode: 'photos' | 'albums' | 'search'; connection: Connection }) {
  const api = useMemo(() => new ImmichClient(connection), [connection]);
  const [photos, setPhotos] = useState<Asset[]>([]), [albums, setAlbums] = useState<Album[]>([]);
  const [album, setAlbum] = useState<Album | null>(null);
  const orderKey = `vdfotos-album-order:${connection.url}:${connection.userId}`;
  const albumOrder = useRef<string[]>([]);
  const [albumEditor, setAlbumEditor] = useState<'create' | 'rename' | null>(null);
  const [albumName, setAlbumName] = useState(''), [albumError, setAlbumError] = useState('');
  const [albumSaving, setAlbumSaving] = useState(false); const albumLock = useRef(false);
  const lastCreateRequest = useRef(createAlbumRequest);
  useEffect(() => {
    if (createAlbumRequest > lastCreateRequest.current) { lastCreateRequest.current = createAlbumRequest; setAlbumName(''); setAlbumError(''); setAlbumEditor('create'); }
  }, [createAlbumRequest]);
  async function saveAlbum() {
    if (albumLock.current || !albumName.trim()) return;
    albumLock.current = true; setAlbumSaving(true); setAlbumError('');
    try {
      if (albumEditor === 'create') {
        const created = connection.demo ? { id: `demo-album-${Date.now()}`, albumName: albumName.trim(), assetCount: 0 } : await api.createAlbum(albumName.trim());
        setAlbums(old => [...old, created]); setAlbum(null);
        albumOrder.current = [...albums.map(item => item.id), created.id];
        void AsyncStorage.setItem(orderKey, JSON.stringify(albumOrder.current)).catch(() => setError('Album created, but its display order could not be saved.'));
      } else if (album) {
        if (!connection.demo) await api.renameAlbum(album.id, albumName.trim());
        const updated = { ...album, albumName: albumName.trim() };
        setAlbums(old => old.map(item => item.id === updated.id ? updated : item)); setAlbum(updated);
      }
      setAlbumEditor(null);
    } catch (e) { setAlbumError(e instanceof Error ? e.message : 'Could not save album.'); }
    finally { albumLock.current = false; setAlbumSaving(false); }
  }
  function reorderAlbums(next: Album[]) {
    setAlbums(next); albumOrder.current = next.map(item => item.id);
    void AsyncStorage.setItem(orderKey, JSON.stringify(albumOrder.current)).catch(() => setError('Could not save album order. Try moving the album again.'));
  }
  const [facet, setFacet] = useState<{ personId?: string; city?: string; label: string; unnamed?: boolean } | null>(null);
  const [choices, setChoices] = useState<{ id: string; label: string; unnamed?: boolean }[] | null>(null);
  const [choiceType, setChoiceType] = useState<'people' | 'cities'>('people');
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const selectedIds = new Set(selectedAssets.map(item => item.id));
  function toggleSelected(asset: Asset) { if (!actionBusy) setSelectedAssets(old => togglePhotoSelection(old, asset)); }
  useEffect(() => {
    if (!selectedAssets.length) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (!actionBusy) setSelectedAssets([]); return true; });
    return () => subscription.remove();
  }, [selectedAssets.length, actionBusy]);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  const [nameOpen, setNameOpen] = useState(false), [personName, setPersonName] = useState('');
  const [nameBusy, setNameBusy] = useState(false), [nameError, setNameError] = useState('');
  const naming = useRef(false);
  async function saveName() {
    if (!facet?.personId || naming.current) return;
    const id = facet.personId;
    naming.current = true; setNameBusy(true); setNameError('');
    try {
      await api.namePerson(id, personName);
      setFacet(old => old?.personId === id ? { ...old, label: personName.trim(), unnamed: false } : old);
      setNameOpen(false);
    } catch (e) { setNameError(e instanceof Error ? e.message : 'Could not save name.'); }
    finally { naming.current = false; setNameBusy(false); }
  }
  const choiceRun = useRef(0);
  useEffect(() => () => { choiceRun.current += 1; }, []);
  async function openChoices(type: 'people' | 'cities') {
    const run = ++choiceRun.current; setChoiceType(type); setChoices([]); setChoiceBusy(true); setError('');
    try {
      const list = connection.demo ? [] : type === 'people' ? (await api.people()).map(p => ({ id: p.id, label: p.name || 'No Name', unnamed: !p.name?.trim() })) : (await api.cities()).filter(a => a.exifInfo?.city).map(a => ({ id: a.exifInfo!.city!, label: a.exifInfo!.city! }));
      if (run === choiceRun.current) setChoices([...new Map(list.map(v => [v.id, v])).values()]);
    } catch (e) { if (run === choiceRun.current) { setError(e instanceof Error ? e.message : 'Could not load choices.'); setChoices(null); } }
    finally { if (run === choiceRun.current) setChoiceBusy(false); }
  }
  const [input, setInput] = useState(''), [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const generation = useRef(0), loadingMore = useRef(false);
  const rows = useMemo(() => galleryRows(photos, !query), [photos, query]);
  const albumList = mode === 'albums' && !album;

  useEffect(() => {
    const run = ++generation.current;
    loadingMore.current = false;
    setSelectedAssets([]); setPhotos([]); setCursor(null); setError('');
    if (mode === 'search' && !query && !facet) { setLoading(false); return; }
    setLoading(true);
    const request = albumList
      ? Promise.all([connection.demo ? Promise.resolve([{ id: 'demo-favorit', albumName: 'Favorites', assetCount: 0 }, ...demoAlbums]) : syncFavoritesAlbum(api).catch(async e => { if (generation.current === run) setError(`Could not sync Favorites: ${e.message}`); return api.albums(); }), AsyncStorage.getItem(orderKey)]).then(([items, saved]) => { let ids: string[] = []; try { const parsed = JSON.parse(saved ?? '[]'); if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string'); } catch {} albumOrder.current = ids; return orderAlbums(items, ids); })
      : (connection.demo ? Promise.resolve({ items: demoAssets(monday()).filter(a => !query || a.originalFileName.toLowerCase().includes(query.toLowerCase())), nextCursor: null }) : query ? api.smartSearch(query) : api.browse({ albumId: album?.id, ...facet }));
    request.then(result => {
      if (generation.current !== run) return;
      if (Array.isArray(result)) setAlbums(result);
      else { setPhotos(result.items); setCursor(result.nextCursor); }
    }).catch(e => { if (generation.current === run) setError(e.message); })
      .finally(() => { if (generation.current === run) setLoading(false); });
    return () => { generation.current = run + 1; };
  }, [album, albumList, api, connection, mode, query, facet, refresh, orderKey]);

  async function more() {
    if (!cursor || loading || loadingMore.current) return;
    const run = generation.current;
    loadingMore.current = true; setLoading(true); setError('');
    try {
      const result = query ? await api.smartSearch(query, cursor) : await api.browse({ cursor, albumId: album?.id, ...facet });
      if (run !== generation.current) return;
      if (result.nextCursor === cursor) throw new Error('The server repeated a page. Refresh to try again.');
      setPhotos(old => [...new Map([...old, ...result.items].map(a => [a.id, a])).values()]);
      setCursor(result.nextCursor);
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Could not load photos.'); }
    finally { if (run === generation.current) { loadingMore.current = false; setLoading(false); } }
  }
  const albumModal = <Modal visible={albumEditor !== null} transparent animationType="fade" onRequestClose={() => { if (!albumSaving) setAlbumEditor(null); }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0009' }}><View style={s.panel}>
        <Text style={s.heading}>{albumEditor === 'create' ? 'New album' : 'Rename album'}</Text>
        <Field label="Album name" value={albumName} onChangeText={setAlbumName} autoFocus editable={!albumSaving} onSubmitEditing={() => void saveAlbum()} />
        {albumError ? <Notice error>{albumError}</Notice> : null}
        <Button title={albumEditor === 'create' ? 'Create album' : 'Save name'} busy={albumSaving} disabled={!albumName.trim()} onPress={() => void saveAlbum()} />
        <Button title="Cancel" tone="quiet" disabled={albumSaving} onPress={() => setAlbumEditor(null)} />
      </View></View>
    </Modal>;
  const header = <View style={{ padding: 16, gap: 12 }}>
    {album && <Button title="Back to albums" tone="quiet" icon="arrow-back" onPress={() => setAlbum(null)} />}
    {album ? <Pressable accessibilityRole="button" accessibilityLabel={`Rename album ${album.albumName}`} onPress={() => { setAlbumName(album.albumName); setAlbumError(''); setAlbumEditor('rename'); }} style={[s.row, { paddingVertical: 8 }]}><Text style={[s.heading, { flexShrink: 1 }]}>{album.albumName}</Text><Icon name="pencil-outline" size={18} /></Pressable> : <Text style={s.heading}>{mode === 'photos' ? 'Photos' : mode === 'albums' ? 'Albums' : 'Search'}</Text>}

    {mode === 'search' && <><Field label="Search your photos" placeholder="Dogs, beach, birthday…" value={input} onChangeText={setInput} returnKeyType="search" onSubmitEditing={() => { setFacet(null); setQuery(input.trim()); }} /><Button title="Search photos" icon="search" onPress={() => { setFacet(null); setQuery(input.trim()); }} /></>}
    {mode === 'search' && <>
      <View style={s.row}><View style={{ flex: 1 }}><Button title="People" icon="people-outline" tone="quiet" onPress={() => openChoices('people')} /></View><View style={{ flex: 1 }}><Button title="Location" icon="location-outline" tone="quiet" onPress={() => openChoices('cities')} /></View></View>
      {facet?.personId && facet.unnamed && <Button title="Name this person" icon="person-outline" tone="quiet" onPress={() => { setPersonName(''); setNameError(''); setNameOpen(true); }} />}
      <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => { if (!nameBusy) setNameOpen(false); }}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0009', padding: 24 }}><View style={s.panel}>
          <Text style={s.heading}>Name this person</Text>
          {facet?.personId && <Image source={api.personThumbnail(facet.personId)} style={{ width: 80, height: 80, borderRadius: 40 }} />}
          <Field label="Name" value={personName} onChangeText={setPersonName} autoFocus editable={!nameBusy} returnKeyType="done" onSubmitEditing={() => void saveName()} />
          {nameError ? <Notice error>{nameError}</Notice> : null}
          <Button title="Save name" busy={nameBusy} disabled={!personName.trim()} onPress={() => void saveName()} />
          <Button title="Cancel" tone="quiet" disabled={nameBusy} onPress={() => setNameOpen(false)} />
        </View></View>
      </Modal>
      {facet && <Button title={`${facet.label} · Clear`} tone="quiet" onPress={() => setFacet(null)} />}
      {query && <Text style={s.small}>Matches from Immich smart search</Text>}
      <Modal visible={choices !== null} animationType="slide" onRequestClose={() => { choiceRun.current++; setChoices(null); }}>
        <View style={[s.screen, { paddingTop: 40, paddingHorizontal: 16, gap: 12 }]}>
          <Button title="Back to search" tone="quiet" onPress={() => { choiceRun.current++; setChoices(null); }} />
          <Text style={s.heading}>{choiceType === 'people' ? 'People' : 'Locations'}</Text>
          {choiceBusy ? <ActivityIndicator color={c.text} /> : <FlatList data={choices ?? []} keyExtractor={v => v.id} ListEmptyComponent={<Text style={s.body}>{connection.demo ? 'Connect to Immich to browse people and places.' : 'No results. Immich needs recognized faces or location metadata.'}</Text>} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setInput(''); setFacet({ label: item.label, unnamed: item.unnamed, ...(choiceType === 'people' ? { personId: item.id } : { city: item.id }) }); setChoices(null); }} style={{ paddingVertical: 12, paddingHorizontal: 12, marginBottom: 6, borderRadius: 16, backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: 16 }} >{choiceType === 'people' && <View style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}><Icon name="person-outline" /><Image source={api.personThumbnail(item.id)} cachePolicy="memory-disk" recyclingKey={item.id} style={{ position: 'absolute', width: 60, height: 60 }} contentFit="cover" /></View>}<Text style={s.label}>{item.label}</Text></Pressable>} />}
        </View>
      </Modal>
    </>}
    {error ? <><Notice error>{error}</Notice><Button title="Retry" tone="quiet" onPress={() => setRefresh(n => n + 1)} /></> : null}
  </View>;
  if (albumList) return <><AlbumGrid albums={albums} connection={connection} header={<>{header}{loading ? <ActivityIndicator color={c.text} /> : !albums.length && !error ? <Text style={[s.body, { padding: 16 }]}>No albums yet. Tap + to create one.</Text> : null}</>} onOpen={setAlbum} onReorder={reorderAlbums} />{albumModal}</>;
  return <View style={{ flex: 1 }}><FlatList initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} style={{ flex: 1 }} key="photos" data={rows} keyExtractor={a => a.key} onEndReached={() => { if (!error) void more(); }} onEndReachedThreshold={0.5} ListHeaderComponent={header} refreshing={loading && photos.length === 0} onRefresh={() => setRefresh(n => n + 1)} ListEmptyComponent={!loading && !error ? <Text style={[s.body, { padding: 16 }]}>{mode === 'search' && !query && !facet ? 'Search for a subject, or browse people and places.' : 'No photos found.'}</Text> : null} ListFooterComponent={<View style={{ padding: 16 }}>{loading ? <ActivityIndicator color={c.text} /> : cursor ? <Button title="Load more" tone="quiet" onPress={more} /> : null}</View>} renderItem={({ item: row }) => row.photos ? <View style={{ flexDirection: 'row' }}>{row.photos.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open photo ${item.originalFileName}`} onPress={() => selectedAssets.length ? toggleSelected(item) : setViewAsset(item)} onLongPress={() => toggleSelected(item)} delayLongPress={400} accessibilityState={{ selected: selectedIds.has(item.id) }} accessibilityHint={selectedAssets.length ? "Tap to select this photo" : "Tap to view, or hold to select"} style={{ width: '33.333%', aspectRatio: 1, padding: 1 }}>
    <View style={{ flex: 1, backgroundColor: item.demoColor ?? c.panel, borderWidth: selectedIds.has(item.id) ? 3 : 0, borderColor: '#65a5ff' }}>
      {connection.demo ? <Text numberOfLines={2} style={[s.small, { padding: 8, color: c.text }]}>{item.originalFileName}</Text> : <Image source={api.media(item, false, 'thumbnail')} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={item.id} cachePolicy="memory-disk" />}
      {selectedAssets.length > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 7, left: 7, width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: selectedIds.has(item.id) ? '#3b82f6' : '#0005', alignItems: 'center', justifyContent: 'center' }}>{selectedIds.has(item.id) && <Icon name="checkmark" color="#fff" size={18} />}</View>}
      {item.isFavorite && <View style={{ position: 'absolute', left: 6, bottom: 6 }}><Icon name="heart" size={18} /></View>}
      {item.type === 'VIDEO' && <View style={{ position: 'absolute', right: 6, bottom: 6 }}><Icon name="play" size={18} /></View>}
    </View>
  </Pressable>)}</View> : <Text accessibilityRole="header" style={[s.label, { paddingHorizontal: 12, paddingTop: 22, paddingBottom: 12, fontSize: 15 }]}>{row.title}</Text>} />
    {albumModal}
    {viewAsset && <PhotoViewer onChange={updated => setPhotos(old => updated.isTrashed ? old.filter(item => item.id !== updated.id) : old.map(item => item.id === updated.id ? updated : item))} asset={viewAsset} assets={photos} connection={connection} onClose={() => setViewAsset(null)} hasMore={!!cursor && !error} loading={loading} onLoadMore={() => { if (!error) void more(); }} />}
    {selectedAssets.length > 0 && <PhotoActions assets={selectedAssets} connection={connection} onBusyChange={setActionBusy} onClose={() => setSelectedAssets([])} onChange={updated => {
      setPhotos(old => updated.isTrashed ? old.filter(a => a.id !== updated.id) : old.map(a => a.id === updated.id ? updated : a));
      setSelectedAssets(old => old.filter(a => a.id !== updated.id));
    }} />}

  </View>;
}
