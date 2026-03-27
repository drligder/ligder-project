import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from '../lib/apiBase';
import { forumBoardBasePath } from '../lib/forumBoardBasePath';
import { parseApiJson } from '../lib/parseApiJson';

type PostPublicResponse = {
  id: string;
  body: string;
  thread_id: string;
  board_id: string;
  thread_number: number;
  parent_id: string | null;
  created_at: string;
  forum_section?: string | null;
};

export default function ForumPostBodyPage() {
  const { postId } = useParams<{ postId: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [post, setPost] = useState<PostPublicResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = postId?.trim();
    if (!id) {
      setLoading(false);
      setErr('Missing post id');
      return;
    }
    setLoading(true);
    setErr(null);
    setPost(null);
    const ac = new AbortController();
    void fetch(apiUrl(`/api/forum/thread-posts/${encodeURIComponent(id)}`), { signal: ac.signal })
      .then(async (r) => {
        const j = await parseApiJson<PostPublicResponse & { error?: string }>(r);
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        setPost(j as PostPublicResponse);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setErr(e instanceof Error ? e.message : 'Failed to load post');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [postId]);

  const copyBody = useCallback(() => {
    if (!post?.body) return;
    void navigator.clipboard.writeText(post.body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [post?.body]);

  const threadHref =
    post?.board_id != null && post.thread_number != null
      ? `${forumBoardBasePath(post.board_id, post.forum_section ?? null)}/${encodeURIComponent(post.board_id)}/${post.thread_number}`
      : null;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm m-0 mb-4">
          <Link to="/" className="text-blue-800 underline">
            Home
          </Link>
          {' · '}
          <Link to="/forums" className="text-blue-800 underline">
            Forums
          </Link>
          {threadHref ? (
            <>
              {' · '}
              <Link to={threadHref} className="text-blue-800 underline">
                Open thread
              </Link>
            </>
          ) : null}
        </p>
        <h1 className="text-xl font-bold text-gray-900 m-0 mb-2">Forum post text</h1>
        <p className="text-sm text-gray-600 m-0 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
          Loaded by post id (on-chain memos only store a hash — text comes from the forum database).
        </p>
        {loading ? (
          <p className="text-sm text-gray-700 m-0">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800 m-0">{err}</p>
        ) : post ? (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => copyBody()}
                className="text-sm px-3 py-1.5 border border-gray-800 bg-white hover:bg-gray-100"
              >
                {copied ? 'Copied' : 'Copy full text'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-gray-50 p-4 border border-gray-300 text-gray-900 m-0 max-h-[min(70vh,32rem)] overflow-auto">
              {post.body}
            </pre>
            <p className="text-xs text-gray-500 mt-3 font-mono break-all m-0">Post id: {post.id}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
