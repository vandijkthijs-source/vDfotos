import type { Decision } from './types';
type Actions = {
  keep: (id: string, albumId: string) => Promise<void>;
  trash: (asset: Decision['asset']) => Promise<void>;
};
export async function commitDecisions(decisions: Decision[], actions: Actions, done: (id: string) => void) {
  // Keeps first. Successful decisions are persisted individually so a failed request
  // never marks an unsent item complete. Album additions and trash retries are idempotent.
  const ordered = [...decisions].sort((a, b) => Number(a.kind === 'trash') - Number(b.kind === 'trash'));
  for (const decision of ordered) {
    if (decision.kind === 'keep') {
      if (decision.albumId) await actions.keep(decision.asset.id, decision.albumId);
    } else if (decision.kind === 'trash') await actions.trash(decision.asset);
    else throw new Error('Unknown decision. Review this photo again before applying.');
    done(decision.asset.id);
  }
}
