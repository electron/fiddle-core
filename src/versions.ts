import * as fs from 'fs-extra';
import * as semver from 'semver';
import fetch from 'node-fetch';
import debug from 'debug';

import { DefaultPaths } from './paths';

export interface Versions {
  getDefaultBisectStart(): Promise<string>;
  getLatestVersion(): Promise<string>;
  getVersions(): Promise<string[]>;
  getVersionsInRange(range: [string, string]): Promise<string[]>;
  getVersionsToTest(): Promise<string[]>;
  isVersion(version: string): Promise<boolean>;
}

type Release = semver.SemVer;

// from https://github.com/electron/fiddle/blob/master/src/utils/sort-versions.ts
function releaseCompare(a: Release, b: Release) {
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

function hasVersion(value: unknown): value is { version: unknown } {
  return typeof value === 'object' && value !== null && 'version' in value;
}

function isVersionArray(value: unknown): value is Array<{ version: string }> {
  return (
    Array.isArray(value) &&
    value.every((item) => hasVersion(item) && typeof item.version === 'string')
  );
}

export abstract class BaseVersionsImpl implements Versions {
  private readonly releases = new Map<string, Release>();
  private releasesTime = 0; // epoch

  protected abstract fetchReleases(): Promise<unknown>;

  private async updateReleases() {
    const versions = await this.fetchReleases();
    this.releasesTime = Date.now();
    this.releases.clear();
    if (isVersionArray(versions)) {
      for (const { version } of versions) {
        this.releases.set(version, semver.parse(version)!);
      }
    }
  }

  private isCacheTooOld(): boolean {
    // if it's been >12 hours, refresh the cache
    const CACHE_PERIOD_MSEC = 12 * 60 * 60 * 1000;
    return this.releasesTime + CACHE_PERIOD_MSEC < Date.now();
  }

  private async ensureReleases() {
    if (!this.releases.size || this.isCacheTooOld())
      await this.updateReleases();
  }

  private groupReleasesByMajor(releases: Release[]): Map<number, Release[]> {
    const majors = [...new Set<number>(releases.map((rel) => rel.major))];
    const byMajor = new Map<number, Release[]>(majors.map((maj) => [maj, []]));
    for (const rel of releases) byMajor.get(rel.major)!.push(rel);
    for (const range of byMajor.values()) range.sort(releaseCompare);
    return byMajor;
  }

  public async getVersionsToTest(): Promise<string[]> {
    await this.ensureReleases();

    const byMajor = this.groupReleasesByMajor([...this.releases.values()]);
    const majors = [...byMajor.keys()].sort((a, b) => a - b);

    const versions: Release[] = [];

    // Get the oldest and newest version of each branch we're testing.
    // If a branch has gone stable, skip its prereleases.

    const isStable = (rel: Release) => rel.prerelease.length === 0;
    const hasStable = (releases: Release[]) => releases.some(isStable);

    // const SUPPORTED_MAJORS = 3; // https://www.electronjs.org/docs/tutorial/support
    const SUPPORTED_MAJORS = 4; // for rest of 2021. https://github.com/electron/electronjs.org/pull/5463
    const UNSUPPORTED_MAJORS_TO_TEST = 2;
    const NUM_STABLE_TO_TEST = SUPPORTED_MAJORS + UNSUPPORTED_MAJORS_TO_TEST;
    let stableLeft = NUM_STABLE_TO_TEST;
    while (majors.length > 0 && stableLeft > 0) {
      const major = majors.pop()!;
      let range = byMajor.get(major)!;
      if (hasStable(range)) {
        range = range.filter(isStable); // skip its prereleases
        --stableLeft;
      }
      versions.push(range.shift()!); // oldest version
      if (range.length >= 1) versions.push(range.pop()!); // newest version
    }

    return versions.sort(releaseCompare).map((ret) => ret.version);
  }

  public async getDefaultBisectStart(): Promise<string> {
    return (await this.getVersionsToTest()).shift()!;
  }

  public async isVersion(version: string): Promise<boolean> {
    await this.ensureReleases();
    return this.releases.has(version);
  }

  public async getVersions(): Promise<string[]> {
    await this.ensureReleases();
    return [...this.releases.keys()];
  }

  public async getLatestVersion(): Promise<string> {
    await this.ensureReleases();
    return [...this.releases.values()].sort(releaseCompare).pop()!.version;
  }

  public async getVersionsInRange(range: [string, string]): Promise<string[]> {
    let [sema, semb] = range.map((version) => semver.parse(version));
    if (releaseCompare(sema!, semb!) > 0) [sema, semb] = [semb, sema];

    await this.ensureReleases();
    return [...this.releases.values()]
      .filter((ver) => releaseCompare(ver, sema!) >= 0)
      .filter((ver) => releaseCompare(ver, semb!) <= 0)
      .sort((a, b) => releaseCompare(a, b))
      .map((ver) => ver.version);
  }
}

export class ElectronVersions extends BaseVersionsImpl {
  constructor(private readonly cacheFile = DefaultPaths.versionsCache) {
    super();
  }

  protected async fetchReleases(): Promise<unknown> {
    const d = debug('fiddle-runner:ElectronVersions:fetchReleases');
    try {
      const st = await fs.stat(this.cacheFile);
      const cacheIntervalMs = 4 * 60 * 60 * 1000; // re-fetch after 4 hours
      if (st.mtime.getTime() + cacheIntervalMs > Date.now()) {
        return (await fs.readJson(this.cacheFile)) as unknown;
      }
    } catch (err) {
      // if no cache, fetch from electronjs.org
      d(`unable to stat cache file "${this.cacheFile}"`, err);
    }

    const url = 'https://releases.electronjs.org/releases.json';
    d('fetching releases list from', url);
    const response = await fetch(url);
    const json = (await response.json()) as unknown;
    await fs.outputJson(this.cacheFile, json);
    d(`saved "${this.cacheFile}"`);
    return json;
  }
}
