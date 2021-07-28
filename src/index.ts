import { DefaultPaths, Paths } from './paths';
import { Electron } from './electron';
import { Fiddle, FiddleFactory } from './fiddle';
import {
  BisectResult,
  Runner,
  SpawnOptions,
  SpawnSyncOptions,
  TestResult,
} from './runner';
import { ElectronVersions, Versions } from './versions';
import { runFromCommandLine } from './command-line';

export {
  BisectResult,
  DefaultPaths,
  Electron,
  ElectronVersions,
  Fiddle,
  FiddleFactory,
  Paths,
  Runner,
  SpawnOptions,
  SpawnSyncOptions,
  TestResult,
  Versions,
  runFromCommandLine,
};

if (require.main === module) {
  void runFromCommandLine(process.argv.slice(2));
}
