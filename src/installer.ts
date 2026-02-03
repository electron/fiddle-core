import { EventEmitter } from 'node:events';
import path from 'node:path';
import util, { inspect } from 'node:util';

import fs from 'graceful-fs';
import semver from 'semver';
import debug from 'debug';
import extract from 'extract-zip';
import { download as electronDownload } from '@electron/get';

import { DefaultPaths, Paths } from './paths.js';

function getZipName(version: string): string {
  return `electron-v${version}-${process.platform}-${process.arch}.zip`;
}
/** Tracks installation progress as a percentage. */
export type ProgressObject = { percent: number };

/**
 * The state of a current Electron version.
 * See {@link Installer.state} to get this value.
 * See Installer.on('state-changed') to watch for state changes.
 */
export enum InstallState {
  /** No installation detected. */
  missing = 'missing',

  /** Files are being downloaded. */
  downloading = 'downloading',

  /** Download completed successfully. */
  downloaded = 'downloaded',

  /** Installation process is in progress. */
  installing = 'installing',

  /** Installation completed successfully. */
  installed = 'installed',
}
/** 
 * Event emitted when an installation state changes for a specific Electron version.
 */
export interface InstallStateEvent {
  /** Version identifier for the installation. */
  version: string;
  /** Current installation state. */
  state: InstallState;
}
/** 
 * URLs for Electron mirrors used during downloads. 
 */
export interface Mirrors {
   /** Base URL for the Electron mirror. */
  electronMirror: string;
  /** Base URL for the Electron nightly mirror. */
  electronNightlyMirror: string;
}
/** 
 * Configuration details for an Electron binary. 
 */
export interface ElectronBinary {
  /** Local path to the Electron binary. */
  path: string;
  /** Whether the binary has already been extracted. */
  alreadyExtracted: boolean;
}
/** 
 * Parameters used when running an installer. 
 */
export interface InstallerParams {
    /** Callback invoked to report installation progress. */
  progressCallback: (progress: ProgressObject) => void;
  /** Mirror sources used for downloading. */
  mirror: Mirrors;
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
 /** 
 * Returns the relative executable path based on the current platform.
 * @param platform - Optional platform identifier; defaults to the host platform.
 */
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
 /** 
 * Resolves the full path to the Electron executable within a given folder.
 * @param folder - Path to the Electron version folder.
 */
  public static getExecPath(folder: string): string {
    return path.join(folder, Installer.execSubpath());
  }
 /** 
 * Returns the current installation state for a given Electron version.
 * @param version - Version identifier to check.
 */
  public state(version: string): InstallState {
    return this.stateMap.get(version) || InstallState.missing;
  }

  private setState(version: string, state: InstallState) {
    const d = debug('fiddle-core:Installer:setState');
    const oldState = this.state(version);

    if (state === InstallState.missing) {
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
      const version = fs.readFileSync(versionFile, 'utf8').trim();
      this.setState(version, InstallState.installed);
    } catch {
      // no current version
    }

    this.installing.forEach((version) => {
      this.setState(version, InstallState.installing);
    });

    // already downloaded...
    const str = `^electron-v(.*)-${process.platform}-${process.arch}.zip$`;
    const reg = new RegExp(str);
    try {
      for (const file of fs.readdirSync(this.paths.electronDownloads)) {
        const match = reg.exec(file);
        if (match) {
          this.setState(match[1], InstallState.downloaded);
        } else {
          // Case when the download path already has the unzipped electron version
          const versionFile = path.join(
            this.paths.electronDownloads,
            file,
            'version',
          );

          if (fs.existsSync(versionFile)) {
            const version = fs.readFileSync(versionFile, 'utf8').trim();
            if (semver.valid(version)) {
              this.setState(version, InstallState.downloaded);
            }
          }
        }
      }
    } catch {
      // no download directory yet
    }

    // being downloaded now...
    for (const version of this.downloading.keys()) {
      this.setState(version, InstallState.downloading);
    }
  }

