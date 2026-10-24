import { useEffect } from 'react';
import { Image } from 'expo-image';
import type { Asset, Connection } from '../features/sorting/types';
import { ImmichClient } from './immich';

// Only preload a few screen-sized previews, never full-resolution originals.
export function useImagePreload(connection: Connection | null, assets: Asset[]) {
  const ids = [...new Set(assets.slice(0, 3).map(asset => asset.id))].join(',');
  const url = connection?.url, key = connection?.key, demo = connection?.demo;
  useEffect(() => {
    if (!url || !key || demo || !ids) return;
    const client = new ImmichClient({ url, key, userId: '', name: '' });
    const sources = ids.split(',').map(id => client.media({ id } as Asset));
    void Image.prefetch(sources.map(source => source.uri), { headers: sources[0].headers, cachePolicy: 'memory-disk' }).catch(() => {});
  }, [url, key, demo, ids]);
}
