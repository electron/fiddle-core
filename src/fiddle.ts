import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import simpleGit from 'simple-git';
import { createHash } from 'crypto';
import { DefaultPaths } from './paths';
import * as asar from '@electron/asar';

function hashString(str: string): string {
  const md5sum = createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
}

export class Fiddle {
  constructor(
    public readonly mainPath: string, // /path/to/main.js
    public readonly source: string,
    public readonly isAsar: boolean = false,
  ) {}

  public remove(): Promise<void> {
    return fs.remove(path.dirname(this.mainPath));
  }
}

export type FiddleSource = Fiddle | string | Iterable<[string, string]>;

export interface FiddleFactoryOptions {
  /**
   * Pack the fiddle into an ASAR archive
   */
  packAsAsar?: boolean;
}

export class FiddleFactory {
  private readonly packAsAsar: boolean;
  private readonly d = debug('fiddle-core:FiddleFactory');
  
  constructor(
    private readonly fiddles: string = DefaultPaths.fiddles,
    options: FiddleFactoryOptions = {}
  ) {
    this.packAsAsar = !!options.packAsAsar;
  }

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
    
    if (this.packAsAsar) {
      return this.packFolderIntoAsar(folder, source);
    }
    
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
    
    if (this.packAsAsar) {
      return this.packFolderIntoAsar(folder, url);
    }
    
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
    
    if (this.packAsAsar) {
      return this.packFolderIntoAsar(folder, 'entries');
    }
    
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
  
  /**
   * Package a folder into an ASAR archive
   * @param sourceFolder The folder to package
   * @param source Original source identifier
   * @returns A Fiddle instance pointing to the ASAR file
   */
  private async packFolderIntoAsar(sourceFolder: string, source: string): Promise<Fiddle> {
    const d = debug('fiddle-core:FiddleFactory:packFolderIntoAsar');
    const asarFilePath = path.join(this.fiddles, hashString(sourceFolder) + '.asar');
    
    // Create parent directory if it doesn't exist
    const parentDir = path.dirname(asarFilePath);
    if (!fs.existsSync(parentDir)) {
      await fs.mkdirp(parentDir);
    }
    
    // Remove any existing ASAR file
    if (fs.existsSync(asarFilePath)) {
      await fs.remove(asarFilePath);
    }
    
    d(`Packaging "${sourceFolder}" into ASAR: "${asarFilePath}"`);
    
    // Package the folder into an ASAR archive
    await asar.createPackage(sourceFolder, asarFilePath);
    
    // Remove the original folder now that we have the ASAR
    await fs.remove(sourceFolder);
    
    // The mainPath needs to include the 'app.asar' part of the path
    // for Electron to correctly resolve paths inside the ASAR
    return new Fiddle(path.join(asarFilePath, 'main.js'), source, true);
  }
}