import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
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

export type InstallState =
  | 'not-downloaded'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed';

/**
 * Manage downloading and installation of Electron versions for use with Runner.
 */
export class Electron extends EventEmitter {
  private readonly paths: Paths;
  private readonly states = new Map<string, InstallState>();

  constructor(pathsIn: Partial<Paths> = {}) {
    super();
    this.paths = Object.freeze({ ...DefaultPaths, ...pathsIn });
    this.rebuildStates();
  }

  private setState(version: string, state: InstallState) {
    this.states.set(version, state);
    this.emit(state, version);
  }

  private rebuildStates() {
    this.states.clear();

    // currently installed...
    try {
      const versionFile = path.join(this.paths.electronInstall, 'version');
      const version = fs.readFileSync(versionFile, 'utf8');
      this.setState(version, 'installed');
    } catch {
      // no current version
    }

    if (this.installing) {
      this.setState(this.installing, 'installing');
    }

    // already downloaded...
    const str = `^electron-v(.*)-${process.platform}-${process.arch}.zip$`;
    const reg = new RegExp(str);
    for (const file of fs.readdirSync(this.paths.electronDownloads)) {
      const match = reg.exec(file);
      if (match) this.setState(match[1], 'downloaded');
    }

    // being downloaded now...
    for (const version of this.downloading.keys()) {
      this.setState(version, 'downloading');
    }
  }

  public async remove(version: string): Promise<void> {
    const zip = path.join(this.paths.electronDownloads, getZipName(version));
    await fs.remove(zip);
    this.states.delete(version);
    this.emit('not-downloaded', version);
  }

  public get installedVersion(): string | undefined {
    for (const [version, state] of this.states)
      if (state === 'installed') return version;
  }

  public isDownloaded(version: string): boolean {
    const state = this.states.get(version);
    return (
      state === 'downloaded' || state === 'installing' || state === 'installed'
    );
  }

  private async download(version: string): Promise<string> {
    let pctDone = 0;
    const getProgressCallback = (progress: ProgressObject) => {
      const pct = Math.round(progress.percent * 100);
      if (pctDone + 10 <= pct) {
        console.log(`${pct >= 100 ? '🏁' : '⏳'} dl ${version} - ${pct}%`);
        pctDone = pct;
      }
    };
    const zipFile = await electronDownload(version, {
      downloadOptions: {
        quiet: true,
        getProgressCallback,
      },
    });
    return zipFile;
  }

  public async ensureDownloadedImpl(version: string): Promise<string> {
    const d = debug(`fiddle-runner:Electron:${version}:ensureDownloaded`);

    const zipFile = path.join(
      this.paths.electronDownloads,
      getZipName(version),
    );
    if (this.isDownloaded(version)) {
      d(`"${zipFile}" exists; no need to download`);
    } else {
      this.setState(version, 'downloading');
      d(`"${zipFile}" does not exist; downloading now`);
      const tempFile = await this.download(version);
      await fs.ensureDir(this.paths.electronDownloads);
      await fs.move(tempFile, zipFile);
      this.setState(version, 'downloaded');
      this.emit('downloaded', version, zipFile);
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

  private installing: string | undefined;

  public async install(version: string): Promise<string> {
    const d = debug(`fiddle-runner:Electron:${version}:installImpl`);
    const { electronInstall } = this.paths;
    const electronExec = path.join(electronInstall, execSubpath());

    if (this.installing) throw new Error(`Currently installing "${version}"`);
    this.installing = version;

    // see if the current version (if any) is already `version`
    if (this.installedVersion === version) {
      d(`already installed`);
    } else {
      const zipFile = await this.ensureDownloaded(version);
      d(`installing from "${zipFile}"`);
      await fs.emptyDir(electronInstall);
      await extract(zipFile, { dir: electronInstall });
      this.setState(version, 'installed');
      this.emit('installed', version, electronExec);
    }

    delete this.installing;

    // return the full path to the electron executable
    d(inspect({ electronExec, version }));
    return electronExec;
  }

  public state(version: string): InstallState {
    return this.states.get(version) || 'not-downloaded';
  }
}
