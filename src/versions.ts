import * as fs from 'fs-extra';
import { parse as semverParse, SemVer } from 'semver';
import debug from 'debug';
import fetch from 'node-fetch';

export { SemVer };

import { DefaultPaths, Paths } from './paths';

/** Type that can be either a SemVer object or a string */
export type SemOrStr = SemVer | string;

/** Information about a release */
export interface ReleaseInfo {
  /** Electron version */
  version: string;
  /** Release date */
  date: string;
  /** Node.js version */
  node: string;
  /** V8 version */
  v8: string;
  /** uv version */
  uv: string;
  /** zlib version */
  zlib: string;
  /** OpenSSL version */
  openssl: string;
  /** Node.js modules version */
  modules: string;
  /** Chromium version */
  chrome: string;
  /** Files included in the release */
  files: Array<string>;
}

/**
 * Interface for an object that manages a list of Electron releases.
 *
 * See {@link BaseVersions} for testing situations.
 * See {@link ElectronVersions} for production.
 */
export interface Versions {
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

  /** @returns {@link ReleaseInfo} iff `version` is a release that this object knows about */
  getReleaseInfo(version: SemOrStr): ReleaseInfo | undefined;
}

/**
 * Represents the options for creating Electron versions.
 */
export interface ElectronVersionsCreateOptions {
  /** Initial versions to use if there is no cache. When provided, no initial fetch is done */
  initialVersions?: unknown;

  /** Ignore the cache even if it exists and is fresh */
  ignoreCache?: boolean;
}

/** Compares two semantic version numbers */
export function compareVersions(a: SemVer, b: SemVer): number {
  const l = a.compareMain(b);
  if (l) return l;
  // Electron's approach is nightly -> other prerelease tags -> stable,
  // so force `nightly` to sort before other prerelease tags.
  const [prea] = a.prerelease;
  const [preb] = b.prerelease;
  if (prea === 'nightly' && preb !== 'nightly') return -1;
  if (prea !== 'nightly' && preb === 'nightly') return 1;
  return a.comparePre(b);
}

// ts type guards

function hasVersion(val: unknown): val is { version: unknown } {
  return typeof val === 'object' && val !== null && 'version' in val;
}

function isReleaseInfo(val: unknown): val is ReleaseInfo {
  return (
    typeof val === 'object' &&
    val !== null &&
    'version' in val &&
    typeof val.version === 'string' &&
    'date' in val &&
    typeof val.date === 'string' &&
    'node' in val &&
    typeof val.node === 'string' &&
    'v8' in val &&
    typeof val.v8 === 'string' &&
    'uv' in val &&
    typeof val.uv === 'string' &&
    'zlib' in val &&
    typeof val.zlib === 'string' &&
    'openssl' in val &&
    typeof val.openssl === 'string' &&
    'modules' in val &&
    typeof val.modules === 'string' &&
    'chrome' in val &&
    typeof val.chrome === 'string' &&
    'files' in val &&
    isArrayOfStrings(val.files)
  );
}

function isArrayOfVersionObjects(
  val: unknown,
): val is Array<{ version: string }> {
  return (
    Array.isArray(val) &&
    val.every((item) => hasVersion(item) && typeof item.version === 'string')
  );
}

function isArrayOfStrings(val: unknown): val is Array<string> {
  return Array.isArray(val) && val.every((item) => typeof item === 'string');
}

const NUM_SUPPORTED_MAJORS = 3;

/**
 * Implementation of {@link Versions} that does everything except self-populate.
 * It needs to be fed version info in its constructor.
 *
 * In production, use subclass '{@link ElectronVersions}'. This base class is
 * useful in testing because it's an easy way to inject fake test data into a
 * real Versions object.
 */
export class BaseVersions implements Versions {
  private readonly map = new Map<string, SemVer>();
  private readonly releaseInfo = new Map<string, ReleaseInfo>();

