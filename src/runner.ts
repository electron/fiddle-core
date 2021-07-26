import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { Writable } from 'stream';
import debug from 'debug';
import getos from 'getos';
import { inspect } from 'util';

import { Electron } from './electron';
import { Fiddle } from './fiddle';
import { ElectronVersions, Versions } from './versions';

export interface SpawnOptions extends child_process.SpawnOptions {
  headless?: boolean;
  out?: Writable;
}

export interface SpawnSyncOptions extends child_process.SpawnSyncOptions {
  headless?: boolean;
  out?: Writable;
}

export interface TestResult {
  status: 'test_passed' | 'test_failed' | 'test_error' | 'system_error';
}

export interface BisectResult {
  range?: [string, string];
  status: 'bisect_succeeded' | 'test_error' | 'system_error';
}

export class Runner {
  private osInfo = '';

  constructor(
    private readonly electron: Electron = new Electron(),
    private readonly versions: Versions = new ElectronVersions(),
  ) {
    getos((err, result) => (this.osInfo = inspect(result || err)));
  }

  private spawnInfo = (version: string, exec: string, fiddle: Fiddle) =>
    [
      '',
      '🧪 Testing',
      '',
      `  - date: ${new Date().toISOString()}`,
      '',
      `  - fiddle:`,
      `      - source: ${fiddle.source}`,
      `      - local copy: ${path.dirname(fiddle.mainPath)}`,
      '',
      `  - electron_version: ${version}`,
      `      - source: https://github.com/electron/electron/releases/tag/v${version}`,
      `      - local copy: ${path.dirname(exec)}`,
      '',
      '  - test platform:',
      `      - os_arch: ${os.arch()}`,
      `      - os_platform: ${process.platform}`,
      `      - os_release: ${os.release()}`,
      `      - os_version: ${os.version()}`,
      `      - getos: ${this.osInfo}`,
      '',
    ].join('\n');

  private static headless(
    exec: string,
    args: string[],
  ): { exec: string; args: string[] } {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      args.unshift(exec);
      exec = 'xvfb-run';
    }
    return { exec, args };
  }

  public async spawn(
    version: string,
    fiddle: Fiddle,
    opts: SpawnOptions,
  ): Promise<child_process.ChildProcess> {
    const d = debug('fiddle-runner:Runner.spawn');

    opts = { out: process.stdout, headless: false, ...opts };

    // set up the electron binary and the fiddle
    const electron = await this.electron.prepare(version);
    let exec = electron;
    let args = [fiddle.mainPath];
    if (opts.headless) ({ exec, args } = Runner.headless(exec, args));

    d(inspect({ exec, args, opts }));

    const child = child_process.spawn(exec, args, opts);

    if (child.stdout)
      child.stdout.push(this.spawnInfo(version, electron, fiddle));

    return child;
  }

  public async spawnSync(
    version: string,
    fiddle: Fiddle,
    opts: SpawnSyncOptions = {},
  ): Promise<child_process.SpawnSyncReturns<string>> {
    const d = debug('fiddle-runner:Runner.spawnSync');

    opts = { headless: false, out: process.stdout, ...opts };

    // set up the electron binary and the fiddle
    const electron = await this.electron.prepare(version);
    let exec = electron;
    let args = [fiddle.mainPath];
    if (opts.headless) ({ exec, args } = Runner.headless(exec, args));

    d(inspect({ exec, args, opts }));
    const result = child_process.spawnSync(exec, args, {
      ...opts,
      encoding: 'utf8',
    });

    if (opts.out) {
      opts.out.write(
        [this.spawnInfo(version, electron, fiddle), result.stdout].join('\n'),
      );
    }

    return result;
  }

  public static displayEmoji(result: TestResult): string {
    switch (result.status) {
      case 'system_error':
        return '🟠';
      case 'test_error':
        return '🔵';
      case 'test_failed':
        return '🔴';
      case 'test_passed':
        return '🟢';
    }
  }

  public static displayResult(result: TestResult): string {
    const text = Runner.displayEmoji(result);
    switch (result.status) {
      case 'system_error':
        return text + ' system error: test did not pass or fail';
      case 'test_error':
        return text + ' test error: test did not pass or fail';
      case 'test_failed':
        return text + ' failed';
      case 'test_passed':
        return text + ' passed';
    }
  }

  public async test(
    version: string,
    fiddle: Fiddle,
    out = process.stdout,
  ): Promise<TestResult> {
    const result = await this.spawnSync(version, fiddle, { out });
    const { error, status } = result;

    if (error) return { status: 'system_error' };
    if (status === 0) return { status: 'test_passed' };
    if (status === 1) return { status: 'test_failed' };
    return { status: 'test_error' };
  }

  public async bisect(
    version_range: [string, string],
    fiddle: Fiddle,
    out = process.stdout,
  ): Promise<BisectResult> {
    const log = (first: unknown, ...rest: unknown[]) => {
      if (out) {
        out.write([first, ...rest].join(' '));
        out.write('\n');
      }
    };

    const versions = await this.versions.getVersionsInRange(version_range);

    const displayIndex = (i: number) => '#' + i.toString().padStart(4, ' ');

    log(
      [
        '📐 Bisect Requested',
        '',
        ` - gist is https://gist.github.com/${fiddle.source}`,
        ` - the version range is [${version_range.join('..')}]`,
        ` - there are ${versions.length} versions in this range:`,
        '',
        ...versions.map((ver, i) => `${displayIndex(i)} - ${ver}`),
      ].join('\n'),
    );

    // basically a binary search
    let left = 0;
    let right = versions.length - 1;
    let result: TestResult | undefined = undefined;
    const testOrder: (number | undefined)[] = [];
    const results = new Array<TestResult>(versions.length);
    while (left + 1 < right) {
      const mid = Math.round(left + (right - left) / 2);
      const version = versions[mid];
      testOrder.push(mid);
      log(`bisecting, range [${left}..${right}], mid ${mid} (${version})`);

      result = await this.test(version, fiddle, out);
      results[mid] = result;
      log(`${Runner.displayResult(result)} ${versions[mid]}\n`);

      if (result.status === 'test_passed') {
        left = mid;
        continue;
      } else if (result.status === 'test_failed') {
        right = mid;
        continue;
      } else {
        break;
      }
    }

    log(`🏁 finished bisecting across ${versions.length} versions...`);
    versions.forEach((ver, i) => {
      const n = testOrder.indexOf(i);
      if (n === -1) return;
      log(
        displayIndex(i),
        Runner.displayResult(results[i]),
        ver,
        `(test #${n + 1})`,
      );
    });

    log('\n🏁 Done bisecting');
    const success =
      results[left].status === 'test_passed' &&
      results[right].status === 'test_failed';
    if (success) {
      const good = versions[left];
      const bad = versions[right];
      log(
        [
          `${Runner.displayResult(results[left])} ${good}`,
          `${Runner.displayResult(results[right])} ${bad}`,
          'Commits between versions:',
          `↔ https://github.com/electron/electron/compare/v${good}...v${bad}`,
        ].join('\n'),
      );
    } else {
      // FIXME: log some failure
    }

    if (success) {
      return {
        range: [versions[left], versions[right]],
        status: 'bisect_succeeded',
      };
    } else if (
      result?.status === 'test_error' ||
      result?.status === 'system_error'
    ) {
      return { status: result.status };
    }

    return { status: 'system_error' };
  }
}
