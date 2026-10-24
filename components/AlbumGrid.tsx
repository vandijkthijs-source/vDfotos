import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Album, Asset, Connection } from '../features/sorting/types';
import { moveAlbum } from '../features/sorting/albums';
import { ImmichClient } from '../lib/immich';
import { colors as c } from '../constants/theme';
import { Icon, s } from './ui';

function Tile({ album, connection, width, height, index, dragging, onOpen, onHold }: {
  album: Album; connection: Connection; width: number; height: number; index: number; dragging: boolean; onOpen: () => void; onHold: () => void;
}) {
  const position = useRef(new Animated.ValueXY({ x: index % 2 * width, y: Math.floor(index / 2) * height })).current;
  useEffect(() => {
    const animation = Animated.spring(position, { toValue: { x: index % 2 * width, y: Math.floor(index / 2) * height }, useNativeDriver: false, damping: 22, stiffness: 220, mass: .8 });
    animation.start(); return () => animation.stop();
  }, [position, index, width, height]);
  return <Animated.View style={{ position: 'absolute', width, height, left: position.x, top: position.y, opacity: dragging ? 0 : 1 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open album ${album.albumName}`} accessibilityHint="Hold and drag to reorder" onPress={onOpen} onLongPress={onHold} delayLongPress={350} style={{ flex: 1, padding: 8 }}>
      <Cover album={album} connection={connection} /><Text numberOfLines={1} style={[s.label, { marginTop: 8 }]}>{album.albumName}</Text><Text style={s.small}>{album.assetCount} items</Text>
    </Pressable>
  </Animated.View>;
}
function Cover({ album, connection }: { album: Album; connection: Connection }) {
  return <View style={{ aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' }}>
    {album.albumThumbnailAssetId && !connection.demo ? <Image source={new ImmichClient(connection).media({ id: album.albumThumbnailAssetId } as Asset, false, 'thumbnail')} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" /> : <Icon name="folder-outline" size={36} />}
  </View>;
}
export function AlbumGrid({ albums, connection, header, onOpen, onReorder }: {
  albums: Album[]; connection: Connection; header: ReactNode; onOpen: (album: Album) => void; onReorder: (albums: Album[]) => void;
}) {
  const [width, setWidth] = useState(0), [dragId, setDragId] = useState<string | null>(null);
  const [items, setItems] = useState(albums);
  const itemsRef = useRef(albums), drag = useRef<{ id: string; index: number; scroll: number; dx: number; dy: number } | null>(null);
  const scroll = useRef<ScrollView>(null), viewport = useRef<View>(null);
  const scrollY = useRef(0), viewportY = useRef(0), viewportHeight = useRef(0), contentHeight = useRef(0);
  const fingerY = useRef<number | null>(null);
  const floating = useRef(new Animated.ValueXY()).current;
  const cellWidth = width / 2, cellHeight = cellWidth + 56;
  useEffect(() => { if (!drag.current) { itemsRef.current = albums; setItems(albums); } }, [albums]);
  const handlers = useRef({ update: (_dx: number, _dy: number, _y?: number) => {}, finish: () => {} });
  handlers.current.update = (dx, dy, pageY) => {
    const active = drag.current; if (!active || !cellWidth) return;
    active.dx = dx; active.dy = dy; if (pageY !== undefined) fingerY.current = pageY;
    const x = active.index % 2 * cellWidth + dx;
    const y = Math.floor(active.index / 2) * cellHeight + dy + scrollY.current - active.scroll;
    floating.setValue({ x, y });
    const column = Math.max(0, Math.min(1, Math.floor((x + cellWidth / 2) / cellWidth)));
    const row = Math.max(0, Math.floor((y + cellHeight / 2) / cellHeight));
    const target = Math.min(itemsRef.current.length - 1, row * 2 + column);
    const current = itemsRef.current.findIndex(item => item.id === active.id);
    if (target !== current) { itemsRef.current = moveAlbum(itemsRef.current, current, target); setItems(itemsRef.current); }
  };
  handlers.current.finish = () => {
    if (!drag.current) return;
    drag.current = null; fingerY.current = null; setDragId(null); onReorder(itemsRef.current);
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: () => !!drag.current,
    onMoveShouldSetPanResponder: () => !!drag.current,
    onPanResponderMove: (_, g) => handlers.current.update(g.dx, g.dy, g.moveY),
    onPanResponderRelease: () => handlers.current.finish(),
    onPanResponderTerminate: () => handlers.current.finish(),
    onPanResponderTerminationRequest: () => !drag.current,
  }), []);
  useEffect(() => {
    if (!dragId) return;
    const timer = setInterval(() => {
      const active = drag.current, y = fingerY.current;
      if (!active || y === null) return;
      const top = viewportY.current, bottom = top + viewportHeight.current;
      const speed = y < top + 90 ? -12 : y > bottom - 90 ? 12 : 0;
      if (!speed) return;
      const next = Math.max(0, Math.min(Math.max(0, contentHeight.current - viewportHeight.current), scrollY.current + speed));
      scrollY.current = next; scroll.current?.scrollTo({ y: next, animated: false });
      handlers.current.update(active.dx, active.dy);
    }, 16);
    return () => clearInterval(timer);
  }, [dragId]);
  function hold(album: Album, index: number) {
    viewport.current?.measureInWindow((_x, y) => { viewportY.current = y; });
    drag.current = { id: album.id, index, scroll: scrollY.current, dx: 0, dy: 0 };
    floating.setValue({ x: index % 2 * cellWidth, y: Math.floor(index / 2) * cellHeight });
    setDragId(album.id);
  }
  const activeAlbum = items.find(item => item.id === dragId);
  return <View onTouchEndCapture={event => { if (!event.nativeEvent.touches.length) handlers.current.finish(); }} onTouchCancel={() => handlers.current.finish()} ref={viewport} style={{ flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' }} onLayout={event => { setWidth(event.nativeEvent.layout.width); viewportHeight.current = event.nativeEvent.layout.height; viewport.current?.measureInWindow((_x, y) => { viewportY.current = y; }); }} {...responder.panHandlers}>
    <ScrollView ref={scroll} scrollEnabled={!dragId} scrollEventThrottle={16} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }} onContentSizeChange={(_w, h) => { contentHeight.current = h; }}>
      <View>{header}</View>
      <View style={{ height: Math.ceil(items.length / 2) * cellHeight }}>
        {width > 0 && items.map((album, index) => <Tile key={album.id} album={album} connection={connection} width={cellWidth} height={cellHeight} index={index} dragging={dragId === album.id} onOpen={() => { if (!drag.current) onOpen(album); }} onHold={() => hold(album, index)} />)}
        {activeAlbum && <Animated.View pointerEvents="none" style={{ position: 'absolute', width: cellWidth, height: cellHeight, left: floating.x, top: floating.y, padding: 8, zIndex: 10, elevation: 12, transform: [{ scale: 1.04 }], opacity: .95 }}><Cover album={activeAlbum} connection={connection} /><Text numberOfLines={1} style={[s.label, { marginTop: 8 }]}>{activeAlbum.albumName}</Text><Text style={s.small}>{activeAlbum.assetCount} items</Text></Animated.View>}
      </View>
    </ScrollView>
  </View>;
}
