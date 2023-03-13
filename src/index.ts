#!/usr/bin/env node

import { DefaultPaths, Paths } from './paths';
import {
  ElectronBinary,
  Installer,
  InstallerParams,
  InstallState,
  InstallStateEvent,
  Mirrors,
  ProgressObject,
} from './installer';
import { Fiddle, FiddleFactory, FiddleSource } from './fiddle';
import {
  BisectResult,
  Runner,
  RunnerOptions,
  RunnerSpawnOptions,
  TestResult,
} from './runner';
import {
  BaseVersions,
  ElectronVersions,
  ElectronVersionsCreateOptions,
  ReleaseInfo,
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
  ElectronVersionsCreateOptions,
  Fiddle,
  FiddleFactory,
  FiddleSource,
  InstallState,
  InstallStateEvent,
  Installer,
  InstallerParams,
  Mirrors,
  Paths,
  ProgressObject,
  ReleaseInfo,
  Runner,
  RunnerOptions,
  RunnerSpawnOptions,
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