  /** Removes an Electron download or Electron install from the disk. */
  public async remove(version: string): Promise<void> {
    const d = debug('fiddle-core:Installer:remove');
    d(version);
    let isBinaryDeleted = false;
    // utility to re-run removal functions upon failure
    // due to windows filesystem lockfile jank
    const rerunner = async (
      path: string,
      func: (path: string) => void,
      counter = 1,
    ): Promise<boolean> => {
      try {
        func(path);
        return true;
      } catch (error) {
        console.warn(
          `Installer: failed to run ${func.name} for ${version}, but failed`,
          error,
        );
        if (counter < 4) {
          console.log(`Installer: Trying again to run ${func.name}`);
          await rerunner(path, func, counter + 1);
        }
      }
      return false;
    };

    const binaryCleaner = (path: string) => {
      if (fs.existsSync(path)) {
        const { noAsar } = process;
        try {
          process.noAsar = true;
          fs.rmSync(path, { recursive: true, force: true });
        } finally {
          process.noAsar = noAsar;
        }
      }
    };
    // get the zip path
    const zipPath = path.join(
      this.paths.electronDownloads,
      getZipName(version),
    );
    // Or, maybe the version was already installed and kept in file system
    const preInstalledPath = path.join(this.paths.electronDownloads, version);

    const isZipDeleted = await rerunner(zipPath, binaryCleaner);
    const isPathDeleted = await rerunner(preInstalledPath, binaryCleaner);

    // maybe uninstall it
    if (this.installedVersion === version) {
      isBinaryDeleted = await rerunner(
        this.paths.electronInstall,
        binaryCleaner,
      );
    } else {
      // If the current version binary doesn't exists
      isBinaryDeleted = true;
    }

    if ((isZipDeleted || isPathDeleted) && isBinaryDeleted) {
      this.setState(version, InstallState.missing);
    } else {
      // Ideally the execution shouldn't reach this point
      console.warn(`Installer: Failed to remove version ${version}`);
    }
  }

  /** The current Electron installation, if any. */
  public get installedVersion(): string | undefined {
    for (const [version, state] of this.stateMap)
      if (state === InstallState.installed) return version;
  }

  private async download(
    version: string,
    opts?: Partial<InstallerParams>,
  ): Promise<string> {
    let pctDone = 0;
    const getProgressCallback = (progress: ProgressObject) => {
      if (opts?.progressCallback) {
        // Call the user passed callback function
        opts.progressCallback(progress);
      }
      const pct = Math.round(progress.percent * 100);
      if (pctDone + 10 <= pct) {
        const emoji = pct >= 100 ? '🏁' : '⏳';
        // FIXME(anyone): is there a better place than console.log for this?
        console.log(`${emoji} downloading ${version} - ${pct}%`);
        pctDone = pct;
      }
    };
    const zipFile = await electronDownload(version, {
      mirrorOptions: {
        mirror: opts?.mirror?.electronMirror,
        nightlyMirror: opts?.mirror?.electronNightlyMirror,
      },
      downloadOptions: {
        quiet: true,
        getProgressCallback,
      },
    });
    return zipFile;
  }

  private async ensureDownloadedImpl(
    version: string,
    opts?: Partial<InstallerParams>,
  ): Promise<ElectronBinary> {
    const d = debug(`fiddle-core:Installer:${version}:ensureDownloadedImpl`);
    const { electronDownloads } = this.paths;
    const zipFile = path.join(electronDownloads, getZipName(version));
    const zipFileExists = fs.existsSync(zipFile);

    const state = this.state(version);

    if (state === InstallState.downloaded) {
      const preInstalledPath = path.join(electronDownloads, version);
      if (!zipFileExists && fs.existsSync(preInstalledPath)) {
        return {
          path: preInstalledPath,
          alreadyExtracted: true,
        };
      }
    }

    if (state === InstallState.missing || !zipFileExists) {
      d(`"${zipFile}" does not exist; downloading now`);
      this.setState(version, InstallState.downloading);
      try {
        const tempFile = await this.download(version, opts);
        await fs.promises.mkdir(electronDownloads, { recursive: true });
        try {
          await fs.promises.rename(tempFile, zipFile);
        } catch (err) {
          // cross-device move not permitted, fallback to copy
          if (err instanceof Error && 'code' in err && err.code === 'EXDEV') {
            await util.promisify(fs.copyFile)(tempFile, zipFile);
            await fs.promises.rm(tempFile);
          } else {
            throw err;
          }
        }
      } catch (err) {
        this.setState(version, InstallState.missing);
        throw err;
      }
      this.setState(version, InstallState.downloaded);
      d(`"${zipFile}" downloaded`);
    } else {
      d(`"${zipFile}" exists; no need to download`);
    }

    return {
      path: zipFile,
      alreadyExtracted: false,
    };
  }