  /** Sets the versions and their corresponding release information */
  protected setVersions(val: unknown): void {
    // release info doesn't need to be in sorted order
    this.releaseInfo.clear();

    // build the array
    let parsed: Array<SemVer | null> = [];
    if (isArrayOfVersionObjects(val)) {
      parsed = val.map(({ version }) => semverParse(version));

      // build release info
      for (const entry of val) {
        if (isReleaseInfo(entry)) {
          this.releaseInfo.set(entry.version, {
            version: entry.version,
            date: entry.date,
            node: entry.node,
            v8: entry.v8,
            uv: entry.uv,
            zlib: entry.zlib,
            openssl: entry.openssl,
            modules: entry.modules,
            chrome: entry.chrome,
            files: [...entry.files],
          });
        }
      }
    } else if (isArrayOfStrings(val)) {
      parsed = val.map((version) => semverParse(version));
    } else {
      console.warn('Unrecognized versions:', val);
    }

    // insert them in sorted order
    const semvers = parsed.filter((sem) => Boolean(sem)) as SemVer[];
    semvers.sort((a, b) => compareVersions(a, b));
    this.map.clear();
    for (const sem of semvers) this.map.set(sem.version, sem);
  }

  public constructor(versions: unknown) {
    this.setVersions(versions);
  }

  /** An array of major versions that have prerelease versions */
  public get prereleaseMajors(): number[] {
    const majors = new Set<number>();
    for (const ver of this.map.values()) {
      majors.add(ver.major);
    }
    for (const ver of this.map.values()) {
      if (ver.prerelease.length === 0) {
        majors.delete(ver.major);
      }
    }
    return [...majors];
  }

  /** An array of major versions that only have stable versions */
  public get stableMajors(): number[] {
    const majors = new Set<number>();
    for (const ver of this.map.values()) {
      if (ver.prerelease.length === 0) {
        majors.add(ver.major);
      }
    }
    return [...majors];
  }

  /** An array of the most recently supported major versions */
  public get supportedMajors(): number[] {
    return this.stableMajors.slice(-NUM_SUPPORTED_MAJORS);
  }

  /** An array of major versions that are considered obsolete */
  public get obsoleteMajors(): number[] {
    return this.stableMajors.slice(0, -NUM_SUPPORTED_MAJORS);
  }

  /** An array of all semantic versions */
  public get versions(): SemVer[] {
    return [...this.map.values()];
  }

  /** Latest semantic version */
  public get latest(): SemVer | undefined {
    return this.versions.pop();
  }

  /** Latest stable semantic version */
  public get latestStable(): SemVer | undefined {
    let stable: SemVer | undefined = undefined;
    for (const ver of this.map.values()) {
      if (ver.prerelease.length === 0) {
        stable = ver;
      }
    }
    return stable;
  }

  /** Checks if a given value is a valid version */
  public isVersion(ver: SemOrStr): boolean {
    return this.map.has(typeof ver === 'string' ? ver : ver.version);
  }

  /** An array of semantic versions in a specific major version */
  public inMajor(major: number): SemVer[] {
    const versions: SemVer[] = [];
    for (const ver of this.map.values()) {
      if (ver.major === major) {
        versions.push(ver);
      }
    }
    return versions;
  }

  /** Gets an array of semantic versions within a specified range */
  public inRange(a: SemOrStr, b: SemOrStr): SemVer[] {
    if (typeof a !== 'string') a = a.version;
    if (typeof b !== 'string') b = b.version;

    const versions = [...this.map.values()];
    let first = versions.findIndex((ver) => ver.version === a);
    let last = versions.findIndex((ver) => ver.version === b);
    if (first > last) [first, last] = [last, first];
    return versions.slice(first, last + 1);
  }

  /** Gets the release information for a given version */
  public getReleaseInfo(ver: SemOrStr): ReleaseInfo | undefined {
    return this.releaseInfo.get(typeof ver === 'string' ? ver : ver.version);
  }
}

/**
 * Implementation of Versions that self-populates from release information at
 * https://releases.electronjs.org/releases.json .
 *
 * This is generally what to use in production.
 */
export class ElectronVersions extends BaseVersions {
  private constructor(
    private readonly versionsCache: string,
    private mtimeMs: number,
    values: unknown,
  ) {
    super(values);
  }

