import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import nock, { Scope } from 'nock';
import debug from 'debug';
import { inspect } from 'util';

import { Installer, InstallState, Paths } from '../src/index';

describe('Installer', () => {
  let tmpdir: string;
  let paths: Partial<Paths>;
  let nockScope: Scope;
  const version = '13.1.7';

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiddle-runner-'));
    paths = {
      electronDownloads: path.join(tmpdir, 'downloads'),
      electronInstall: path.join(tmpdir, 'install'),
    };

    const fixture = (name: string) => path.join(__dirname, 'fixtures', name);
    nock.disableNetConnect();
    nockScope = nock('https://github.com:443');
    nockScope
      // Note: if/when tests fail on non-Linux platforms, pelase add the
      // needed zipfiles for other platforms instead of writing fakes.
      // Live Electron versions are desirable for the Installer tests
      .get(/electron-v13.1.7-linux-x64\.zip$/)
      .replyWithFile(200, fixture('electron-v13.1.7-linux-x64.zip'), {
        'Content-Type': 'application/zip',
      })
      .get(/SHASUMS256\.txt$/)
      .replyWithFile(200, fixture('SHASUMS256.txt'), {
        'Content-Type': 'text/plain;charset=UTF-8',
      });
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    fs.removeSync(tmpdir);
  });

  describe('getExecPath()', () => {
    it.each([
      ['Linux', 'linux', 'electron'],
      ['Windows', 'win32', 'electron.exe'],
      ['macOS', 'darwin', 'Electron.app/Contents/MacOS/Electron'],
    ])(
      'returns the right path on %s',
      (_, platform: string, expected: string) => {
        const subpath = Installer.execSubpath(platform);
        expect(subpath).toBe(expected);
      },
    );
  });

  describe('ensureDownloaded()', () => {
    it('downloads the version if needed', async () => {
      // setup: version is not installed
      const installer = new Installer(paths);
      const states: Array<{ version: string; state: InstallState }> = [];
      installer.on('state-changed', (version: string, state: InstallState) => {
        states.push({ version, state });
      });
      expect(installer.state(version)).toBe('missing');
      expect(states).toStrictEqual([]);

      // test that the zipfile was downloaded
      const zipfile = await installer.ensureDownloaded(version);
      expect(installer.state(version)).toBe('downloaded');
      expect(fs.existsSync(zipfile));
      expect(states).toStrictEqual([
        { version, state: 'downloading' },
        { version, state: 'downloaded' },
      ]);
    });

    it('does nothing if the version is already downloaded', async () => {
      // setup: version is already installed
      const installer = new Installer(paths);
      const zipfile1 = await installer.ensureDownloaded(version);
      expect(fs.existsSync(zipfile1));
      expect(installer.state(version)).toBe('downloaded');
      const { ctimeMs } = await fs.stat(zipfile1);
      const states: Array<{ version: string; state: InstallState }> = [];
      installer.on('state-changed', (version: string, state: InstallState) => {
        states.push({ version, state });
      });

      // test that ensureDownloaded() did nothing:
      const zipfile2 = await installer.ensureDownloaded(version);
      // ...that the filename did not change
      expect(zipfile2).toEqual(zipfile1);
      // ...that the file's creation time did not change
      expect((await fs.stat(zipfile2)).ctimeMs).toEqual(ctimeMs);
      // ...that no events were fired
      expect(states).toStrictEqual([]);
    });
  });

  describe('isDownloaded()', () => {
    it('returns false if the version is downloaded', async () => {
      // setup: version is downloaded
      const installer = new Installer(paths);
      await installer.ensureDownloaded(version);
      expect(installer.state(version)).toBe('downloaded');

      // test that isDownloaded() is true
      expect(installer.isDownloaded(version)).toBe(true);
    });

    it('returns true if the version is not downloaded', () => {
      // setup: version is not installed
      const installer = new Installer(paths);
      expect(installer.state(version)).toBe('missing');

      // test that isDownloaded() is false
      expect(installer.isDownloaded(version)).toBe(false);
    });
  });

  describe('remove()', () => {
    it('removes a download', async () => {
      const d = debug('fiddle-runner:tests:installer-test:removes-a-download');

      // setup: version is already installed
      const installer = new Installer(paths);
      const zipfile = await installer.ensureDownloaded(version);
      expect(fs.existsSync(zipfile)).toBe(true);
      expect(installer.state(version)).toBe('downloaded');
      const states: Array<{ version: string; state: InstallState }> = [];
      installer.on('state-changed', (version: string, state: InstallState) => {
        states.push({ version, state });
      });

      await installer.remove(version);
      expect(installer.state(version)).toBe('missing');
      expect(fs.existsSync(zipfile)).toBe(false);
      expect(states).toStrictEqual([{ version, state: 'missing' }]);
    });

    it('does nothing if the version is missing', async () => {
      // setup: version is not installed
      const installer = new Installer(paths);
      expect(installer.state(version)).toBe('missing');
      const states: Array<{ version: string; state: InstallState }> = [];
      installer.on('state-changed', (version: string, state: InstallState) => {
        states.push({ version, state });
      });

      // test that calling remove() did nothing...
      await installer.remove(version);
      // ...that the state is still 'missing'
      expect(installer.state(version)).toBe('missing');
      // ...that no events were fired
      expect(states).toStrictEqual([]);
    });

    it('uninstalls the version if it is installed', async () => {
      // setup: version is installed
      const installer = new Installer(paths);
      await installer.install(version);
      expect(installer.state(version)).toBe('installed');
      expect(installer.installedVersion).toBe(version);

      await installer.remove(version);
      expect(installer.state(version)).toBe('missing');
      expect(installer.installedVersion).toBe(undefined);
    });
  });

  describe('install()', () => {
    it.todo('downloads a version if necessary');
    it.todo('unzips a version if necessary');
    it.todo('does nothing if already installed');
  });

  describe('installedVersion', () => {
    it.todo('returns the installed version');
    it.todo('returns undefined if no version is installed');
  });

  describe('state()', () => {
    it.todo("returns 'installed' if the version is installed");
    it.todo("returns 'installing' if the version is being installed");
    it.todo("returns 'downloaded' if the version is downloaded");
    it.todo("returns 'downloading' if the version is being downloaded");
    it.todo("returns 'missing' if the version is not downloaded");
  });
});
