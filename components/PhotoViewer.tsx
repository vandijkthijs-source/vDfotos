import { useImagePreload } from '../lib/imagePreload';
import { PhotoActions } from './PhotoActions';
import { AlbumPicker } from './AlbumPicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Asset, Connection } from '../features/sorting/types';
import { ImmichClient } from '../lib/immich';
import { photoSwipe } from '../features/sorting/viewer';
import { Icon } from './ui';

function FullVideo({ asset, connection }: { asset: Asset; connection: Connection }) {
  const source = useMemo(() => new ImmichClient(connection).media(asset, true), [asset, connection]);
  const player = useVideoPlayer(source);
  return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" allowsFullscreen />;
}

function ZoomPhoto({ asset, connection, onNavigate }: { asset: Asset; connection: Connection; onNavigate: (direction: -1 | 1) => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.ValueXY()).current;
  const current = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ count: 0, distance: 0, cx: 0, cy: 0, scale: 1, x: 0, y: 0 });
  const multiTouch = useRef(false), initialScale = useRef(1);
  const started = useRef(0), moved = useRef(false), lastTap = useRef(0);
  const [retry, setRetry] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false), [thumbnailFailed, setThumbnailFailed] = useState(false);
  const failed = previewFailed && thumbnailFailed;
  const [requestOriginal, setRequestOriginal] = useState(false), [originalReady, setOriginalReady] = useState(false);
  const source = useMemo(() => new ImmichClient(connection).media({ id: asset.id } as Asset), [asset.id, connection]);
  const thumbnail = useMemo(() => new ImmichClient(connection).media({ id: asset.id } as Asset, false, 'thumbnail'), [asset.id, connection]);
  const originalSource = useMemo(() => ({ uri: `${connection.url}/api/assets/${encodeURIComponent(asset.id)}/original`, headers: { 'x-api-key': connection.key } }), [asset.id, connection]);
  const responder = useMemo(() => {
    function apply(s: number, x: number, y: number) {
      const nextScale = Math.max(1, Math.min(6, s));
      const next = { scale: nextScale, x: Math.max(-width * (nextScale - 1) / 2, Math.min(width * (nextScale - 1) / 2, x)), y: Math.max(-height * (nextScale - 1) / 2, Math.min(height * (nextScale - 1) / 2, y)) };
      if (nextScale > 1.15 && asset.type === 'IMAGE') setRequestOriginal(true);
      current.current = next; scale.setValue(next.scale); offset.setValue({ x: next.x, y: next.y });
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { gesture.current.count = 0; started.current = Date.now(); moved.current = false; multiTouch.current = false; initialScale.current = current.current.scale; },
      onPanResponderMove: (event, state) => {
        const touches = event.nativeEvent.touches;
        if (!touches.length) return;
        const count = Math.min(2, touches.length);
        if (count === 2) multiTouch.current = true;
        const cx = count === 2 ? (touches[0].pageX + touches[1].pageX) / 2 : touches[0].pageX;
        const cy = count === 2 ? (touches[0].pageY + touches[1].pageY) / 2 : touches[0].pageY;
        const distance = count === 2 ? Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY) : 0;
        if (Math.abs(state.dx) > 5 || Math.abs(state.dy) > 5 || count === 2) moved.current = true;
        if (gesture.current.count !== count) {
          gesture.current = { ...current.current, count, distance, cx, cy }; return;
        }
        const base = gesture.current;
        const nextScale = count === 2 && base.distance > 0 ? Math.max(1, Math.min(6, base.scale * distance / base.distance)) : base.scale;
        const ratio = nextScale / base.scale;
        apply(nextScale, cx - width / 2 - (base.cx - width / 2 - base.x) * ratio, cy - height / 2 - (base.cy - height / 2 - base.y) * ratio);
      },
      onPanResponderRelease: (_, state) => {
        const direction = photoSwipe(state.dx, state.dy, initialScale.current, multiTouch.current);
        if (direction) { lastTap.current = 0; gesture.current.count = 0; onNavigate(direction); return; }
        if (!moved.current && Date.now() - started.current < 250) {
          if (Date.now() - lastTap.current < 300) { apply(current.current.scale > 1 ? 1 : 2.5, 0, 0); lastTap.current = 0; }
          else lastTap.current = Date.now();
        }
        gesture.current.count = 0;
      },
      onPanResponderTerminate: () => { gesture.current.count = 0; },
      onPanResponderTerminationRequest: () => false,
    });
  }, [height, width, offset, scale, onNavigate, asset.type]);
  return <View style={{ flex: 1, overflow: 'hidden' }} {...responder.panHandlers}>
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale }] }]}>
      {connection.demo ? <View style={{ flex: 1, backgroundColor: asset.demoColor, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 24 }}>{asset.originalFileName}</Text></View> : <>
        <Image key={`thumb-${retry}`} source={thumbnail} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" onError={() => { setThumbnailFailed(true); }} />
        {!previewFailed && <Image key={`preview-${retry}`} source={source} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" priority="high" accessibilityLabel={asset.originalFileName} onError={() => { setPreviewFailed(true); }} />}
        {requestOriginal && <Image key={`original-${retry}`} source={originalSource} allowDownscaling={false} style={[StyleSheet.absoluteFill, { opacity: originalReady ? 1 : 0 }]} contentFit="contain" cachePolicy="memory-disk" onLoad={() => setOriginalReady(true)} onError={() => { setOriginalReady(false); }} />}
      </>}
    </Animated.View>
    {failed && <Pressable accessibilityRole="button" accessibilityLabel="Retry photo" onPress={() => { setPreviewFailed(false); setThumbnailFailed(false); setRequestOriginal(false); setOriginalReady(false); setRetry(n => n + 1); }} style={{ position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: '#222', padding: 20 }}><Text style={{ color: '#fff' }}>Could not load photo. Tap to retry.</Text></Pressable>}
  </View>;
}

