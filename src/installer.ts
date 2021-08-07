import * as fs from 'fs-extra';
import * as path from 'path';
import debug from 'debug';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
import { download as electronDownload } from '@electron/get';
import { inspect } from 'util';

import { DefaultPaths, Paths } from './paths';

function getZipName(version: string): string {
  return `electron-v${version}-${process.platform}-${process.arch}.zip`;
}

type ProgressObject = { percent: number };

/**
 * The state of a current Electron version.
 * See {@link Installer.state} to get this value.
 * See Installer.on('state-changed') to watch for state changes.
 */
export type InstallState =
  | 'missing'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed';

export interface InstallStateEvent {
  version: string;
  state: InstallState;
}

/**
 * Manage downloading and installing Electron versions.
 *
 * An Electron release's .zip is downloaded into `paths.electronDownloads`,
 * which holds all the downloaded zips.
 *
 * The installed version is unzipped into `paths.electronInstall`. Only one 
 * version is installed at a time -- installing a new version overwrites the
 * current one in `paths.electronInstall`.
 *
 * See {@link DefaultPaths} for the default paths.
 */
export class Installer extends EventEmitter {
  private readonly paths: Paths;
  private readonly stateMap = new Map<string, InstallState>();

  constructor(pathsIn: Partial<Paths> = {}) {
    super();
    this.paths = Object.freeze({ ...DefaultPaths, ...pathsIn });
    this.rebuildStates();
  }

  public static execSubpath(platform: string = process.platform): string {
    switch (platform) {
      case 'darwin':
        return 'Electron.app/Contents/MacOS/Electron';
      case 'win32':
        return 'electron.exe';
      default:
        return 'electron';
    }
  }

  public static getExecPath(folder: string): string {
    return path.join(folder, Installer.execSubpath());
  }

  public state(version: string): InstallState {
    return this.stateMap.get(version) || 'missing';
  }

  private setState(version: string, state: InstallState) {
    const d = debug('fiddle-core:Installer:setState');
    const oldState = this.state(version);

    if (state === 'missing') {
      this.stateMap.delete(version);
    } else {
      this.stateMap.set(version, state);
    }

    const newState = this.state(version);
    d(inspect({ version, oldState, newState }));
    if (oldState !== newState) {
      const event: InstallStateEvent = { version, state: newState };
      d('emitting state-changed', inspect(event));
      this.emit('state-changed', event);
    }
  }

  private rebuildStates() {
    this.stateMap.clear();

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
    try {
      for (const file of fs.readdirSync(this.paths.electronDownloads)) {
        const match = reg.exec(file);
        if (match) this.setState(match[1], 'downloaded');
      }
    } catch {
      // no donwnload directory yet
    }

    // being downloaded now...
    for (const version of this.downloading.keys()) {
      this.setState(version, 'downloading');
    }
  }

  /** Removes an Electron download or Electron install from the disk. */
  public async remove(version: string): Promise<void> {
    const d = debug('fiddle-core:Installer:remove');
    d(version);
    // remove the zipfile
    const zip = path.join(this.paths.electronDownloads, getZipName(version));
    await fs.remove(zip);

    // maybe uninstall it
    if (this.installedVersion === version)
      await fs.remove(this.paths.electronInstall);

    this.setState(version, 'missing');
  }

  /** The current Electron installation, if any. */
  public get installedVersion(): string | undefined {
    for (const [version, state] of this.stateMap)
      if (state === 'installed') return version;
  }

  private async download(version: string): Promise<string> {
    let pctDone = 0;
    const getProgressCallback = (progress: ProgressObject) => {
      const pct = Math.round(progress.percent * 100);
      if (pctDone + 10 <= pct) {
        const emoji = pct >= 100 ? '🏁' : '⏳';
        // FIXME(anyone): is there a better place than console.log for this?
        console.log(`${emoji} downloading ${version} - ${pct}%`);
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

  private async ensureDownloadedImpl(version: string): Promise<string> {
    const d = debug(`fiddle-core:Installer:${version}:ensureDownloadedImpl`);
    const { electronDownloads } = this.paths;
    const zipFile = path.join(electronDownloads, getZipName(version));

    const state = this.state(version);
    if (state === 'missing') {
      d(`"${zipFile}" does not exist; downloading now`);
      this.setState(version, 'downloading');
      const tempFile = await this.download(version);
      await fs.ensureDir(electronDownloads);
      await fs.move(tempFile, zipFile);
      this.setState(version, 'downloaded');
      d(`"${zipFile}" downloaded`);
    } else {
      d(`"${zipFile}" exists; no need to download`);
    }

    return zipFile;
  }

  /** map of version string to currently-running active Promise */
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

  /** the currently-installing version, if any */
  private installing: string | undefined;

  public async install(version: string): Promise<string> {
    const d = debug(`fiddle-core:Installer:${version}:install`);
    const { electronInstall } = this.paths;
    const electronExec = Installer.getExecPath(electronInstall);

    if (this.installing) throw new Error(`Currently installing "${version}"`);
    this.installing = version;

    // see if the current version (if any) is already `version`
    const { installedVersion } = this;
    if (installedVersion === version) {
      d(`already installed`);
    } else {
      const zipFile = await this.ensureDownloaded(version);
      this.setState(version, 'installing');
      d(`installing from "${zipFile}"`);
      await fs.emptyDir(electronInstall);
      // FIXME(anyone) is there a less awful way to wrangle asar
      // @ts-ignore: yes, I know noAsar isn't defined in process
      const { noAsar } = process;
      try {
        // @ts-ignore: yes, I know noAsar isn't defined in process
        process.noAsar = true;
        await extract(zipFile, { dir: electronInstall });
      } finally {
        // @ts-ignore: yes, I know noAsar isn't defined in process
        process.noAsar = noAsar; // eslint-disable-line
      }
      if (installedVersion) this.setState(installedVersion, 'downloaded');
      this.setState(version, 'installed');
    }

    delete this.installing;

    // return the full path to the electron executable
    d(inspect({ electronExec, version }));
    return electronExec;
  }
}
