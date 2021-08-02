import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import nock, { Scope } from 'nock';

import { InstallStateEvent, Installer, Paths } from '../src/index';

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

  // test helpers

  async function listenWhile(
    installer: Installer,
    func: () => Promise<unknown>,
  ) {
    const events: InstallStateEvent[] = [];
    const listener = (ev: InstallStateEvent) => events.push(ev);
    const event = 'state-changed';
    installer.on(event, listener);
    const result = await func();
    installer.removeListener(event, listener);
    return { events, result };
  }

  async function doRemove(installer: Installer, version: string) {
    const func = () => installer.remove(version);
    const { events } = await listenWhile(installer, func);

    expect(installer.state(version)).toBe('missing');

    return { events };
  }

  async function doInstall(installer: Installer, version: string) {
    const func = () => installer.install(version);
    const { events, result } = await listenWhile(installer, func);
    const exec = result as string;

    expect(installer.state(version)).toBe('installed');
    expect(installer.installedVersion).toBe(version);

    return { events, exec };
  }

  async function doDownload(installer: Installer, version: string) {
    const func = () => installer.ensureDownloaded(version);
    const { events, result } = await listenWhile(installer, func);
    const zipfile = result as string;

    expect(fs.existsSync(zipfile)).toBe(true);
    expect(installer.state(version)).toBe('downloaded');

    return { events, zipfile };
  }

  // tests

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
      expect(installer.state(version)).toBe('missing');

      // test that the zipfile was downloaded
      const { events } = await doDownload(installer, version);
      expect(events).toStrictEqual([
        { version, state: 'downloading' },
        { version, state: 'downloaded' },
      ]);
    });

    it('does nothing if the version is already downloaded', async () => {
      // setup: version is already installed
      const installer = new Installer(paths);
      const { zipfile: zip1 } = await doDownload(installer, version);
      const { ctimeMs } = await fs.stat(zip1);

      // test that ensureDownloaded() did nothing:
      const { events, zipfile: zip2 } = await doDownload(installer, version);
      expect(zip2).toEqual(zip1);
      expect((await fs.stat(zip2)).ctimeMs).toEqual(ctimeMs);
      expect(events).toStrictEqual([]);
    });
  });

  describe('isDownloaded()', () => {
    it('returns false if the version is downloaded', async () => {
      // setup: version is downloaded
      const installer = new Installer(paths);
      await doDownload(installer, version);

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
      // setup: version is already installed
      const installer = new Installer(paths);
      await doDownload(installer, version);

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([{ version, state: 'missing' }]);
    });

    it('does nothing if the version is missing', async () => {
      // setup: version is not installed
      const installer = new Installer(paths);
      expect(installer.state(version)).toBe('missing');

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([]);
    });

    it('uninstalls the version if it is installed', async () => {
      // setup: version is installed
      const installer = new Installer(paths);
      await doInstall(installer, version);

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([{ version, state: 'missing' }]);
      expect(installer.installedVersion).toBe(undefined);
    });
  });

  describe('install()', () => {
    it('downloads a version if necessary', async () => {
      // setup: version is not downloaded
      const installer = new Installer(paths);
      expect(installer.state(version)).toBe('missing');
      expect(installer.installedVersion).toBe(undefined);

      const { events } = await doInstall(installer, version);
      expect(events).toStrictEqual([
        { version, state: 'downloading' },
        { version, state: 'downloaded' },
        { version, state: 'installing' },
        { version, state: 'installed' },
      ]);
    });

    it('unzips a version if necessary', async () => {
      // setup: version is downloaded but not installed
      const installer = new Installer(paths);
      await doDownload(installer, version);
      expect(installer.state(version)).toBe('downloaded');

      const { events } = await doInstall(installer, version);
      expect(events).toStrictEqual([
        { version, state: 'installing' },
        { version, state: 'installed' },
      ]);
    });

    it('does nothing if already installed', async () => {
      const installer = new Installer(paths);
      await doInstall(installer, version);

      const { events } = await doInstall(installer, version);
      expect(events).toStrictEqual([]);
    });
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
