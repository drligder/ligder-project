import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';
import type { PostVoteAction, PostVoteSnapshot } from '../types/forumVotes';

function voteApiErrorMessage(status: number, bodyError: string | undefined, fallback: string): string {
  const e = bodyError?.trim() || '';
  if (status === 404 || e === 'Not found') {
    return 'Vote API not found on this server. Stop and restart the Ligder API from this project (npm run dev, or npm run dev:server) so it loads the latest server/index.mjs. If .env sets VITE_API_BASE, it must point at that same updated API.';
  }
  return e || fallback;
}

type VoteMap = Record<string, PostVoteSnapshot>;

function emptySnapshot(): PostVoteSnapshot {
  return { up: 0, down: 0, myVote: null };
}

export function useForumPostVotes(
  postIds: readonly string[],
  publicKey: string | null,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  /** Same thread while post list grows → refetch votes without disabling controls */
  threadKey?: string
) {
  const [votes, setVotes] = useState<VoteMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const prevThreadKeyRef = useRef<string | undefined>(undefined);
  const prevPostIdsKeyRef = useRef<string>('');

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (postIds.length === 0) {
      setVotes({});
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const q = new URLSearchParams();
      q.set('postIds', postIds.join(','));
      if (publicKey) q.set('wallet', publicKey);
      const r = await fetch(apiUrl(`/api/forum/post-votes?${q.toString()}`));
      const j = await parseApiJson<{ votes?: VoteMap; error?: string }>(r);
      if (!r.ok) {
        throw new Error(voteApiErrorMessage(r.status, j.error, 'Could not load votes'));
      }
      const raw = j.votes ?? {};
      const next: VoteMap = {};
      for (const id of postIds) {
        const v = raw[id];
        next[id] = v
          ? {
              up: typeof v.up === 'number' ? v.up : 0,
              down: typeof v.down === 'number' ? v.down : 0,
              myVote:
                v.myVote === 1 || v.myVote === -1 ? v.myVote : null,
            }
          : emptySnapshot();
      }
      setVotes(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load votes');
      const next: VoteMap = {};
      for (const id of postIds) {
        next[id] = emptySnapshot();
      }
      setVotes(next);
    } finally {
      setLoading(false);
    }
  }, [postIds, publicKey]);

  useEffect(() => {
    const key = threadKey ?? '';
    const postIdsKey = postIds.join(',');
    const threadChanged = prevThreadKeyRef.current !== key;
    if (threadChanged) {
      prevThreadKeyRef.current = key;
      prevPostIdsKeyRef.current = '';
    }
    const hadPostsBefore = prevPostIdsKeyRef.current !== '';
    const idsChanged = postIdsKey !== prevPostIdsKeyRef.current;
    prevPostIdsKeyRef.current = postIdsKey;
    const silent =
      !threadChanged && hadPostsBefore && idsChanged && postIds.length > 0;
    void refresh({ silent });
  }, [postIds, refresh, threadKey]);

  const castVote = useCallback(
    async (postId: string, action: PostVoteAction) => {
      if (!publicKey) {
        throw new Error('Connect your wallet to vote');
      }
      const nonce = crypto.randomUUID();
      const message = [
        'Ligder forum post vote',
        `Wallet: ${publicKey}`,
        `Post: ${postId}`,
        `Action: ${action}`,
        `Nonce: ${nonce}`,
      ].join('\n');
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/post-votes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
          postId,
          action,
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        up?: number;
        down?: number;
        myVote?: number | null;
      }>(r);
      if (!r.ok) {
        throw new Error(voteApiErrorMessage(r.status, j.error, 'Vote failed'));
      }
      setVotes((prev) => ({
        ...prev,
        [postId]: {
          up: typeof j.up === 'number' ? j.up : 0,
          down: typeof j.down === 'number' ? j.down : 0,
          myVote:
            j.myVote === 1 || j.myVote === -1 ? j.myVote : null,
        },
      }));
    },
    [publicKey, signMessage]
  );

  return { votes, loading, error, refresh, castVote };
}
