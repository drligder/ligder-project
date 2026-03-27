/**
 * Icon before board titles — official boards use megaphone, all others use chat.
 */
export function ForumBoardIcon({ iconKey }: { iconKey: string }) {
  const cls =
    'inline-flex shrink-0 text-gray-800 mr-2 align-middle [&_svg]:w-[1.1em] [&_svg]:h-[1.1em] [&_svg]:translate-y-px';
  if (iconKey === 'megaphone') {
    return (
      <span className={cls} aria-hidden>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
      </svg>
    </span>
  );
}
