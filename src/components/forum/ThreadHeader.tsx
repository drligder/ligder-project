type ThreadHeaderProps = {
  title: string;
  /** e.g. "by moderator · Mar 20, 2026" */
  byline: string;
};

/**
 * Thread title bar — matches bitcointalk-style gray header strip.
 */
export function ThreadHeader({ title, byline }: ThreadHeaderProps) {
  return (
    <div
      className="forum-thread-header flex flex-col gap-1 border-b border-gray-400 bg-gray-100 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2 sm:gap-y-0"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <span className="min-w-0 break-words font-bold">{title}</span>
      {byline ? (
        <span className="text-sm text-gray-600 sm:ml-0">{byline}</span>
      ) : null}
    </div>
  );
}
