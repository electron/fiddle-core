import child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import fs from 'graceful-fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  Installer,
  FiddleFactory,
  FiddleFactoryCreateOptions,
  Runner,
  TestResult,
} from '../src/index.js';

vi.mock('child_process');

const mockStdout = vi.fn();

const mockSubprocess = {
  on: vi.fn(),
  stdout: {
    on: vi.fn(),
    pipe: vi.fn(),
  },
  stderr: {
    on: vi.fn(),
    pipe: vi.fn(),
  },
};

interface FakeRunnerOpts {
  pathToExecutable?: string;
  generatedFiddle?: {
    source: string;
    mainPath: string;
  } | null;
}

let tmpdir: string;
let versionsCache: string;

beforeAll(async () => {
  tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fiddle-core-'));

  // Copy the releases.json fixture over to populate the versions cache
  versionsCache = path.join(tmpdir, 'versions.json');
  const filename = path.join(__dirname, 'fixtures', 'releases.json');
  await fs.promises.copyFile(filename, versionsCache);
});

afterAll(() => {
  fs.rmSync(tmpdir, { recursive: true, force: true });
});

async function createFakeRunner({
  pathToExecutable = '/path/to/electron/executable',
  generatedFiddle = {
    source: 'https://gist.github.com/642fa8daaebea6044c9079e3f8a46390.git',
    mainPath: '/path/to/fiddle/',
  },
}: FakeRunnerOpts) {
  const runner = await Runner.create({
    installer: {
      install: vi.fn().mockResolvedValue(pathToExecutable),
    } as Pick<Installer, 'install'> as Installer,
    fiddleFactory: {
      create: vi
        .fn()
        .mockImplementation((_, options?: FiddleFactoryCreateOptions) => {
          if (options?.packAsAsar)
            return Promise.resolve({
              ...generatedFiddle,
              mainPath: '/path/to/fiddle/app.asar',
            });
          return Promise.resolve(generatedFiddle);
        }),
    } as Pick<FiddleFactory, 'create'> as FiddleFactory,
    paths: {
      versionsCache,
    },
  });

  return runner;
}

