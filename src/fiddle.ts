import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import simpleGit from 'simple-git';
import { createHash } from 'crypto';
import { URL } from 'url';

import { DefaultPaths } from './paths';

function hashString(str: string): string {
  const md5sum = createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
}

export interface Fiddle {
  readonly mainPath: string;
  readonly source: string;
}

export class FiddleFactory {
  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

  public async fromGist(gistId: string): Promise<Fiddle> {
    return this.fromRepo(`https://gist.github.com/${gistId}.git`);
  }

  public async fromFolder(sourceFolder: string): Promise<Fiddle> {
    const d = debug('fiddle-runner:FiddleFactory:fromFolder');

    // make a tmp copy of this fiddle
    const folder = path.join(this.fiddles, hashString(sourceFolder));
    d({ sourceFolder, folder });
    await fs.remove(folder);
    await fs.copy(sourceFolder, folder);

    return {
      mainPath: path.join(folder, 'main.js'),
      source: sourceFolder,
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
}
