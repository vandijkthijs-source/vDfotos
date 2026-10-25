import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import type { Asset, Connection } from '../features/sorting/types';
import { captureSwipe } from '../features/sorting/swipe';
import { ImmichClient } from '../lib/immich';
import { colors as c } from '../constants/theme';
import { PhotoViewer } from './PhotoViewer';
import { Button, Icon, s } from './ui';

function DemoArtwork({ asset }: { asset: Asset }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: asset.demoColor, overflow: 'hidden', justifyContent: 'flex-end', padding: 24 }]}>
    <View style={{ position: 'absolute', width: 140, height: 140, borderRadius: 100, backgroundColor: '#efd8a0', opacity: .8, top: 48, right: 30 }} />
    <View style={{ position: 'absolute', width: 430, height: 300, borderRadius: 160, backgroundColor: '#273f3d', transform: [{ rotate: '-25deg' }], bottom: -100, left: -80 }} />
    <View style={{ position: 'absolute', width: 340, height: 250, borderRadius: 140, backgroundColor: '#456356', transform: [{ rotate: '30deg' }], bottom: -80, right: -100 }} />
    <Text style={{ color: '#ffffffaa', fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>SAMPLE MOMENT</Text>
    <Text style={{ color: '#fff', fontSize: 32, fontWeight: '600', maxWidth: 240 }}>{asset.originalFileName}</Text>
  </View>;
}
export function PhotoCard({ asset, assets = [asset], connection, onDecision, onAlbum, disabled, fill = false }: { asset: Asset; assets?: Asset[]; connection: Connection; onDecision: (kind: 'keep' | 'trash') => void; onAlbum?: () => void; disabled?: boolean; fill?: boolean }) {
  const { width, height } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY()).current;
  const locking = useRef(false);
  const [viewing, setViewing] = useState(false), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !disabled && ((Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4) || (!!onAlbum && g.dy < -12 && -g.dy > Math.abs(g.dx) * 1.4)),
    onPanResponderMove: (_, g) => { if (!locking.current) position.setValue({ x: g.dx, y: onAlbum && -g.dy > Math.abs(g.dx) * 1.4 ? g.dy : g.dy * .12 }); },
    onPanResponderRelease: (_, g) => {
      if (locking.current) return;
      if (onAlbum && g.dy < -70 && -g.dy > Math.abs(g.dx) * 1.4) {
        position.setValue({ x: 0, y: 0 });
        onAlbum();
      } else if (Math.abs(g.dx) > Math.min(width * .24, 105) && Math.abs(g.dx) > Math.abs(g.dy) * 1.4) {
        locking.current = true;
        const commitSwipe = captureSwipe(g.dx, onDecision);
        Animated.timing(position, { toValue: { x: g.dx > 0 ? width : -width, y: 15 }, duration: 180, useNativeDriver: false }).start(({ finished }) => {
          if (finished) commitSwipe(); position.setValue({ x: 0, y: 0 }); locking.current = false;
        });
      } else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => { position.setValue({ x: 0, y: 0 }); },
  }), [disabled, onAlbum, onDecision, position, width]);
  const media = connection.demo ? undefined : new ImmichClient(connection).media(asset);
  const photo = () => asset.demoColor ? <DemoArtwork asset={asset} /> : <><Image source={connection.demo ? undefined : new ImmichClient(connection).media(asset, false, 'thumbnail')} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" /><Image key={retry} source={media} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailed(true)} accessibilityLabel={asset.originalFileName} /></>;
  return <>
    <Animated.View {...responder.panHandlers} style={{ width: '100%', height: fill ? undefined : Math.max(220, Math.min(height * .48, 500)), flex: fill ? 1 : undefined, minHeight: fill ? 80 : undefined, borderRadius: 26, backgroundColor: '#080f10', overflow: 'hidden', transform: [{ translateX: position.x }, { translateY: position.y }, { rotate: position.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] }) }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={asset.type === 'VIDEO' ? 'Play video' : 'Enlarge photo'} onPress={() => setViewing(true)} style={{ flex: 1 }}>
        {photo()}
        {asset.type === 'VIDEO' && <View style={{ position: 'absolute', alignSelf: 'center', top: '43%', backgroundColor: '#101819bb', borderRadius: 40, padding: 16 }}><Icon name="play" size={32} /></View>}
        {failed && <View style={{ position: 'absolute', top: 20, left: 16, right: 16, gap: 12, backgroundColor: c.panel, padding: 16, borderRadius: 12 }}><Text style={s.body}>Preview could not load. Check Wi-Fi, permissions, or wait for Immich to generate it.</Text><Button title="Retry preview" tone="quiet" onPress={() => { setFailed(false); setRetry(r => r + 1); }} /></View>}
        <View style={{ position: 'absolute', top: 16, left: 16, backgroundColor: '#101819c9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={[s.small, { color: c.text }]}>{new Date(asset.fileCreatedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text></View>
        <View style={{ position: 'absolute', bottom: 14, right: 14, padding: 9, borderRadius: 30, backgroundColor: '#101819bb' }}><Icon name="expand-outline" size={18} /></View>
      </Pressable>
      {onAlbum && <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: c.panel, padding: 12, borderRadius: 9, opacity: position.y.interpolate({ inputRange: [-70, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }}><Text style={s.heading}>ALBUM</Text></Animated.View>}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 80, right: 24, borderColor: c.accent, borderWidth: 3, borderRadius: 9, padding: 12, opacity: position.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }) }}><Text style={[s.heading, { color: c.accent }]}>KEEP</Text></Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 80, left: 24, borderColor: c.danger, borderWidth: 3, borderRadius: 9, padding: 12, opacity: position.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }}><Text style={[s.heading, { color: c.danger }]}>DELETE</Text></Animated.View>
    </Animated.View>
    {viewing && <PhotoViewer asset={asset} assets={assets} connection={connection} onClose={() => setViewing(false)} showActions={false} />}
  </>;
}
