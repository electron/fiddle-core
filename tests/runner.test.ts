/* eslint @typescript-eslint/no-unsafe-assignment:1 */

import { Runner } from '../src/index';
import child_process from 'child_process';

jest.mock('child_process');

const mockStdout = jest.fn();

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
      (child_process.spawn as jest.Mock).mockReturnValueOnce({
        on: jest.fn(),
        stdout: {
          on: jest.fn(),
          pipe: jest.fn(),
        },
        stderr: {
          on: jest.fn(),
          pipe: jest.fn(),
        },
      });

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
      expect(mockStdout).toHaveBeenCalledTimes(1);
    });
  });
});
