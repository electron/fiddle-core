import { DefaultPaths, Paths } from './paths';
import { Installer, InstallState } from './installer';
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
  Installer,
  ElectronVersions,
  Fiddle,
  FiddleFactory,
  InstallState,
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
