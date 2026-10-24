import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors as c } from '../constants/theme';
export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, color = c.text, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return <Ionicons name={name} color={color} size={size} />;
}
export function Button({ title, onPress, icon, tone = 'primary', disabled, busy }: {
  title: string; onPress: () => void; icon?: IconName; tone?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; busy?: boolean;
}) {
  const ink = tone === 'primary' ? c.ink : tone === 'danger' ? c.danger : c.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [s.button, { backgroundColor: tone === 'primary' ? c.accent : tone === 'danger' ? c.dangerBg : c.raised, opacity: disabled || busy ? .45 : pressed ? .75 : 1 }]}>
    {busy ? <ActivityIndicator color={ink} /> : icon ? <Icon name={icon} color={ink} size={19} /> : null}
    <Text style={[s.buttonText, { color: ink }]}>{title}</Text>
  </Pressable>;
}
export function IconButton({ name, label, onPress, disabled }: { name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.iconButton, { opacity: disabled ? .35 : 1 }]}><Icon name={name} /></Pressable>;
}
export function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={s.label}>{props.label}</Text><TextInput {...props} placeholderTextColor={c.muted} style={[s.input, props.style]} /></View>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <View style={[s.notice, error && { borderColor: c.danger }]}><Icon name={error ? 'alert-circle-outline' : 'information-circle-outline'} color={error ? c.danger : c.accent} size={20} /><Text style={[s.body, { flex: 1, color: error ? c.danger : c.muted }]}>{children}</Text></View>;
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 24, gap: 22, width: '100%', maxWidth: 540, alignSelf: 'center', flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2.3 },
  title: { color: c.text, fontSize: 28, fontWeight: '700', letterSpacing: -1.3, lineHeight: 42 },
  heading: { color: c.text, fontSize: 22, fontWeight: '600', letterSpacing: -.5 },
  body: { color: c.muted, fontSize: 14, lineHeight: 22 },
  small: { color: c.muted, fontSize: 12, lineHeight: 18 },
  label: { color: c.text, fontSize: 13, fontWeight: '600' },
  panel: { backgroundColor: c.panel, borderRadius: 10, padding: 20, gap: 14, borderWidth: 1, borderColor: c.border },
  button: { minHeight: 52, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.panel },
  input: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.border, color: c.text, minHeight: 54, borderRadius: 10, paddingHorizontal: 16, fontSize: 15 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: 10 },
  divider: { height: 1, backgroundColor: c.border },
  pill: { backgroundColor: c.raised, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
});
