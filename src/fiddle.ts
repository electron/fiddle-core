import { createHash } from 'node:crypto';
import path from 'node:path';
import util from 'node:util';

import { createPackage } from '@electron/asar';
import fs from 'graceful-fs';
import debug from 'debug';
import { simpleGit } from 'simple-git';

import { DefaultPaths } from './paths.js';

function hashString(str: string): string {
  const md5sum = createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
}
/** 
 * A Fiddle instance, containing a main entry file and its source content. 
 */
export class Fiddle {
  constructor(
     /** Path to the main entry script file (e.g., `/path/to/main.js`). */
    public readonly mainPath: string, 

     /** Source code for the Fiddle. */
    public readonly source: string,
  ) {}

    /** Deletes the Fiddle from the file system. */
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

/**
 * Factory class for creating Fiddle instances from different sources.
 */
export class FiddleFactory {
  constructor(private readonly fiddles: string = DefaultPaths.fiddles) {}

 /**
   * Creates a Fiddle by fetching a GitHub Gist and cloning it into a temporary directory.
   * @param gistId - The ID of the GitHub Gist to fetch.
   */
  public async fromGist(gistId: string): Promise<Fiddle> {
    return this.fromRepo(`https://gist.github.com/${gistId}.git`);
  }

   /**
   * Creates a Fiddle by making a temporary copy from the specified source folder.
   * @param source - The folder path containing the Fiddle source files.
   */
  public async fromFolder(source: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromFolder');

    const folder = path.join(this.fiddles, hashString(source));
    d({ source, folder });
    await fs.promises.rm(folder, { recursive: true, force: true });

    const { noAsar } = process;
    process.noAsar = true;
    await fs.promises.cp(source, folder, { recursive: true });
    process.noAsar = noAsar;

    return new Fiddle(path.join(folder, 'main.js'), source);
  }

 /**
 * Creates a Fiddle instance by cloning a Git repository into a temporary directory.
 * Optionally checks out a specific branch and determines the main file path
 * based on the cloned content.
 *
 * @param url - The Git repository URL to clone.
 * @param checkout - The branch to check out (default is 'master').
 * @returns A Promise that resolves to a Fiddle instance.
 */
  public async fromRepo(url: string, checkout = 'master'): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromRepo');
    const folder = path.join(this.fiddles, hashString(url));
    d({ url, checkout, folder });

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
 /**
 * Creates a Fiddle instance from an in-memory collection of files.
 * Each entry consists of a filename and its corresponding file content.
 * The files are saved to a temporary directory, and the main file path is set accordingly.
 *
 * @param src - An iterable of [filename, content] pairs.
 * @returns A Promise that resolves to a Fiddle instance.
 */
  public async fromEntries(src: Iterable<[string, string]>): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:fromEntries');
    const map = new Map<string, string>(src);

    const md5sum = createHash('md5');
    for (const content of map.values()) md5sum.update(content);
    const hash = md5sum.digest('hex');
    const folder = path.join(this.fiddles, hash);
    await fs.promises.mkdir(folder, { recursive: true });
    d({ folder });

    await Promise.all(
      [...map.entries()].map(([filename, content]) =>
        util.promisify(fs.writeFile)(
          path.join(folder, filename),
          content,
          'utf8',
        ),
      ),
    );

    return new Fiddle(path.join(folder, 'main.js'), 'entries');
  }

  /**
 * Determines the type of the provided source and delegates to the appropriate
 * method to create a Fiddle instance.
 *
 * @param src - The source used to create the Fiddle. Can be an existing Fiddle instance,
 *              a local folder path, a Git repository URL, or a collection of file entries.
 * @returns A Promise that resolves to a Fiddle instance or undefined if the source type is invalid.
 */
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
    const sourceDir = path.dirname(fiddle.mainPath);
    const asarOutputDir = path.join(this.fiddles, hashString(sourceDir));
    const asarFilePath = path.join(asarOutputDir, 'app.asar');

    await createPackage(sourceDir, asarFilePath);
    const packagedFiddle = new Fiddle(asarFilePath, fiddle.source);

    await fs.promises.rm(sourceDir, { recursive: true, force: true });
    return packagedFiddle;
  }
}
