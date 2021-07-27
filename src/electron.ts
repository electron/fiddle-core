import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import extract from 'extract-zip';
import { download as electronDownload } from '@electron/get';
import { inspect } from 'util';

import { DefaultPaths, Paths } from './paths';

export function execSubpath(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'win32':
      return 'electron.exe';
    default:
      return 'electron';
  }
}

function getZipName(version: string): string {
  return `electron-v${version}-${process.platform}-${process.arch}.zip`;
}

type ProgressObject = { percent: number };

export class Electron {
  private readonly paths: Paths;

  constructor(pathsIn: Partial<Paths> = {}) {
    this.paths = { ...DefaultPaths, ...pathsIn };
  }

  public async installed(): Promise<string | undefined> {
    try {
      const versionFile = path.join(this.paths.electronInstall, 'version');
      return await fs.readFile(versionFile, 'utf8');
    } catch {
      // no current version
    }
  }

  public isDownloaded(version: string): boolean {
    const zip = path.join(this.paths.electronDownloads, getZipName(version));
    return fs.existsSync(zip);
  }

  public async downloaded(): Promise<string[]> {
    const version = 'fnord';
    const test = getZipName(version);
    const prefix = test.substring(0, test.indexOf(version));
    const suffix = test.substring(test.indexOf(version) + version.length);

    const downloaded: string[] = [];
    for (const file of await fs.readdir(this.paths.electronDownloads)) {
      if (file.startsWith(prefix) && file.endsWith(suffix)) {
        downloaded.push(file.replace(prefix, '').replace(suffix, ''));
      }
    }

    return downloaded;
  }

  private async download(version: string): Promise<string> {
    const d = debug(`fiddle-runner:Electron:${version}:downloadElectron`);
    let pctDone = 0;
    const getProgressCallback = (progress: ProgressObject) => {
      const pct = Math.round(progress.percent * 100);
      if (pctDone + 10 <= pct) {
        d(`${pct >= 100 ? '🏁' : '⏳'} downloaded ${pct}%`);
        pctDone = pct;
      }
    };
    return await electronDownload(version, {
      downloadOptions: {
        quiet: true,
        getProgressCallback,
      },
    });
  }

  public async ensureDownloadedImpl(version: string): Promise<string> {
    const d = debug(`fiddle-runner:Electron:${version}:ensureDownloaded`);

    const zipFile = path.join(
      this.paths.electronDownloads,
      getZipName(version),
    );
    if (fs.existsSync(zipFile)) {
      d(`"${zipFile}" exists; no need to download`);
    } else {
      d(`"${zipFile}" does not exist; downloading now`);
      const tempFile = await this.download(version);
      await fs.ensureDir(this.paths.electronDownloads);
      await fs.move(tempFile, zipFile);
      d(`"${zipFile}" downloaded`);
    }

    return zipFile;
  }

  private downloading = new Map<string, Promise<string>>();

  public async ensureDownloaded(version: string): Promise<string> {
    const { downloading: promises } = this;
    let promise = promises.get(version);
    if (promise) return promise;

    promise = this.ensureDownloadedImpl(version).finally(() =>
      promises.delete(version),
    );
    promises.set(version, promise);
    return promise;
  }

  private installing: Promise<string> | undefined;

  private async installImpl(version: string): Promise<string> {
    const d = debug(`fiddle-runner:Electron:${version}:installImpl`);
    const { electronInstall } = this.paths;

    // see if the current version (if any) is already `version`
    const currentVersion = await this.installed();
    if (currentVersion === version) {
      d(`already installed`);
    } else {
      const zipFile = await this.ensureDownloaded(version);
      d(`installing from "${zipFile}"`);
      await fs.emptyDir(electronInstall);
      await extract(zipFile, { dir: electronInstall });
    }

    // return the full path to the electron executable
    const electronExec = path.join(electronInstall, execSubpath());
    d(inspect({ electronExec, version }));
    return electronExec;
  }

  public async install(version: string): Promise<string> {
    if (!this.installing) {
      this.installing = this.installImpl(version);
    } else {
      this.installing = this.installing.then(() => this.installImpl(version));
    }
    return this.installing;
  }
}
