export type Asset = {
  id: string; ownerId: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  originalFileName: string; fileCreatedAt: string; localDateTime: string;
  isFavorite?: boolean; isTrashed?: boolean; visibility?: string; duration?: number | null;
  exifInfo?: { city?: string | null; country?: string | null };
  demoColor?: string;
};
export type Album = { id: string; albumName: string; assetCount: number; albumThumbnailAssetId?: string | null };
export type Connection = { url: string; key: string; userId: string; name: string; demo?: boolean };
export type Decision = {
  asset: Asset; kind: 'keep' | 'trash'; albumId?: string; albumName?: string;
  week: string; at: number;
};
export type Progress = {
  pending: Record<string, Decision>;
  completed: Record<string, { kind: 'keep' | 'trash'; week: string; albumId?: string; at: number }>;
  selectedAlbum?: string;
  resetWeeks?: Record<string, number>;
  manualWeeks?: Record<string, boolean>;
  sortedWeeks?: Record<string, boolean>;
};
