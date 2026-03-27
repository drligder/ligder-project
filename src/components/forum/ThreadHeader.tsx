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
      className="forum-thread-header bg-gray-100 px-3 py-2 border-b border-gray-400"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <span className="font-bold">{title}</span>
      <span className="text-gray-600 text-sm ml-2">{byline}</span>
    </div>
  );
}
