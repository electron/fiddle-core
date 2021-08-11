import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import nock, { Scope } from 'nock';

import { InstallStateEvent, Installer, Paths } from '../src/index';

describe('Installer', () => {
  let tmpdir: string;
  let paths: Partial<Paths>;
  let nockScope: Scope;
  let installer: Installer;
  const version12 = '12.0.15' as const;
  const version13 = '13.1.7' as const;
  const version = version13;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiddle-core-'));
    paths = {
      electronDownloads: path.join(tmpdir, 'downloads'),
      electronInstall: path.join(tmpdir, 'install'),
    };
    installer = new Installer(paths);

    const fixture = (name: string) => path.join(__dirname, 'fixtures', name);
    nock.disableNetConnect();
    nockScope = nock('https://github.com:443');
    nockScope
      .get(/electron-v13.1.7-.*\.zip$/)
      .replyWithFile(200, fixture('electron-v13.1.7.zip'), {
        'Content-Type': 'application/zip',
      })
      .get(/electron-v12.0.15-.*\.zip$/)
      .replyWithFile(200, fixture('electron-v12.0.15.zip'), {
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
      const { zipfile: zip1 } = await doDownload(installer, version);
      const { ctimeMs } = await fs.stat(zip1);

      // test that ensureDownloaded() did nothing:
      const { events, zipfile: zip2 } = await doDownload(installer, version);
      expect(zip2).toEqual(zip1);
      expect((await fs.stat(zip2)).ctimeMs).toEqual(ctimeMs);
      expect(events).toStrictEqual([]);
    });
  });

  describe('remove()', () => {
    it('removes a download', async () => {
      // setup: version is already installed
      await doDownload(installer, version);

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([{ version, state: 'missing' }]);
    });

    it('does nothing if the version is missing', async () => {
      // setup: version is not installed
      expect(installer.state(version)).toBe('missing');

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([]);
    });

    it('uninstalls the version if it is installed', async () => {
      // setup: version is installed
      await doInstall(installer, version);

      const { events } = await doRemove(installer, version);
      expect(events).toStrictEqual([{ version, state: 'missing' }]);
      expect(installer.installedVersion).toBe(undefined);
    });
  });

  describe('install()', () => {
    it('downloads a version if necessary', async () => {
      // setup: version is not downloaded
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
      await doDownload(installer, version);
      expect(installer.state(version)).toBe('downloaded');

      const { events } = await doInstall(installer, version);
      expect(events).toStrictEqual([
        { version, state: 'installing' },
        { version, state: 'installed' },
      ]);
    });

    it('does nothing if already installed', async () => {
      await doInstall(installer, version);

      const { events } = await doInstall(installer, version);
      expect(events).toStrictEqual([]);
    });

    it('replaces the previous installation', async () => {
      await doInstall(installer, version12);

      const { events } = await doInstall(installer, version13);

      expect(events).toStrictEqual([
        { version: version13, state: 'downloading' },
        { version: version13, state: 'downloaded' },
        { version: version13, state: 'installing' },
        { version: version12, state: 'downloaded' },
        { version: version13, state: 'installed' },
      ]);
    });
  });

  describe('installedVersion', () => {
    it('returns undefined if no version is installed', () => {
      expect(installer.installedVersion).toBe(undefined);
    });

    it('returns the installed version', async () => {
      expect(installer.installedVersion).toBe(undefined);
      await doInstall(installer, version);
      expect(installer.installedVersion).toBe(version);
    });
  });

  describe('state()', () => {
    it("returns 'installed' if the version is installed", async () => {
      await doInstall(installer, version);
      expect(installer.state(version)).toBe('installed');
    });

    it("returns 'downloaded' if the version is downloaded", async () => {
      await doDownload(installer, version);
      expect(installer.state(version)).toBe('downloaded');
    });

    it("returns 'missing' if the version is not downloaded", () => {
      expect(installer.state(version)).toBe('missing');
    });
  });
});
