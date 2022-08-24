import { DefaultPaths, Paths } from './paths';
import {
  Installer,
  InstallState,
  InstallStateEvent,
  ElectronBinary,
} from './installer';
import { Fiddle, FiddleFactory, FiddleSource } from './fiddle';
import { BisectResult, Runner, RunnerOptions, TestResult } from './runner';
import {
  BaseVersions,
  ElectronVersions,
  SemOrStr,
  SemVer,
  Versions,
  compareVersions,
} from './versions';
import { runFromCommandLine } from './command-line';

export {
  BaseVersions,
  BisectResult,
  DefaultPaths,
  ElectronBinary,
  ElectronVersions,
  Fiddle,
  FiddleFactory,
  FiddleSource,
  InstallState,
  InstallStateEvent,
  Installer,
  Paths,
  Runner,
  RunnerOptions,
  SemOrStr,
  SemVer,
  TestResult,
  Versions,
  compareVersions,
  runFromCommandLine,
};

if (require.main === module) {
  void runFromCommandLine(process.argv.slice(2));
}
