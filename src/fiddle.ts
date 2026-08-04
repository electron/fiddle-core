import { createHash } from 'node:crypto';
import path from 'node:path';
import util from 'node:util';

import { createPackage } from '@electron/asar';
import fs from 'graceful-fs';
import debug from 'debug';

import { DefaultPaths } from './paths.js';
import { getOctokit } from './octokit.js';

function hashString(str: string): string {
  const md5sum = createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
}

/**
 * Parses an `owner` and `repo` out of a GitHub repository URL. Supports the
 * common HTTPS and SSH forms, with or without a trailing `.git`. Returns
 * `undefined` if the URL isn't a recognizable GitHub repository URL.
 */
function parseRepoUrl(url: string): { owner: string; repo: string } | undefined {
  // https://github.com/owner/repo(.git), git@github.com:owner/repo(.git)
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (match === null) return undefined;
  return { owner: match[1], repo: match[2] };
}

/**
 * Parses a gist ID out of a gist URL. Supports forms like
 * `https://gist.github.com/<id>(.git)` and
 * `https://gist.github.com/<user>/<id>(.git)`. Returns `undefined` if the URL
 * isn't a gist URL.
 */
function parseGistUrl(url: string): string | undefined {
  const match = /gist\.github\.com\/(?:[^/]+\/)?([0-9A-Fa-f]+)(?:\.git)?\/?$/.exec(url);
  if (match === null) return undefined;
  return match[1];
}

export class Fiddle {
  constructor(
    public readonly mainPath: string, // /path/to/main.js
    public readonly source: string,
  ) {}

  public remove(): Promise<void> {
    return fs.promises.rm(path.dirname(this.mainPath), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * - Iterable of [string, string] - filename-to-content key/value pairs
 * - string of form '/path/to/fiddle' - a fiddle on the filesystem
 * - string of form 'https://github.com/my/repo.git' - a git repo fiddle
 * - string of form '642fa8daaebea6044c9079e3f8a46390' - a github gist fiddle
 */
export type FiddleSource = Fiddle | string | Iterable<[string, string]>;

export interface FiddleFactoryCreateOptions {
  packAsAsar?: boolean;
}

export class FiddleFactory {
  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

  public async fromGist(gistId: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromGist');
    d({ gistId });

    const octokit = getOctokit();
    const { data: gist } = await octokit.gists.get({ gist_id: gistId });

    const entries: [string, string][] = [];
    for (const file of Object.values(gist.files ?? {})) {
      if (file?.filename === undefined || file.content === undefined) continue;
      entries.push([file.filename, file.content]);
    }

    return this.fromEntries(entries, `https://gist.github.com/${gistId}.git`);
  }

  public async fromFolder(source: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromFolder');

    // make a tmp copy of this fiddle
    const folder = path.join(this.fiddles, hashString(source));
    d({ source, folder });
    await fs.promises.rm(folder, { recursive: true, force: true });

    // Disable asar in case any deps bundle Electron - ex. @electron/remote
    const { noAsar } = process;
    process.noAsar = true;
    await fs.promises.cp(source, folder, { recursive: true });
    process.noAsar = noAsar;

    return new Fiddle(path.join(folder, 'main.js'), source);
  }

  public async fromRepo(url: string, checkout?: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromRepo');

    // Gist URLs are loaded through the Gists API.
    const gistId = parseGistUrl(url);
    if (gistId !== undefined) {
      d({ url, gistId });
      return this.fromGist(gistId);
    }

    const parsed = parseRepoUrl(url);
    if (parsed === undefined) {
      throw new Error(`Invalid GitHub repository URL: "${url}"`);
    }
    const { owner, repo } = parsed;

    const octokit = getOctokit();

    // Resolve the branch/ref to load. When the caller doesn't specify one,
    // use the repository's actual default branch instead of assuming "master"
    // or "main".
    let ref = checkout;
    if (ref === undefined) {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      ref = repoData.default_branch;
    }
    d({ url, owner, repo, ref });

    // Fetch the list of files in the root of the repo at the given ref.
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: '',
      ref,
    });
    if (!Array.isArray(contents)) {
      throw new Error(`Expected a directory listing at the root of "${url}"`);
    }

    // Fetch the content of each file in the root of the repo.
    const entries = await Promise.all(
      contents
        .filter((entry) => entry.type === 'file')
        .map(async (entry): Promise<[string, string]> => {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: entry.path,
            ref,
          });
          if (Array.isArray(data) || data.type !== 'file') {
            throw new Error(`Expected a file at "${entry.path}"`);
          }
          const content = Buffer.from(data.content, data.encoding as BufferEncoding).toString(
            'utf8',
          );
          return [entry.name, content];
        }),
    );

    return this.fromEntries(entries, url);
  }

  public async fromEntries(src: Iterable<[string, string]>, source = 'entries'): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromEntries');
    const map = new Map<string, string>(src);

    // make a name for the directory that will hold our temp copy of the fiddle
    const md5sum = createHash('md5');
    for (const content of map.values()) md5sum.update(content);
    const hash = md5sum.digest('hex');
    const folder = path.resolve(this.fiddles, hash);
    await fs.promises.mkdir(folder, { recursive: true });
    d({ folder });

    // save content to that temp directory
    await Promise.all(
      [...map.entries()].map(([filename, content]) => {
        const filePath = path.resolve(folder, filename);
        const relative = path.relative(folder, filePath);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new Error(`Refusing to write file outside of fiddle: "${filename}"`);
        }
        return util.promisify(fs.writeFile)(filePath, content, 'utf8');
      }),
    );

    return new Fiddle(path.join(folder, 'main.js'), source);
  }

  public async create(
    src: FiddleSource,
    options?: FiddleFactoryCreateOptions,
  ): Promise<Fiddle | undefined> {
    let fiddle: Fiddle;
    if (src instanceof Fiddle) {
      fiddle = src;
    } else if (typeof src === 'string') {
      if (fs.existsSync(src)) {
        fiddle = await this.fromFolder(src);
      } else if (/^[0-9A-Fa-f]{32}$/.test(src)) {
        fiddle = await this.fromGist(src);
      } else if (src.startsWith('https:') || src.endsWith('.git')) {
        fiddle = await this.fromRepo(src);
      } else {
        return;
      }
    } else {
      fiddle = await this.fromEntries(src as Iterable<[string, string]>);
    }

    const { packAsAsar } = options || {};
    if (packAsAsar) {
      fiddle = await this.packageFiddleAsAsar(fiddle);
    }
    return fiddle;
  }

  private async packageFiddleAsAsar(fiddle: Fiddle): Promise<Fiddle> {
    const sourceDir = path.dirname(fiddle.mainPath);
    const asarOutputDir = path.join(this.fiddles, hashString(sourceDir));
    const asarFilePath = path.join(asarOutputDir, 'app.asar');

    await createPackage(sourceDir, asarFilePath);
    const packagedFiddle = new Fiddle(asarFilePath, fiddle.source);

    await fs.promises.rm(sourceDir, { recursive: true, force: true });
    return packagedFiddle;
  }
}
