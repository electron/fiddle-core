/// <reference types="node" />

import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { SemVer } from 'semver';
import { SpawnOptions } from 'child_process';
import { SpawnSyncOptions } from 'child_process';
import { SpawnSyncReturns } from 'child_process';
import { Writable } from 'stream';

/**
 * Implementation of {@link Versions} that does everything except self-populate.
 * It needs to be fed version info in its constructor.
 *
 * In production, use subclass '{@link ElectronVersions}'. This base class is
 * useful in testing because it's an easy way to inject fake test data into a
 * real Versions object.
 */
export declare class BaseVersions implements Versions {
    private readonly map;
    constructor(val: unknown);
    get prereleaseMajors(): number[];
    get stableMajors(): number[];
    get supportedMajors(): number[];
    get obsoleteMajors(): number[];
    get versions(): SemVer[];
    get latest(): SemVer | undefined;
    get latestStable(): SemVer | undefined;
    isVersion(ver: SemOrStr): boolean;
    inMajor(major: number): SemVer[];
    inRange(a: SemOrStr, b: SemOrStr): SemVer[];
}

export declare interface BisectResult {
    range?: [string, string];
    status: 'bisect_succeeded' | 'test_error' | 'system_error';
}

export declare function compareVersions(a: SemVer, b: SemVer): number;

export declare const DefaultPaths: Paths;

export declare type ProgressObject = { percent: number };

export declare interface Mirrors {
    electronMirror: string;
    electronNightlyMirror: string;
}

interface InstallerParams {
    progressCallback: (progress: ProgressObject) => void;
    mirror: Mirrors;
}

/**
 * Implementation of Versions that self-populates from release information at
 * https://releases.electronjs.org/releases.json .
 *
 * This is generally what to use in production.
 */
export declare class ElectronVersions extends BaseVersions {
    private constructor();
    static create(paths?: Partial<Paths>): Promise<ElectronVersions>;
}

export declare class Fiddle {
    readonly mainPath: string;
    readonly source: string;
    constructor(mainPath: string, // /path/to/main.js
    source: string);
    remove(): Promise<void>;
}

export declare class FiddleFactory {
    private readonly fiddles;
    constructor(fiddles?: string);
    fromGist(gistId: string): Promise<Fiddle>;
    fromFolder(source: string): Promise<Fiddle>;
    fromRepo(url: string, checkout?: string): Promise<Fiddle>;
    fromEntries(src: Iterable<[string, string]>): Promise<Fiddle>;
    create(src: FiddleSource): Promise<Fiddle | undefined>;
}

/**
 * - Iterable of [string, string] - filename-to-content key/value pairs
 * - string of form '/path/to/fiddle' - a fiddle on the filesystem
 * - string of form 'https://github.com/my/repo.git' - a git repo fiddle
 * - string of form '642fa8daaebea6044c9079e3f8a46390' - a github gist fiddle
 */
export declare type FiddleSource = Fiddle | string | Iterable<[string, string]>;

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
export declare class Installer extends EventEmitter {
    private readonly paths;
    private readonly stateMap;
    constructor(pathsIn?: Partial<Paths>);
    static execSubpath(platform?: string): string;
    static getExecPath(folder: string): string;
    state(version: string): InstallState;
    private setState;
    private rebuildStates;
    /** Removes an Electron download or Electron install from the disk. */
    remove(version: string): Promise<void>;
    /** The current Electron installation, if any. */
    get installedVersion(): string | undefined;
    private download;
    private ensureDownloadedImpl;
    /** map of version string to currently-running active Promise */
    private downloading;
    ensureDownloaded(version: string, opts?: Partial<InstallerParams>): Promise<string>;
    /** the currently-installing version, if any */
    private installing;
    install(version: string, opts?: Partial<InstallerParams>): Promise<string>;
}

/**
 * The state of a current Electron version.
 * See {@link Installer.state} to get this value.
 * See Installer.on('state-changed') to watch for state changes.
 */
export declare enum InstallState {
    missing = 'missing',
    downloading = 'downloading',
    downloaded = 'downloaded',
    installing = 'installing',
    installed = 'installed',
}

export declare interface InstallStateEvent {
    version: string;
    state: InstallState;
}

export declare interface Paths {
    readonly electronDownloads: string;
    readonly electronInstall: string;
    readonly fiddles: string;
    readonly versionsCache: string;
}

export declare function runFromCommandLine(argv: string[]): Promise<void>;

export declare class Runner {
    private readonly installer;
    private readonly versions;
    private readonly fiddleFactory;
    private osInfo;
    private constructor();
    static create(opts: {
        installer?: Installer;
        fiddleFactory?: FiddleFactory;
        paths?: Partial<Paths>;
        versions?: Versions;
    }): Promise<Runner>;
    /**
     * Figure out how to run the user-specified `electron` value.
     *
     * - if it's an existing directory, look for an execPath in it.
     * - if it's an existing file, run it. It's a local build.
     * - if it's a version number, delegate to the installer
     *
     * @param val - a version number, directory, or executable
     * @returns a path to an Electron executable
     */
    private getExec;
    private spawnInfo;
    /** If headless specified on  *nix, try to run with xvfb-run */
    private static headless;
    spawn(versionIn: string | SemVer, fiddleIn: FiddleSource, opts?: RunnerSpawnOptions): Promise<ChildProcess>;
    spawnSync(versionIn: string | SemVer, fiddleIn: FiddleSource, opts?: RunnerSpawnSyncOptions): Promise<SpawnSyncReturns<string>>;
    static displayEmoji(result: TestResult): string;
    static displayResult(result: TestResult): string;
    run(version: string | SemVer, fiddle: FiddleSource, opts?: RunnerSpawnSyncOptions): Promise<TestResult>;
    bisect(version_a: string | SemVer, version_b: string | SemVer, fiddleIn: FiddleSource, opts?: RunnerSpawnSyncOptions): Promise<BisectResult>;
}

export declare interface RunnerOptions {
    args?: string[];
    headless?: boolean;
    out?: Writable;
    showConfig?: boolean;
}

export declare type RunnerSpawnOptions = SpawnOptions & RunnerOptions;

export declare type RunnerSpawnSyncOptions = SpawnSyncOptions & RunnerOptions;

export declare type SemOrStr = SemVer | string;

export { SemVer }

export declare interface TestResult {
    status: 'test_passed' | 'test_failed' | 'test_error' | 'system_error';
}

/**
 * Interface for an object that manages a list of Electron releases.
 *
 * See {@link BaseVersions} for testing situations.
 * See {@link ElectronVersions} for production.
 */
export declare interface Versions {
    /** Semver-Major numbers of branches that only have prereleases */
    readonly prereleaseMajors: number[];
    /** Semver-Major numbers of branches that have supported stable releases */
    readonly supportedMajors: number[];
    /** Semver-Major numbers of branches that are no longer supported */
    readonly obsoleteMajors: number[];
    /** The latest release (by version, not by date) */
    readonly latest: SemVer | undefined;
    /** The latest stable (by version, not by date) */
    readonly latestStable: SemVer | undefined;
    /** Full list of all known Electron releases, Sorted in branch order. */
    readonly versions: SemVer[];
    /** @returns true iff `version` is a release that this object knows about */
    isVersion(version: SemOrStr): boolean;
    /** @returns all versions matching that major number. Sorted in branch order. */
    inMajor(major: number): SemVer[];
    /** @returns all versions in a range, inclusive. Sorted in branch order. */
    inRange(a: SemOrStr, b: SemOrStr): SemVer[];
}

export { }
