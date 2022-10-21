import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import fetch from 'node-fetch';
import { createHash } from 'crypto';

import { DefaultPaths } from './paths';
import { getOctokit } from './utils/octokit';

function hashString(str: string): string {
  const md5sum = createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
}

export class Fiddle {
  constructor(
    public readonly mainPath: string, // /path/to/main.js
    public readonly source: string,
  ) {}

  public remove(): Promise<void> {
    return fs.remove(path.dirname(this.mainPath));
  }
}

/**
 * - Iterable of [string, string] - filename-to-content key/value pairs
 * - string of form '/path/to/fiddle' - a fiddle on the filesystem
 * - string of form 'https://github.com/my/repo.git' - a git repo fiddle
 * - string of form '642fa8daaebea6044c9079e3f8a46390' - a github gist fiddle
 */
export type FiddleSource = Fiddle | string | Iterable<[string, string]>;

export class FiddleFactory {
  private readonly VALID_FILES: Array<string> = [
    'main.js',
    'renderer.js',
    'index.html',
    'preload.js',
    'styles.css',
  ];
  // Thanks to https://serverfault.com/a/917253
  private readonly GITHUB_URL_REGEX = new RegExp(
    '^(https|git)(://|@)([^/:]+)[/:]([^/:]+)/(.+).git$',
  );

  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

  public async fromGist(gistId: string) {
    // stores in format [filename, content]
    const gistContents: [string, string][] = [];
    const octokit = getOctokit(process.env.FIDDLE_CORE_GITHUB_TOKEN);
    const gist = await octokit.gists.get({ gist_id: gistId });

    if (gist.data.files === undefined) {
      return;
    }

    for (const [, data] of Object.entries(gist.data.files)) {
      const fileName = data?.filename;
      const content = data?.content;

      if (fileName === undefined || content === undefined) {
        continue;
      }
      if (this.VALID_FILES.includes(fileName)) {
        gistContents.push([fileName, content]);
      }
    }

    return this.fromEntries(gistContents);
  }

  public async fromFolder(source: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromFolder');

    // make a tmp copy of this fiddle
    const folder = path.join(this.fiddles, hashString(source));
    d({ source, folder });
    await fs.remove(folder);

    // Disable asar in case any deps bundle Electron - ex. @electron/remote
    const { noAsar } = process;
    process.noAsar = true;
    await fs.copy(source, folder);
    process.noAsar = noAsar;

    return new Fiddle(path.join(folder, 'main.js'), source);
  }

  public async fromRepo(url: string) {
    const d = debug('fiddle-core:FiddleFactory:fromRepo');
    const match = this.GITHUB_URL_REGEX.exec(url);
    if (match === null) {
      throw new Error(`Invalid github URL`);
    }
    // This has to be done because octokit expects an owner and repo
    // params to be passed instead of just HTTPs/SSH git link.
    const owner = match[4];
    const repo = match[5];
    const repoContents: [string, string][] = [];

    d({ url, owner, repo });
    const octokit = getOctokit(process.env.FIDDLE_CORE_GITHUB_TOKEN);
    const folder = await octokit.repos.getContent({
      owner,
      repo,
      path: '.', // Look for in the base directory only
    });

    if (!Array.isArray(folder.data)) {
      return;
    }

    for (const file of folder.data) {
      if (!this.VALID_FILES.includes(file.name)) {
        continue;
      }

      if (file.download_url) {
        const resp = await fetch(file.download_url);
        const content = await resp.text();
        repoContents.push([file.name, content]);
      }
    }

    return this.fromEntries(repoContents);
  }

  public async fromEntries(src: Iterable<[string, string]>): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromEntries');
    const map = new Map<string, string>(src);

    // make a name for the directory that will hold our temp copy of the fiddle
    const md5sum = createHash('md5');
    for (const content of map.values()) md5sum.update(content);
    const hash = md5sum.digest('hex');
    const folder = path.join(this.fiddles, hash);
    d({ folder });

    // save content to that temp directory
    await Promise.all(
      [...map.entries()].map(([filename, content]) =>
        fs.outputFile(path.join(folder, filename), content, 'utf8'),
      ),
    );

    return new Fiddle(path.join(folder, 'main.js'), 'entries');
  }

  public async create(src: FiddleSource): Promise<Fiddle | undefined> {
    if (src instanceof Fiddle) return src;

    if (typeof src === 'string') {
      if (fs.existsSync(src)) return this.fromFolder(src);
      if (/^[0-9A-Fa-f]{32}$/.test(src)) return this.fromGist(src);
      if (/^https:/.test(src) || /\.git$/.test(src)) return this.fromRepo(src);
      return;
    }

    return this.fromEntries(src);
  }
}
