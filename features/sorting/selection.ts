import type { Asset } from './types';
export function togglePhotoSelection(selected: Asset[], asset: Asset): Asset[] {
  return selected.some(item => item.id === asset.id) ? selected.filter(item => item.id !== asset.id) : [...selected, asset];
}
export function favoriteSelection(selected: Asset[]): boolean {
  return !selected.every(item => item.isFavorite === true);
}
