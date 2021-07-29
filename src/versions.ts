import * as fs from 'fs-extra';
import * as semver from 'semver';
import debug from 'debug';
import fetch from 'node-fetch';

type SemVer = semver.SemVer;

import { DefaultPaths, Paths } from './paths';

type SemOrStr = SemVer | string;

export interface Versions {
  readonly prereleaseMajors: number[];
  readonly supportedMajors: number[];
  readonly obsoleteMajors: number[];

  readonly latest: SemVer | undefined;
  readonly latestStable: SemVer | undefined;
  readonly versions: SemVer[];

  // returns true iff this is a version we know about
  isVersion(version: SemOrStr): boolean;

  // returns all the versions with that major number
  inMajor(major: number): SemVer[];

  // return all the versions in a range, inclusive
  inRange(a: SemOrStr, b: SemOrStr): SemVer[];
}

function releaseCompare(a: SemVer, b: SemVer) {
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

const NUM_SUPPORTED_MAJORS = 4;

export class BaseVersions implements Versions {
  private readonly map = new Map<string, SemVer>();

  public constructor(val: unknown) {
    // build the array
    let parsed: Array<SemVer | null> = [];

    if (isArrayOfVersionObjects(val)) {
      parsed = val.map(({ version }) => semver.parse(version));
    } else if (isArrayOfStrings(val)) {
      parsed = val.map((version) => semver.parse(version));
    }

    // insert them in sorted order
    const semvers = parsed.filter((sem) => Boolean(sem)) as SemVer[];
    semvers.sort((a, b) => releaseCompare(a, b));
    this.map = new Map(semvers.map((sem) => [sem.version, sem]));
  }

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

  public get stableMajors(): number[] {
    const majors = new Set<number>();
    for (const ver of this.map.values()) {
      if (ver.prerelease.length === 0) {
        majors.add(ver.major);
      }
    }
    return [...majors];
  }

  public get supportedMajors(): number[] {
    return this.stableMajors.slice(-NUM_SUPPORTED_MAJORS);
  }

  public get obsoleteMajors(): number[] {
    return this.stableMajors.slice(0, -NUM_SUPPORTED_MAJORS);
  }

  public get versions(): SemVer[] {
    return [...this.map.values()];
  }

  public get latest(): SemVer | undefined {
    return this.versions.pop();
  }

  public get latestStable(): SemVer | undefined {
    let stable: SemVer | undefined = undefined;
    for (const ver of this.map.values()) {
      if (ver.prerelease.length === 0) {
        stable = ver;
      }
    }
    return stable;
  }

  public isVersion(ver: SemOrStr): boolean {
    return this.map.has(typeof ver === 'string' ? ver : ver.version);
  }

  public inMajor(major: number): SemVer[] {
    const versions: SemVer[] = [];
    for (const ver of this.map.values()) {
      if (ver.major === major) {
        versions.push(ver);
      }
    }
    return versions;
  }

  public inRange(a: SemOrStr, b: SemOrStr): SemVer[] {
    if (typeof a !== 'string') a = a.version;
    if (typeof b !== 'string') b = b.version;

    const versions = [...this.map.values()];
    let first = versions.findIndex((ver) => ver.version === a);
    let last = versions.findIndex((ver) => ver.version === b);
    if (first > last) [first, last] = [last, first];
    return versions.slice(first, last + 1);
  }
}

export class ElectronVersions extends BaseVersions {
  private constructor(values: unknown) {
    super(values);
  }

  public static async create(
    paths: Partial<Paths> = {},
  ): Promise<ElectronVersions> {
    const d = debug('fiddle-runner:ElectronVersions:create');
    const { versionsCache } = { ...DefaultPaths, ...paths };
    try {
      const st = await fs.stat(versionsCache);
      const cacheIntervalMs = 4 * 60 * 60 * 1000; // re-fetch after 4 hours
      if (st.mtime.getTime() + cacheIntervalMs > Date.now()) {
        return new ElectronVersions(await fs.readJson(versionsCache));
      }
    } catch (err) {
      // if no cache, fetch from electronjs.org
      d(`unable to stat cache file "${versionsCache}"`, err);
    }

    const url = 'https://releases.electronjs.org/releases.json';
    d('fetching releases list from', url);
    const response = await fetch(url);
    const json = (await response.json()) as unknown;
    await fs.outputJson(versionsCache, json);
    d(`saved "${versionsCache}"`);
    return new ElectronVersions(json);
  }
}
