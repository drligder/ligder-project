export type PostVoteSnapshot = {
  up: number;
  down: number;
  /** Current user's vote if wallet connected and registered */
  myVote: 1 | -1 | null;
};

export type PostVoteAction = 'up' | 'down' | 'clear';
