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
    public readonly mainPath: string, // /path/to/main.js or /path/to/fiddle.asar
    public readonly source: string,
  ) {}

  public remove(): Promise<void> {
    return fs.remove(path.dirname(this.mainPath));
  }
}

export type FiddleSource = Fiddle | string | Iterable<[string, string]>;

export class FiddleFactory {
  constructor(
    private readonly fiddles: string = DefaultPaths.fiddles,
    private readonly packAsAsar: boolean = false, // New option for ASAR support
  ) {}

  public async fromFolder(source: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromFolder');

    // Make a temporary copy of this Fiddle
    const folder = path.join(this.fiddles, hashString(source));
    d({ source, folder });
    await fs.remove(folder);

    // Disable asar temporarily
    const { noAsar } = process;
    process.noAsar = true;
    await fs.copy(source, folder);
    process.noAsar = noAsar;

    if (this.packAsAsar) {
      const asarPath = `${folder}.asar`;
      await asar.createPackage(folder, asarPath);
      await fs.remove(folder); // Remove original folder after packaging
      return new Fiddle(asarPath, source);
    }

    return new Fiddle(path.join(folder, 'main.js'), source);
  }

  public async fromRepo(url: string, checkout = 'master'): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromRepo');
    const folder = path.join(this.fiddles, hashString(url));
    d({ url, checkout, folder });

    // Get the repo
    if (!fs.existsSync(folder)) {
      d(`cloning "${url}" into "${folder}"`);
      const git = simpleGit();
      await git.clone(url, folder, { '--depth': 1 });
    }

    const git = simpleGit(folder);
    await git.checkout(checkout);
    await git.pull('origin', checkout);

    return this.packAsAsar
      ? this.fromFolder(folder) // Convert repo into ASAR if enabled
      : new Fiddle(path.join(folder, 'main.js'), url);
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
