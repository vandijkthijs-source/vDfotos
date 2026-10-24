import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Connection } from '../features/sorting/types';
const key = 'immich-sort-connection';
// Browser preview deliberately keeps credentials in memory, never localStorage.
let browserConnection: Connection | null = null;
export async function saveConnection(value: Connection | null) {
  if (Platform.OS === 'web') { browserConnection = value; return; }
  if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(key);
}
export async function loadConnection(): Promise<Connection | null> {
  if (Platform.OS === 'web') return browserConnection;
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) as Connection : null;
}
