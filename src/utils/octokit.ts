import { Octokit } from '@octokit/rest';

let _octo: Octokit;
/**
 * Returns a loaded Octokit. If state is passed and authentication
 * is available, we'll token-authenticate.
 * @returns {Octokit}
 */
export function getOctokit(token?: string): Octokit {
  // It's possible to load Gists without being authenticated,
  // but we get better rate limits when authenticated.
  _octo =
    _octo || token
      ? new Octokit({
          auth: token,
        })
      : new Octokit();

  return _octo;
}
