import path from 'node:path';

import envPaths from 'env-paths';

/** 
 * Defines standard filesystem paths used by fiddle-core.
 */
export interface Paths {
  /** Directory where Electron zip archives are cached. */
  readonly electronDownloads: string;

  /** Directory where Electron builds are extracted and executed. */
  readonly electronInstall: string;

  /** Directory where user fiddles are stored. */
  readonly fiddles: string;

  /** File path used to cache Electron release metadata. */
  readonly versionsCache: string;
}

const paths = envPaths('fiddle-core', { suffix: '' });

/** Default set of resolved paths for fiddle-core operations. */
export const DefaultPaths: Paths = {
  electronDownloads: path.join(paths.data, 'electron', 'zips'),
  electronInstall: path.join(paths.data, 'electron', 'current'),
  fiddles: path.join(paths.cache, 'fiddles'),
  versionsCache: path.join(paths.cache, 'releases.json'),
};