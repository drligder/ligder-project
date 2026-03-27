/**
 * URL prefix for a board under `/forums/…`, from DB `forum_boards.section` or `board_id` heuristics.
 */
export function forumBoardBasePath(boardId: string, section?: string | null): string {
  const sec = section?.trim().toUpperCase();
  if (sec === 'LIGDER GOVERNANCE') return '/forums/ligder-governance';
  if (sec === 'LIGDER GENERAL') return '/forums/ligder-general';
  if (sec === 'LIGDER TECHNICAL') return '/forums/ligder-technical';
  if (sec === 'LIGDER OFFICIAL') return '/forums/ligder-official';
  if (boardId.startsWith('ligder-governance-')) return '/forums/ligder-governance';
  if (boardId.startsWith('ligder-general-')) return '/forums/ligder-general';
  if (boardId.startsWith('ligder-technical-')) return '/forums/ligder-technical';
  return '/forums/ligder-official';
}

/** First `/forums/ligder-…` segment from the current path (for board + thread pages). */
export function forumBoardBaseFromPathname(pathname: string): string {
  const m = pathname.match(/^(\/forums\/ligder-[^/]+)/);
  return m ? m[1] : '/forums/ligder-official';
}

/** Breadcrumb label for the section landing link (← …). */
export function forumSectionLabelFromBase(boardBase: string): string {
  switch (boardBase) {
    case '/forums/ligder-general':
      return 'Ligder General';
    case '/forums/ligder-governance':
      return 'Ligder Governance';
    case '/forums/ligder-technical':
      return 'Ligder Technical';
    case '/forums/ligder-official':
    default:
      return 'Ligder Official';
  }
}