 /** 
 * Tracks versions currently being downloaded, mapped to their active Promise.
 */
  private downloading = new Map<string, Promise<ElectronBinary>>();
 /** 
 * Ensures that the specified version of Electron is downloaded and ready for installation.
 * @param version - Electron version to download.
 * @param opts - Optional parameters such as progress callbacks or mirror configuration.
 */
  public async ensureDownloaded(
    version: string,
    opts?: Partial<InstallerParams>,
  ): Promise<ElectronBinary> {
    const { downloading: promises } = this;
    let promise = promises.get(version);
    if (promise) return promise;

    promise = this.ensureDownloadedImpl(version, opts).finally(() =>
      promises.delete(version),
    );
    promises.set(version, promise);
    return promise;
  }

 /** 
 * Tracks all versions currently undergoing installation.
 */
  private installing = new Set<string>();
 /** 
 * Installs the specified Electron version after download.
 * @param version - Electron version to install.
 * @param opts - Optional installer configuration.
 */
  public async install(
    version: string,
    opts?: Partial<InstallerParams>,
  ): Promise<string> {
    const d = debug(`fiddle-core:Installer:${version}:install`);
    const { electronInstall } = this.paths;
    const isVersionInstalling = this.installing.has(version);
    const electronExec = Installer.getExecPath(electronInstall);

    if (isVersionInstalling) {
      throw new Error(`Currently installing "${version}"`);
    }

    this.installing.add(version);

    try {
      // see if the current version (if any) is already `version`
      const { installedVersion } = this;
      if (installedVersion === version) {
        d(`already installed`);
      } else {
        const { path: source, alreadyExtracted } = await this.ensureDownloaded(
          version,
          opts,
        );

        // An unzipped version already exists at `electronDownload` path
        if (alreadyExtracted) {
          await this.installVersionImpl(version, source, async () => {
            // Simply copy over the files from preinstalled version to `electronInstall`
            const { noAsar } = process;
            process.noAsar = true;
            try {
              await fs.promises.cp(source, electronInstall, {
                recursive: true,
              });
            } finally {
              process.noAsar = noAsar;
            }
          });
        } else {
          await this.installVersionImpl(version, source, async () => {
            // FIXME(anyone) is there a less awful way to wrangle asar
            const { noAsar } = process;
            try {
              process.noAsar = true;
              await extract(source, { dir: electronInstall });
            } finally {
              process.noAsar = noAsar;
            }
          });
        }
      }
    } finally {
      this.installing.delete(version);
    }

    // return the full path to the electron executable
    d(inspect({ electronExec, version }));
    return electronExec;
  }

  private async installVersionImpl(
    version: string,
    source: string,
    installCallback: () => Promise<void> | void,
  ): Promise<void> {
    const {
      paths: { electronInstall },
      installedVersion,
    } = this;
    const d = debug(`fiddle-core:Installer:${version}:install`);

    const originalState = this.state(version);
    this.setState(version, InstallState.installing);
    try {
      d(`installing from "${source}"`);
      const { noAsar } = process;
      try {
        process.noAsar = true;
        await fs.promises.rm(electronInstall, {
          recursive: true,
          force: true,
        });
      } finally {
        process.noAsar = noAsar;
      }

      // Call the user defined callback which unzips/copies files content
      if (installCallback) {
        await installCallback();
      }
    } catch (err) {
      this.setState(version, originalState);
      throw err;
    }

    if (installedVersion) {
      this.setState(installedVersion, InstallState.downloaded);
    }
    this.setState(version, InstallState.installed);
  }
}
