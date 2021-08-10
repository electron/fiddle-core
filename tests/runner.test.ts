/* eslint @typescript-eslint/no-unsafe-assignment:1 */

import { Runner } from '../src/index';
import child_process from 'child_process';

jest.mock('child_process');

const mockStdout = jest.fn();

const mockSubprocess = {
  on: jest.fn(),
  stdout: {
    on: jest.fn(),
    pipe: jest.fn(),
  },
  stderr: {
    on: jest.fn(),
    pipe: jest.fn(),
  },
};

describe('Runner', () => {
  describe('create()', () => {
    it('creates a Runner object with the expected properties', async () => {
      const runner = await Runner.create({});
      expect(Object.keys(runner)).toEqual([
        'installer',
        'versions',
        'fiddleFactory',
        'osInfo',
        'spawnInfo',
      ]);
    });
  });

  describe('spawn()', () => {
    it('spawns a subprocess and prints debug information to stdout', async () => {
      const runner = await Runner.create({
        installer: {
          install: jest.fn().mockResolvedValue('/path/to/electron/executable'),
        } as any,
        fiddleFactory: {
          create: jest.fn().mockResolvedValue({
            source:
              'https://gist.github.com/642fa8daaebea6044c9079e3f8a46390.git',
            mainPath: '/path/to/fiddle/',
          }),
        } as any,
      });
      (child_process.spawn as jest.Mock).mockReturnValueOnce(mockSubprocess);

      await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
        out: {
          write: mockStdout,
        } as any,
      });
      expect(child_process.spawn).toHaveBeenCalledTimes(1);
      expect(child_process.spawn).toHaveBeenCalledWith(
        '/path/to/electron/executable',
        ['/path/to/fiddle/'],
        {
          args: [],
          headless: false,
          out: expect.any(Object),
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
        const runner = await Runner.create({
          installer: {
            install: jest
              .fn()
              .mockResolvedValue('/path/to/electron/executable'),
          } as any,
          fiddleFactory: {
            create: jest.fn().mockResolvedValue({
              source:
                'https://gist.github.com/642fa8daaebea6044c9079e3f8a46390.git',
              mainPath: '/path/to/fiddle/',
            }),
          } as any,
        });
        (child_process.spawn as jest.Mock).mockReturnValueOnce(mockSubprocess);

        await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
          headless: true,
          out: {
            write: mockStdout,
          } as any,
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
            out: expect.any(Object),
            showConfig: true,
          },
        );
      },
    );

    it('hides the debug output if showConfig is false', async () => {
      const runner = await Runner.create({
        installer: {
          install: jest.fn().mockResolvedValue('/path/to/electron/executable'),
        } as any,
        fiddleFactory: {
          create: jest.fn().mockResolvedValue({
            source:
              'https://gist.github.com/642fa8daaebea6044c9079e3f8a46390.git',
            mainPath: '/path/to/fiddle/',
          }),
        } as any,
      });
      (child_process.spawn as jest.Mock).mockReturnValueOnce(mockSubprocess);

      await runner.spawn('12.0.1', '642fa8daaebea6044c9079e3f8a46390', {
        out: {
          write: mockStdout,
        },
        showConfig: false,
      } as any);

      expect(mockStdout).not.toHaveBeenCalled();
    });

    it('throws on invalid fiddle', async () => {
      const runner = await Runner.create({
        installer: {
          install: jest.fn().mockResolvedValue('/path/to/electron/executable'),
        } as any,
        fiddleFactory: {
          create: jest.fn(), // factory returns undefined
        } as any,
      });

      await expect(runner.spawn('12.0.1', 'invalid-fiddle')).rejects.toEqual(
        new Error(`Invalid fiddle: "'invalid-fiddle'"`),
      );
    });
  });
});
