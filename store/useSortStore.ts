import { assetWeek } from '../features/sorting/period';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Asset, Decision, Progress } from '../features/sorting/types';
const empty = (): Progress => ({ pending: {}, completed: {} });
type State = {
  accounts: Record<string, Progress>;
  mergeRemote: (account: string, remote: Pick<Progress, 'completed' | 'manualWeeks' | 'resetWeeks'>) => void;
  resetWeek: (account: string, week: string) => void;
  markAssetsReviewed: (account: string, assets: Asset[]) => void;
  markManual: (account: string, week: string, assets: Asset[]) => void;
  markWeek: (account: string, week: string, sorted: boolean) => void;
  stage: (account: string, decision: Decision) => void;
  undo: (account: string, id: string) => void;
  complete: (account: string, id: string) => void;
  selectAlbum: (account: string, album: string) => void;
};
export const useSortStore = create<State>()(persist((set) => ({
  accounts: {},
  mergeRemote: (account, remote) => set(state => {
    const p = state.accounts[account] ?? empty(), completed = { ...p.completed };
    let changed = false;
    for (const [id, value] of Object.entries(remote.completed)) {
      if (!completed[id] || value.at > completed[id].at) { completed[id] = value; changed = true; }
    }
    const resetWeeks = { ...p.resetWeeks };
    for (const [week, at] of Object.entries(remote.resetWeeks ?? {})) {
      if (at > (resetWeeks[week] ?? -1)) { resetWeeks[week] = at; changed = true; }
    }
    const manualWeeks = { ...p.manualWeeks, ...remote.manualWeeks };
    if (!changed && JSON.stringify(manualWeeks) === JSON.stringify(p.manualWeeks ?? {})) return state;
    return { accounts: { ...state.accounts, [account]: { ...p, completed, manualWeeks, resetWeeks } } };
  }),
  resetWeek: (account, week) => set(state => {
    const p = state.accounts[account] ?? empty();
    const at = Math.max(Date.now(), (p.resetWeeks?.[week] ?? 0) + 1, ...Object.values(p.completed).filter(d => d.week === week).map(d => d.at + 1));
    return { accounts: { ...state.accounts, [account]: { ...p, resetWeeks: { ...p.resetWeeks, [week]: at }, sortedWeeks: { ...p.sortedWeeks, [week]: false } } } };
  }),
  markAssetsReviewed: (account, assets) => set(state => {
    const p = state.accounts[account] ?? empty();
    if (assets.some(asset => p.pending[asset.id])) return state;
    const completed = { ...p.completed }, sortedWeeks = { ...p.sortedWeeks };
    for (const asset of assets) {
      const week = assetWeek(asset);
      completed[asset.id] = { kind: 'keep', week, at: Math.max(Date.now(), (p.resetWeeks?.[week] ?? 0) + 1) };
      // A month can include only part of a week. Recheck the full week separately.
      sortedWeeks[week] = false;
    }
    return { accounts: { ...state.accounts, [account]: { ...p, completed, sortedWeeks } } };
  }),
  markManual: (account, week, assets) => set(state => {
    const p = state.accounts[account] ?? empty();
    if (Object.values(p.pending).some(d => d.week === week)) return state;
    const completed = { ...p.completed };
    for (const asset of assets) completed[asset.id] = { kind: 'keep', week, at: Math.max(Date.now(), (p.resetWeeks?.[week] ?? 0) + 1) };
    // Empty-week completion also needs a timestamp newer than a reset.
    completed[`week-marker:${week}`] = { kind: 'keep', week, at: Math.max(Date.now(), (p.resetWeeks?.[week] ?? 0) + 1) };
    return { accounts: { ...state.accounts, [account]: { ...p, completed, manualWeeks: { ...p.manualWeeks, [week]: true }, sortedWeeks: { ...p.sortedWeeks, [week]: true } } } };
  }),
  markWeek: (account, week, sorted) => set(state => {
    const p = state.accounts[account] ?? empty();
    if (p.sortedWeeks?.[week] === sorted) return state;
    return { accounts: { ...state.accounts, [account]: { ...p, sortedWeeks: { ...p.sortedWeeks, [week]: sorted } } } };
  }),
  stage: (account, decision) => set(state => {
    const p = state.accounts[account] ?? empty();
    return { accounts: { ...state.accounts, [account]: { ...p, pending: { ...p.pending, [decision.asset.id]: decision } } } };
  }),
  undo: (account, id) => set(state => {
    const p = state.accounts[account] ?? empty(), pending = { ...p.pending }; delete pending[id];
    return { accounts: { ...state.accounts, [account]: { ...p, pending } } };
  }),
  complete: (account, id) => set(state => {
    const p = state.accounts[account] ?? empty(), pending = { ...p.pending }, decision = pending[id];
    if (!decision) return state;
    delete pending[id];
    const { kind, week, albumId } = decision;
    const at = Math.max(Date.now(), (p.resetWeeks?.[week] ?? 0) + 1);
    return { accounts: { ...state.accounts, [account]: { ...p, pending, completed: { ...p.completed, [id]: { kind, week, albumId, at } } } } };
  }),
  selectAlbum: (account, selectedAlbum) => set(state => ({ accounts: { ...state.accounts, [account]: { ...(state.accounts[account] ?? empty()), selectedAlbum } } })),
}), { name: 'immich-sort-progress-v1', storage: createJSONStorage(() => AsyncStorage) }));
