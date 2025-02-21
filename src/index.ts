#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { DefaultPaths, Paths } from './paths.js';
import {
  ElectronBinary,
  Installer,
  InstallerParams,
  InstallState,
  InstallStateEvent,
  Mirrors,
  ProgressObject,
} from './installer.js';
import { Fiddle, FiddleFactory, FiddleSource } from './fiddle.js';
import {
  BisectResult,
  Runner,
  RunnerOptions,
  RunnerSpawnOptions,
  TestResult,
} from './runner.js';
import {
  BaseVersions,
  ElectronVersions,
  ElectronVersionsCreateOptions,
  ReleaseInfo,
  SemOrStr,
  SemVer,
  Versions,
  compareVersions,
} from './versions.js';
import { runFromCommandLine } from './command-line.js';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runFromCommandLine(process.argv.slice(2));
}
