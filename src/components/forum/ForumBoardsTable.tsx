import { Link } from 'react-router-dom';
import type { ForumBoardRow } from '../../types/forumBoards';
import { ForumBoardIcon } from './ForumBoardIcon';

type ForumBoardsTableProps = {
  boards: ForumBoardRow[];
  /** e.g. `/forums/ligder-official` → thread list at `/forums/ligder-official/:id` */
  boardLinkBase: string;
};

/**
 * Fixed column layout so Topics / Posts / Last post align across all section tables on the hub
 * and landing pages (same percentages + fixed stat column width).
 */
export function ForumBoardsTable({ boards, boardLinkBase }: ForumBoardsTableProps) {
  const base = boardLinkBase.replace(/\/$/, '');
  return (
    <div className="forum-table-wrap mb-6">
      <table className="forum-table forum-boards-table w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '44%' }} />
          <col style={{ width: '5.5rem' }} />
          <col style={{ width: '5.5rem' }} />
          <col />
        </colgroup>
        <thead>
          <tr className="forum-table-head">
            <th className="text-left p-2 border border-gray-400 min-w-0">Board</th>
            <th className="text-center p-2 border border-gray-400 whitespace-nowrap">Topics</th>
            <th className="text-center p-2 border border-gray-400 whitespace-nowrap">Posts</th>
            <th className="text-left p-2 border border-gray-400 min-w-0">Last post</th>
          </tr>
        </thead>
        <tbody>
          {boards.map((b) => (
            <tr key={b.id} className="forum-table-row bg-white">
              <td className="p-2 border border-gray-400 align-top min-w-0">
                <Link
                  to={`${base}/${encodeURIComponent(b.id)}`}
                  className="font-bold text-blue-800 hover:underline inline-flex items-start gap-0"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  <ForumBoardIcon iconKey={b.icon_key} />
                  <span>{b.title}</span>
                </Link>
                {b.description ? (
                  <div
                    className="text-gray-700 mt-1"
                    style={{ fontFamily: 'Times New Roman, serif' }}
                  >
                    {b.description}
                  </div>
                ) : null}
              </td>
              <td className="p-2 border border-gray-400 text-center font-mono text-xs tabular-nums align-middle whitespace-nowrap">
                {b.topics_count ?? 0}
              </td>
              <td className="p-2 border border-gray-400 text-center font-mono text-xs tabular-nums align-middle whitespace-nowrap">
                {b.posts_count ?? 0}
              </td>
              <td
                className="p-2 border border-gray-400 text-gray-700 text-xs min-w-0 align-middle"
                style={{ fontFamily: 'Times New Roman, serif' }}
              >
                {b.last_post && b.last_thread_id ? (
                  <Link
                    to={`${base}/${encodeURIComponent(b.id)}/${encodeURIComponent(b.last_thread_id)}`}
                    className="hover:underline text-blue-800 block break-words"
                    style={{ fontFamily: 'Times New Roman, serif' }}
                  >
                    {b.last_post}
                  </Link>
                ) : (
                  <span className="block break-words">{b.last_post ?? '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
