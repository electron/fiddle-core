import * as fs from 'fs-extra';
import * as path from 'path';
import * as asar from '@electron/asar';
import debug from 'debug';
import simpleGit from 'simple-git';
import { createHash } from 'crypto';

import { DefaultPaths } from './paths';

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
  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

  public async fromGist(gistId: string): Promise<Fiddle> {
    return this.fromRepo(`https://gist.github.com/${gistId}.git`);
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

  public async fromRepo(url: string, checkout = 'master'): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromRepo');
    const folder = path.join(this.fiddles, hashString(url));
    d({ url, checkout, folder });

    // get the repo
    if (!fs.existsSync(folder)) {
      d(`cloning "${url}" into "${folder}"`);
      const git = simpleGit();
      await git.clone(url, folder, { '--depth': 1 });
    }

    const git = simpleGit(folder);
    await git.checkout(checkout);
    await git.pull('origin', checkout);

    return new Fiddle(path.join(folder, 'main.js'), url);
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

  public async create(
    src: FiddleSource,
    options?: { packAsAsar?: boolean },
  ): Promise<Fiddle | undefined> {
    let fiddle: Fiddle;
    if (src instanceof Fiddle) {
      fiddle = src;
    } else if (typeof src === 'string') {
      if (fs.existsSync(src)) {
        fiddle = await this.fromFolder(src);
      } else if (/^[0-9A-Fa-f]{32}$/.test(src)) {
        fiddle = await this.fromGist(src);
      } else if (/^https:/.test(src) || /\.git$/.test(src)) {
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
    const mainJsPath = fiddle.mainPath;
    const sourceDir = path.dirname(mainJsPath);
    const asarOutputDir = path.join(this.fiddles, hashString(sourceDir));
    const asarFilePath = path.join(asarOutputDir, 'app.asar');

    await asar.createPackage(sourceDir, asarFilePath);
    fiddle = new Fiddle(asarFilePath, fiddle.source);

    try {
      await fs.remove(sourceDir);
    } catch (err) {
      console.log('Error deleting unpacked folder:', err);
    }
    return fiddle;
  }
}