  private static async fetchVersions(cacheFile: string): Promise<unknown> {
    const d = debug('fiddle-core:ElectronVersions:fetchVersions');
    const url = 'https://releases.electronjs.org/releases.json';
    d('fetching releases list from', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Fetching versions failed with status code: ${response.status}`,
      );
    }
    const json = (await response.json()) as unknown;
    await fs.outputJson(cacheFile, json);
    return json;
  }

  private static isCacheFresh(cacheTimeMs: number, now: number): boolean {
    const VERSION_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // cache for N hours
    return now <= cacheTimeMs + VERSION_CACHE_TTL_MS;
  }

  /** Creates an instance of the parent class. */
  public static async create(
    paths: Partial<Paths> = {},
    options: ElectronVersionsCreateOptions = {},
  ): Promise<ElectronVersions> {
    const d = debug('fiddle-core:ElectronVersions:create');
    const { versionsCache } = { ...DefaultPaths, ...paths };

    // Use initialVersions instead if provided, and don't fetch if so
    let versions = options.initialVersions;
    let staleCache = false;
    const now = Date.now();

    if (!options.ignoreCache) {
      try {
        const st = await fs.stat(versionsCache);
        versions = await fs.readJson(versionsCache);
        staleCache = !ElectronVersions.isCacheFresh(st.mtimeMs, now);
      } catch (err) {
        d('cache file missing or cannot be read', err);
      }
    }

    if (!versions || staleCache) {
      try {
        versions = await ElectronVersions.fetchVersions(versionsCache);
      } catch (err) {
        d('error fetching versions', err);
        if (!versions) {
          throw err;
        }
      }
    }

    return new ElectronVersions(versionsCache, now, versions);
  }

  /** update the cache */
  public async fetch(): Promise<void> {
    const d = debug('fiddle-core:ElectronVersions:fetch');
    const { mtimeMs, versionsCache } = this;
    try {
      this.mtimeMs = Date.now();
      const versions = await ElectronVersions.fetchVersions(versionsCache);
      this.setVersions(versions);
      d(`saved "${versionsCache}"`);
    } catch (err) {
      d('error fetching versions', err);
      this.mtimeMs = mtimeMs;
    }
  }

  // update the cache iff it's too old
  private async keepFresh(): Promise<void> {
    if (!ElectronVersions.isCacheFresh(this.mtimeMs, Date.now())) {
      await this.fetch();
    }
  }

  /** Getter to ensure the cache is up to date */
  public override get prereleaseMajors(): number[] {
    void this.keepFresh();
    return super.prereleaseMajors;
  }

  /** Getter to ensure the cache is up to date */
  public override get stableMajors(): number[] {
    void this.keepFresh();
    return super.stableMajors;
  }

  /** Getter to ensure the cache is up to date */
  public override get supportedMajors(): number[] {
    void this.keepFresh();
    return super.supportedMajors;
  }

  /** Getter to ensure the cache is up to date */
  public override get obsoleteMajors(): number[] {
    void this.keepFresh();
    return super.obsoleteMajors;
  }

  /** Getter to ensure the cache is up to date */
  public override get versions(): SemVer[] {
    void this.keepFresh();
    return super.versions;
  }

  /** Getter to ensure the cache is up to date */
  public override get latest(): SemVer | undefined {
    void this.keepFresh();
    return super.latest;
  }

  /** Getter to ensure the cache is up to date. */
  public override get latestStable(): SemVer | undefined {
    void this.keepFresh();
    return super.latestStable;
  }

  /** An method to ensure the cache is up to date */
  public override isVersion(ver: SemOrStr): boolean {
    void this.keepFresh();
    return super.isVersion(ver);
  }

  /** An method to ensure the cache is up to date */
  public override inMajor(major: number): SemVer[] {
    void this.keepFresh();
    return super.inMajor(major);
  }

  /** An method to ensure the cache is up to date */
  public override inRange(a: SemOrStr, b: SemOrStr): SemVer[] {
    void this.keepFresh();
    return super.inRange(a, b);
  }
}
