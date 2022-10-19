export function setGithubToken(githubToken: string) {
  process.env.FIDDLE_CORE_GITHUB_TOKEN = githubToken;
}

export function removeGithubToken() {
  delete process.env.FIDDLE_CORE_GITHUB_TOKEN;
}