export function PhotoViewer({ asset: initialAsset, assets, connection, onClose, onLoadMore, hasMore = false, loading = false, onChange, showActions = true }: {
  asset: Asset; assets?: Asset[]; connection: Connection; onClose: () => void;
  onChange?: (asset: Asset) => void; onLoadMore?: () => void; hasMore?: boolean; loading?: boolean; showActions?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [actionBusy, setActionBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Asset>>({});
  const [albumPicker, setAlbumPicker] = useState(false);
  const [selectedId, setSelectedId] = useState(initialAsset.id);
  const list = useMemo(() => assets ?? [initialAsset], [assets, initialAsset]);
  const index = list.findIndex(item => item.id === selectedId);
  useImagePreload(connection, [list[index + 1], list[index + 2], list[index - 1]].filter((item): item is Asset => !!item));
  const original = list[index] ?? initialAsset;
  const asset = overrides[original.id] ?? original;
  const [waitingNext, setWaitingNext] = useState(false);
  const navigate = (direction: -1 | 1) => {
    if (actionBusy) return;
    const next = list[index + direction];
    if (next) { setWaitingNext(false); setSelectedId(next.id); }
    else if (direction === 1 && hasMore) { setWaitingNext(true); onLoadMore?.(); }
  };
  useEffect(() => {
    if (waitingNext && list[index + 1]) {
      setSelectedId(list[index + 1].id); setWaitingNext(false);
    } else if (waitingNext && !loading) setWaitingNext(false);
  }, [waitingNext, list, index, loading]);
  // Prefetch the following page while the user approaches the end of this list.
  useEffect(() => {
    if (index >= list.length - 4 && hasMore && !loading) onLoadMore?.();
  }, [index, list.length, hasMore, loading, onLoadMore]);
  const videoSwipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 25 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => { const direction = photoSwipe(g.dx, g.dy, 1, g.numberActiveTouches > 1); if (direction) navigate(direction); },
  });
  return <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!actionBusy) onClose(); }}>
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
      {asset.type === 'VIDEO' && !connection.demo ? <View style={{ flex: 1 }} {...videoSwipe.panHandlers}><FullVideo key={asset.id} asset={asset} connection={connection} /></View> : <ZoomPhoto key={asset.id} asset={asset} connection={connection} onNavigate={navigate} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Close photo" disabled={actionBusy} onPress={onClose} style={{ position: 'absolute', top: insets.top + 12, left: insets.left + 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-back" color="#fff" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Add photo to albums" disabled={actionBusy} onPress={() => setAlbumPicker(true)} style={{ position: 'absolute', top: insets.top + 12, right: insets.right + 12, padding: 12, borderRadius: 22, backgroundColor: '#0009', flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="albums-outline" color="#fff" /><Text style={{ color: '#fff' }}>Add to</Text></Pressable>
      {albumPicker && <AlbumPicker assets={[asset]} connection={connection} onClose={() => setAlbumPicker(false)} />}
      {list.length > 1 && <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: '#0009', borderRadius: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" disabled={actionBusy || index <= 0} onPress={() => navigate(-1)} style={{ padding: 12, opacity: index <= 0 ? .3 : 1 }}><Icon name="chevron-back" color="#fff" /></Pressable>
        <Text style={{ color: '#fff' }}>{waitingNext ? 'Loading…' : `${index + 1} / ${list.length}${hasMore ? '+' : ''}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next photo" disabled={actionBusy || (index >= list.length - 1 && !hasMore)} onPress={() => navigate(1)} style={{ padding: 12, opacity: index >= list.length - 1 && !hasMore ? .3 : 1 }}><Icon name="chevron-forward" color="#fff" /></Pressable>
      </View>}
      </View>
      {showActions && <PhotoActions key={asset.id} compact assets={[asset]} connection={connection} onBusyChange={setActionBusy} onClose={() => {}} onChange={updated => {
        setOverrides(old => ({ ...old, [updated.id]: updated })); onChange?.(updated);
        if (updated.isTrashed) onClose();
      }} />}
    </View>
  </Modal>;
}
