import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { SemVer } from 'semver';
import { SpawnOptions } from 'child_process';
import { Writable } from 'stream';

/**
 * Represents base version management functionality.
 */
export class BaseVersions implements Versions {
    /**
     * Constructs a `BaseVersions` instance.
     * @param {unknown} versions - The initial versions data.
     */
    constructor(versions: unknown);

    /**
     * Retrieves release information for a specific version.
     * @param {SemOrStr} ver - The version as a `SemVer` object or string.
     * @returns {ReleaseInfo | undefined} The release information or `undefined` if not found.
     */
    getReleaseInfo(ver: SemOrStr): ReleaseInfo | undefined;

    /**
     * Returns an array of `SemVer` objects that match the given major version.
     * @param {number} major - The major version to filter by.
     * @returns {SemVer[]} The matching versions.
     */
    inMajor(major: number): SemVer[];

    /**
     * Returns an array of `SemVer` objects within the given range.
     * @param {SemOrStr} a - The lower bound of the range.
     * @param {SemOrStr} b - The upper bound of the range.
     * @returns {SemVer[]} The versions within the range.
     */
    inRange(a: SemOrStr, b: SemOrStr): SemVer[];

    /**
     * Checks if a given version exists.
     * @param {SemOrStr} ver - The version to check.
     * @returns {boolean} `true` if the version exists, otherwise `false`.
     */
    isVersion(ver: SemOrStr): boolean;

    /**
     * Gets the latest available version.
     * @returns {SemVer | undefined} The latest version.
     */
    get latest(): SemVer | undefined;

    /**
     * Gets the latest stable version.
     * @returns {SemVer | undefined} The latest stable version.
     */
    get latestStable(): SemVer | undefined;

    /**
     * Gets the list of obsolete major versions.
     * @returns {number[]} An array of obsolete major versions.
     */
    get obsoleteMajors(): number[];

    /**
     * Gets the list of prerelease major versions.
     * @returns {number[]} An array of prerelease major versions.
     */
    get prereleaseMajors(): number[];

    /**
     * Sets the versions data.
     * @param {unknown} val - The versions data to set.
     */
    protected setVersions(val: unknown): void;

    /**
     * Gets the list of stable major versions.
     * @returns {number[]} An array of stable major versions.
     */
    get stableMajors(): number[];

    /**
     * Gets the list of supported major versions.
     * @returns {number[]} An array of supported major versions.
     */
    get supportedMajors(): number[];

    /**
     * Gets the list of all available versions.
     * @returns {SemVer[]} An array of available versions.
     */
    get versions(): SemVer[];
}

/**
 * The result of a bisect operation.
 */
export interface BisectResult {
    /**
     * The range of versions tested (if applicable).
     */
    range?: [string, string];

    /**
     * The status of the bisect operation.
     * - "bisect_succeeded": The bisect operation succeeded.
     * - "test_error": There was an error in the test process.
     * - "system_error": A system error occurred.
     */
    status: 'bisect_succeeded' | 'test_error' | 'system_error';
}

/**
 * Compares two `SemVer` versions.
 * @param {SemVer} a - The first version.
 * @param {SemVer} b - The second version.
 * @returns {number} `-1` if `a < b`, `1` if `a > b`, `0` if equal.
 */
export function compareVersions(a: SemVer, b: SemVer): number;

/**
 * Default paths used in the application.
 */
export const DefaultPaths: Paths;

/**
 * Represents an Electron binary download.
 */
export interface ElectronBinary {
    /**
     * Indicates if the binary has already been extracted.
     */
    alreadyExtracted: boolean;

    /**
     * The path to the Electron binary.
     */
    path: string;
}

/**
 * Represents options for creating `ElectronVersions`.
 */
export interface ElectronVersionsCreateOptions {
    /**
     * Whether to ignore cache while fetching versions.
     */
    ignoreCache?: boolean;

    /**
     * Initial versions data.
     */
    initialVersions?: unknown;
}
