import { Octokit } from '@octokit/rest';

let octokit: Octokit | undefined;
let cachedToken: string | undefined;

/**
 * Returns a shared Octokit instance.
 *
 * It's possible to load gists and public repositories without authenticating,
 * but providing a token gives better rate limits. The token is read from the
 * `FIDDLE_CORE_GITHUB_TOKEN` environment variable.
 */
export function getOctokit(): Octokit {
  // Recreate the instance if the token changed since it was last created so
  // that callers setting `FIDDLE_CORE_GITHUB_TOKEN` at runtime are respected.
  const token = process.env.FIDDLE_CORE_GITHUB_TOKEN;
  if (!octokit || token !== cachedToken) {
    octokit = new Octokit(token ? { auth: token } : {});
    cachedToken = token;
  }
  return octokit;
}
