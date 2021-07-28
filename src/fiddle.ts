import * as fs from 'fs-extra';
import * as path from 'path';
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
    public readonly mainPath: string,
    public readonly source: string,
  ) {}
}

export type FiddleSource = Fiddle | string | Map<string, string>;

export class FiddleFactory {
  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

  public async fromGist(gistId: string): Promise<Fiddle> {
    return this.fromRepo(`https://gist.github.com/${gistId}.git`);
  }

  public async fromFolder(source: string): Promise<Fiddle> {
    const d = debug('fiddle-runner:FiddleFactory:fromFolder');

    // make a tmp copy of this fiddle
    const folder = path.join(this.fiddles, hashString(source));
    d({ source, folder });
    await fs.remove(folder);
    await fs.copy(source, folder);

    return {
      mainPath: path.join(folder, 'main.js'),
      source,
    };
  }

  public async fromRepo(url: string, checkout = 'master'): Promise<Fiddle> {
    const d = debug('fiddle-runner:FiddleFactory:fromRepo');
    const folder = path.join(this.fiddles, hashString(url));
    d({ url, checkout, folder });

    // get the repo
    if (!fs.existsSync(folder)) {
      d(`cloning "${url}" into "${folder}"`);
      const git = simpleGit();
      await git.clone(url, folder);
    }

    const git = simpleGit(folder);
    await git.checkout(checkout);
    await git.pull('origin', checkout);

    return {
      mainPath: path.join(folder, 'main.js'),
      source: url,
    };
  }

  public async create(source: FiddleSource): Promise<Fiddle | undefined> {
    if (source instanceof Fiddle) {
      return source;
    }

    if (source instanceof Map) {
      return this.fromMem(source);
    }
    if (fs.existsSync(source)) {
      return this.fromFolder(source);
    }
    if (source.startsWith('https://') || source.endsWith('.git')) {
      return this.fromRepo(source);
    }
    if (/^[0-9A-Fa-f]{32}$/.test(source)) {
      return this.fromGist(source);
    }
  }

  public async fromMem(source: Map<string, string>): Promise<Fiddle> {
    const d = debug('fiddle-runner:FiddleFactory:fromMem');

    // make a tmp copy of this fiddle
    const hash = hashString([...source.keys()].join(','));
    const folder = path.join(this.fiddles, hash);
    d({ folder });

    const promises: Promise<void>[] = [];
    for (const [filename, content] of source.entries()) {
      promises.push(fs.outputFile(filename, content, 'utf8'));
    }
    await Promise.all(promises);

    return {
      mainPath: path.join(folder, 'main.js'),
      source: 'memory',
    };
  }
}