describe('Runner', () => {
  describe('displayResult()', () => {
    it('returns the correct message for each test result status', () => {
      expect(Runner.displayResult({ status: 'test_passed' })).toBe('🟢 passed');
      expect(Runner.displayResult({ status: 'test_failed' })).toBe('🔴 failed');
      expect(Runner.displayResult({ status: 'test_error' })).toBe(
        '🔵 test error: test did not pass or fail',
      );
      expect(Runner.displayResult({ status: 'system_error' })).toBe(
        '🟠 system error: test did not pass or fail',
      );
    });
  });

  describe('create()', () => {
    it('creates a Runner object with the expected properties', async () => {
      const runner = await Runner.create();
      expect(Object.keys(runner).sort()).toEqual([
        'fiddleFactory',
        'installer',
        'osInfo',
        'spawnInfo',
        'versions',
      ]);
    });
  });

  describe('spawn()', () => {
    it('spawns a subprocess and prints debug information to stdout', async () => {
      const runner = await createFakeRunner({});

      vi.mocked(child_process.spawn).mockReturnValueOnce(
        mockSubprocess as unknown as child_process.ChildProcess,
      );

      await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
        out: {
          write: mockStdout,
        } as Pick<Writable, 'write'> as Writable,
      });
      expect(child_process.spawn).toHaveBeenCalledTimes(1);
      expect(child_process.spawn).toHaveBeenCalledWith(
        '/path/to/electron/executable',
        ['/path/to/fiddle/'],
        {
          args: [],
          headless: false,
          out: expect.any(Object) as Writable,
          showConfig: true,
        },
      );

      expect(mockSubprocess.stderr.pipe).toHaveBeenCalledWith({
        write: mockStdout,
      });
      expect(mockSubprocess.stdout.pipe).toHaveBeenCalledWith({
        write: mockStdout,
      });
      expect(mockStdout).toHaveBeenCalledTimes(1);
    });

    (process.platform === 'linux' ? it : it.skip)(
      'can spawn a subprocess in headless mode on Linux',
      async function () {
        const runner = await createFakeRunner({});
        vi.mocked(child_process.spawn).mockReturnValueOnce(
          mockSubprocess as unknown as child_process.ChildProcess,
        );

        await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
          headless: true,
          out: {
            write: mockStdout,
          } as Pick<Writable, 'write'> as Writable,
        });
        expect(child_process.spawn).toHaveBeenCalledTimes(1);
        expect(child_process.spawn).toHaveBeenCalledWith(
          'xvfb-run',
          [
            '--auto-servernum',
            '/path/to/electron/executable',
            '/path/to/fiddle/',
          ],
          {
            args: [],
            headless: true,
            out: expect.any(Object) as Writable,
            showConfig: true,
          },
        );
      },
    );

    it('hides the debug output if showConfig is false', async () => {
      const runner = await createFakeRunner({});
      vi.mocked(child_process.spawn).mockReturnValueOnce(
        mockSubprocess as unknown as child_process.ChildProcess,
      );

      await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
        out: {
          write: mockStdout,
        } as Pick<Writable, 'write'> as Writable,
        showConfig: false,
      });

      expect(mockStdout).not.toHaveBeenCalled();
    });

    it('throws on invalid fiddle', async () => {
      const runner = await createFakeRunner({
        generatedFiddle: null,
      });
      vi.mocked(child_process.spawn).mockReturnValueOnce(
        mockSubprocess as unknown as child_process.ChildProcess,
      );

      await expect(runner.spawn('12.0.1', 'invalid-fiddle')).rejects.toEqual(
        new Error(`Invalid fiddle: "'invalid-fiddle'"`),
      );
    });

    it('spawns a subprocess with ASAR path when runFromAsar is true', async () => {
      const runner = await createFakeRunner({});
      vi.mocked(child_process.spawn).mockReturnValueOnce(
        mockSubprocess as unknown as child_process.ChildProcess,
      );

      await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
        out: {
          write: mockStdout,
        } as Pick<Writable, 'write'> as Writable,
        runFromAsar: true,
      });

      expect(child_process.spawn).toHaveBeenCalledTimes(1);
      expect(child_process.spawn).toHaveBeenCalledWith(
        '/path/to/electron/executable',
        ['/path/to/fiddle/app.asar'],
        expect.anything(),
      );
    });
  });

  describe('run()', () => {
    it.each([
      ['test_passed', 'exit', 0],
      ['test_failed', 'exit', 1],
      ['test_error', 'exit', 999],
      ['system_error', 'error', 1],
    ])(
      'can handle a test with the `%s` status',
      async (status, event, exitCode) => {
        const runner = await Runner.create();
        const fakeSubprocess = new EventEmitter();
        runner.spawn = vi.fn().mockResolvedValue(fakeSubprocess);

        // delay to ensure that the listeners in run() are set up.
        process.nextTick(() => {
          fakeSubprocess.emit(event, exitCode);
        });

        const result = await runner.run('fake', 'parameters');
        expect(result).toStrictEqual({ status });
      },
    );
  });

  describe('bisect()', () => {
    it('can bisect a test (right side range)', async () => {
      const runner = await createFakeRunner({});
      const resultMap: Map<string, TestResult> = new Map([
        ['12.0.0', { status: 'test_passed' }],
        ['12.0.1', { status: 'test_passed' }],
        ['12.0.2', { status: 'test_passed' }],
        ['12.0.3', { status: 'test_passed' }],
        ['12.0.4', { status: 'test_passed' }],
        ['12.0.5', { status: 'test_failed' }],
      ]);
      runner.run = vi.fn((version) => {
        return new Promise<TestResult>((resolve) =>
          resolve(resultMap.get(version as string)!),
        );
      });

      const result = await runner.bisect(
        '12.0.0',
        '12.0.5',
        '642fa8daaebea6044c9079e3f8a46390',
      );
      expect(result).toStrictEqual({
        range: ['12.0.4', '12.0.5'],
        status: 'bisect_succeeded',
      });
    });

    it('can bisect a test (left side range)', async () => {
      const runner = await createFakeRunner({});
      const resultMap: Map<string, TestResult> = new Map([
        ['12.0.0', { status: 'test_passed' }],
        ['12.0.1', { status: 'test_passed' }],
        ['12.0.2', { status: 'test_failed' }],
        ['12.0.3', { status: 'test_failed' }],
        ['12.0.4', { status: 'test_failed' }],
        ['12.0.5', { status: 'test_failed' }],
      ]);
      runner.run = vi.fn((version) => {
        return new Promise<TestResult>((resolve) =>
          resolve(resultMap.get(version as string)!),
        );
      });

      const result = await runner.bisect(
        '12.0.0',
        '12.0.5',
        '642fa8daaebea6044c9079e3f8a46390',
      );
      expect(result).toStrictEqual({
        range: ['12.0.1', '12.0.2'],
        status: 'bisect_succeeded',
      });
    });

    it('can handle the trivial case', async () => {
      const runner = await createFakeRunner({});
      const resultMap: Map<string, TestResult> = new Map([
        ['12.0.0', { status: 'test_passed' }],
        ['12.0.1', { status: 'test_failed' }],
      ]);
      runner.run = vi.fn((version) => {
        return new Promise<TestResult>((resolve) =>
          resolve(resultMap.get(version as string)!),
        );
      });

      const result = await runner.bisect(
        '12.0.0',
        '12.0.1',
        '642fa8daaebea6044c9079e3f8a46390',
      );

      expect(result).toStrictEqual({
        range: ['12.0.0', '12.0.1'],
        status: 'bisect_succeeded',
      });
    });

    it('throws on invalid fiddle', async () => {
      const runner = await createFakeRunner({
        generatedFiddle: null,
      });

      await expect(
        runner.bisect('12.0.0', '12.0.5', 'invalid-fiddle'),
      ).rejects.toEqual(new Error(`Invalid fiddle: "'invalid-fiddle'"`));
    });

    it.each([['test_error' as const], ['system_error' as const]])(
      'returns %s status if encountered during a test',
      async (status) => {
        const runner = await createFakeRunner({});
        const resultMap: Map<string, TestResult> = new Map([
          ['12.0.0', { status }],
          ['12.0.1', { status }],
          ['12.0.2', { status }],
        ]);
        runner.run = vi.fn((version) => {
          return new Promise<TestResult>((resolve) =>
            resolve(resultMap.get(version as string)!),
          );
        });

        const result = await runner.bisect(
          '12.0.0',
          '12.0.2',
          '642fa8daaebea6044c9079e3f8a46390',
        );

        expect(result).toStrictEqual({ status });
      },
    );

    it.todo('returns a system_error if no other return condition was met');
  });
});
