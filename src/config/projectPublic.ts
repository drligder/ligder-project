/**
 * Public launch / branding — edit `project.public.json` at the repo root and commit.
 * Server uses the same file for LITE mint when `LITE_TOKEN_MINT` is unset (env wins if set).
 */
import raw from '../../project.public.json';

export interface ProjectPublicConfig {
  liteTokenMint: string;
  githubRepoUrl: string;
  twitterProfileUrl: string;
}

export const projectPublicConfig = raw as ProjectPublicConfig;

const mintRaw = (projectPublicConfig.liteTokenMint ?? '').trim();

/** Shown on profile / marketing; "TBA" when unset or placeholder. */
export const liteTokenMintDisplay =
  !mintRaw || /^tba$/i.test(mintRaw) ? 'TBA' : mintRaw;

export const liteTokenMintCanCopy = liteTokenMintDisplay !== 'TBA';

export const githubRepoUrl = (projectPublicConfig.githubRepoUrl ?? '').trim();
export const twitterProfileUrl = (projectPublicConfig.twitterProfileUrl ?? '').trim();
