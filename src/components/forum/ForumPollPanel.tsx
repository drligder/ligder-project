import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useWallet } from '../../contexts/WalletContext';
import { useLigderProfile } from '../../hooks/useLigderProfile';
import { apiUrl } from '../../lib/apiBase';
import { parseApiJson } from '../../lib/parseApiJson';
import { uint8ToBase64 } from '../../lib/uint8Base64';
import type { ForumThreadPoll } from '../../types/forum';

type ForumPollPanelProps = {
  postId: string;
  poll: ForumThreadPoll | null | undefined;
  pollCreateEligible: boolean;
  /** Post author may edit poll text/options (signed PATCH) */
  pollEditEligible?: boolean;
  isGovernanceBoard: boolean;
  onPollsChanged: () => void;
};

export function ForumPollPanel({
  postId,
  poll,
  pollCreateEligible,
  pollEditEligible = false,
  isGovernanceBoard,
  onPollsChanged,
}: ForumPollPanelProps) {
  const { publicKey, signMessage } = useWallet();
  const { isRegistered } = useLigderProfile();
  const { showToast } = useToast();
  const [localPoll, setLocalPoll] = useState<ForumThreadPoll | null>(
    poll ?? null
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [voting, setVoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [qDraft, setQDraft] = useState('');
  const [optsDraft, setOptsDraft] = useState('');
  const [multiDraft, setMultiDraft] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editQ, setEditQ] = useState('');
  const [editOpts, setEditOpts] = useState('');
  const [editMulti, setEditMulti] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLocalPoll(poll ?? null);
  }, [poll]);

  useEffect(() => {
    setShowEdit(false);
  }, [poll?.id]);

  useEffect(() => {
    const ids = localPoll?.my_option_ids;
    if (ids?.length) {
      setSelected(new Set(ids));
    } else {
      setSelected(new Set());
    }
  }, [localPoll?.id, localPoll?.my_option_ids]);

  const canVoteHere = Boolean(
    publicKey &&
      isRegistered &&
      localPoll &&
      localPoll.viewer_can_vote
  );

  const toggleOption = useCallback(
    (optionId: string) => {
      if (!localPoll || !canVoteHere || voting) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (localPoll.allow_multiple) {
          if (next.has(optionId)) next.delete(optionId);
          else next.add(optionId);
        } else {
          next.clear();
          next.add(optionId);
        }
        return next;
      });
    },
    [localPoll, canVoteHere, voting]
  );

  const submitVote = useCallback(async () => {
    if (!publicKey || !localPoll || !canVoteHere) return;
    const ids = [...selected].sort();
    if (ids.length === 0) {
      showToast('Select at least one option.', 'error');
      return;
    }
    if (!localPoll.allow_multiple && ids.length !== 1) {
      showToast('Select exactly one option.', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder forum poll vote',
      `Wallet: ${publicKey}`,
      `Poll: ${localPoll.id}`,
      `Nonce: ${nonce}`,
      '',
      ...ids,
    ].join('\n');
    setVoting(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/poll-ballots'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        tally?: Record<string, number>;
        my_option_ids?: string[];
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Vote failed (${r.status})`);
      }
      const tally = j.tally ?? {};
      setLocalPoll((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          options: prev.options.map((o) => ({
            ...o,
            votes: typeof tally[o.id] === 'number' ? tally[o.id] : o.votes,
          })),
          my_option_ids:
            Array.isArray(j.my_option_ids) && j.my_option_ids.length
              ? j.my_option_ids.map(String)
              : ids,
        };
      });
      showToast('Vote recorded (signed).', 'success');
      onPollsChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Vote failed', 'error');
    } finally {
      setVoting(false);
    }
  }, [
    publicKey,
    localPoll,
    canVoteHere,
    selected,
    signMessage,
    showToast,
    onPollsChanged,
  ]);

  const createPoll = useCallback(async () => {
    if (!publicKey || !pollCreateEligible) return;
    const question = qDraft.trim();
    const options = optsDraft
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!question) {
      showToast('Poll question is required.', 'error');
      return;
    }
    if (options.length < 2 || options.length > 10) {
      showToast('Enter 2–10 options (one per line).', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const mode = multiDraft ? 'multiple' : 'single';
    const message = [
      'Ligder forum poll create',
      `Wallet: ${publicKey}`,
      `Post: ${postId}`,
      `Nonce: ${nonce}`,
      `Mode: ${mode}`,
      '',
      question,
      '---',
      ...options,
    ].join('\n');
    setCreating(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/polls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        poll?: ForumThreadPoll;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Could not create poll (${r.status})`);
      }
      if (j.poll) {
        setLocalPoll({
          ...j.poll,
          my_option_ids: j.poll.my_option_ids ?? null,
        });
      }
      setShowCreate(false);
      setQDraft('');
      setOptsDraft('');
      showToast('Poll created (signed).', 'success');
      onPollsChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Poll create failed', 'error');
    } finally {
      setCreating(false);
    }
  }, [
    publicKey,
    pollCreateEligible,
    postId,
    qDraft,
    optsDraft,
    multiDraft,
    signMessage,
    showToast,
    onPollsChanged,
  ]);

  const editPoll = useCallback(async () => {
    if (!publicKey || !localPoll || !pollEditEligible) return;
    const question = editQ.trim();
    const options = editOpts
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!question) {
      showToast('Poll question is required.', 'error');
      return;
    }
    if (options.length < 2 || options.length > 10) {
      showToast('Enter 2–10 options (one per line).', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const mode = editMulti ? 'multiple' : 'single';
    const message = [
      'Ligder forum poll edit',
      `Wallet: ${publicKey}`,
      `Poll: ${localPoll.id}`,
      `Nonce: ${nonce}`,
      `Mode: ${mode}`,
      '',
      question,
      '---',
      ...options,
    ].join('\n');
    setEditing(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/polls'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        poll?: ForumThreadPoll;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Could not update poll (${r.status})`);
      }
      if (j.poll) {
        setLocalPoll({
          ...j.poll,
          my_option_ids: j.poll.my_option_ids ?? null,
        });
      }
      setShowEdit(false);
      showToast('Poll updated (signed).', 'success');
      onPollsChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Poll update failed', 'error');
    } finally {
      setEditing(false);
    }
  }, [
    publicKey,
    localPoll,
    pollEditEligible,
    editQ,
    editOpts,
    editMulti,
    signMessage,
    showToast,
    onPollsChanged,
  ]);

  const totalVotes = useMemo(() => {
    if (!localPoll?.options.length) return 0;
    return localPoll.options.reduce((s, o) => s + (o.votes || 0), 0);
  }, [localPoll]);

  if (!localPoll && !pollCreateEligible) {
    return null;
  }

  const hasVotes = totalVotes > 0;

  return (
    <div
      className="mt-3 pt-3 border-t border-dashed border-gray-300"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {isGovernanceBoard ? (
        <p className="text-[0.72rem] text-gray-600 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
          Ligder Governance: creating polls and voting requires ≥ 0.25% of supply (2,500,000 LITE), or
          admin/moderator.
        </p>
      ) : null}

      {localPoll ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-gray-900 m-0" style={{ fontFamily: 'Arial, sans-serif' }}>
              Poll
            </p>
            {pollEditEligible && !showEdit ? (
              <button
                type="button"
                className="text-sm text-blue-800 underline hover:text-blue-950"
                onClick={() => {
                  setEditQ(localPoll.question);
                  setEditOpts(localPoll.options.map((o) => o.label).join('\n'));
                  setEditMulti(localPoll.allow_multiple);
                  setShowEdit(true);
                }}
              >
                Edit poll
              </button>
            ) : null}
          </div>
          {showEdit && pollEditEligible ? (
            <div className="border border-gray-300 bg-gray-50 p-3 space-y-2 mb-3">
              <p className="text-xs font-semibold text-gray-800 m-0">Edit poll (signed)</p>
              {hasVotes ? (
                <p className="text-[0.72rem] text-amber-900 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Votes have been cast: you can fix question and option wording only—same number of options, same
                  single/multi mode. To change choices, start a new thread or post.
                </p>
              ) : (
                <p className="text-[0.72rem] text-gray-600 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  No votes yet: you can change the question, options, and single vs multiple.
                </p>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={editMulti}
                  onChange={(e) => setEditMulti(e.target.checked)}
                  disabled={editing || hasVotes}
                />
                Allow multiple choices
              </label>
              <input
                type="text"
                className="w-full text-sm border border-gray-400 px-2 py-1 bg-white"
                placeholder="Question"
                value={editQ}
                onChange={(e) => setEditQ(e.target.value)}
                maxLength={500}
                disabled={editing}
              />
              <textarea
                className="w-full text-sm border border-gray-400 px-2 py-1 bg-white font-mono"
                rows={5}
                placeholder="Options — one per line (2–10)"
                value={editOpts}
                onChange={(e) => setEditOpts(e.target.value)}
                disabled={editing}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 border border-gray-800 bg-white disabled:opacity-50"
                  disabled={editing}
                  onClick={() => void editPoll()}
                >
                  {editing ? 'Signing…' : 'Sign & save changes'}
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 border border-gray-400 bg-white"
                  disabled={editing}
                  onClick={() => setShowEdit(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {!showEdit ? (
            <>
              <p className="text-sm text-gray-800 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
                {localPoll.question}
              </p>
              <ul className="list-none m-0 p-0 space-y-1.5 mb-2">
                {localPoll.options.map((o) => {
                  const pct =
                    totalVotes > 0 ? Math.round((100 * o.votes) / totalVotes) : 0;
                  return (
                    <li key={o.id} className="flex flex-col gap-0.5">
                      <label
                        className={`flex items-start gap-2 text-sm ${
                          canVoteHere ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <input
                          type={localPoll.allow_multiple ? 'checkbox' : 'radio'}
                          name={`ligder-poll-${localPoll.id}`}
                          className="mt-1 shrink-0"
                          checked={selected.has(o.id)}
                          disabled={!canVoteHere || voting}
                          onChange={() => toggleOption(o.id)}
                        />
                        <span className="text-gray-800" style={{ fontFamily: 'Times New Roman, serif' }}>
                          {o.label}
                        </span>
                        <span className="text-gray-500 text-xs tabular-nums ml-auto shrink-0">
                          {o.votes} ({pct}%)
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {canVoteHere ? (
                <button
                  type="button"
                  disabled={voting || selected.size === 0}
                  onClick={() => void submitVote()}
                  className="text-sm px-3 py-1.5 border border-gray-800 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                >
                  {voting ? 'Signing…' : 'Sign & submit vote'}
                </button>
              ) : publicKey && isRegistered && localPoll && !localPoll.viewer_can_vote ? (
                <p className="text-xs text-amber-900 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  You cannot vote on this poll (governance threshold not met).
                </p>
              ) : !publicKey || !isRegistered ? (
                <p className="text-xs text-gray-600 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Connect and register to vote.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {pollCreateEligible && !localPoll ? (
        <div className="mt-1">
          {!showCreate ? (
            <button
              type="button"
              className="text-sm text-blue-800 underline hover:text-blue-950"
              onClick={() => setShowCreate(true)}
            >
              Add poll to this post
            </button>
          ) : (
            <div className="border border-gray-300 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-800 m-0">New poll (signed)</p>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={multiDraft}
                  onChange={(e) => setMultiDraft(e.target.checked)}
                />
                Allow multiple choices
              </label>
              <input
                type="text"
                className="w-full text-sm border border-gray-400 px-2 py-1 bg-white"
                placeholder="Question"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                maxLength={500}
                disabled={creating}
              />
              <textarea
                className="w-full text-sm border border-gray-400 px-2 py-1 bg-white font-mono"
                rows={5}
                placeholder="Options — one per line (2–10)"
                value={optsDraft}
                onChange={(e) => setOptsDraft(e.target.value)}
                disabled={creating}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 border border-gray-800 bg-white disabled:opacity-50"
                  disabled={creating}
                  onClick={() => void createPoll()}
                >
                  {creating ? 'Signing…' : 'Sign & create poll'}
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 border border-gray-400 bg-white"
                  disabled={creating}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
