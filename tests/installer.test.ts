import { Installer, Paths } from '../src/index';

describe('Installer', () => {
  describe('getExecPath()', () => {
    it.todo('returns the right path on Linux');
    it.todo('returns the right path on Windows');
    it.todo('returns the right path on macOS');
  });

  describe('remove()', () => {
    it.todo('removes a download');
    it.todo('does not crash if the version is missing');
    it.todo('returns the same promise if called again while running');
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

  describe('isDownloaded()', () => {
    it.todo('returns true if the version is downloaded');
    it.todo('returns false if the version is not downloaded');
  });

  describe('ensureDownloaded()', () => {
    it.todo('downloads the version if needed');
    it.todo('does nothing if the version is already downloaded');
  });

  describe('state()', () => {
    it.todo("returns 'installed' if the version is installed");
    it.todo("returns 'installing' if the version is being installed");
    it.todo("returns 'downloaded' if the version is downloaded");
    it.todo("returns 'downloading' if the version is being downloaded");
    it.todo("returns 'missing' if the version is not downloaded");
  });
});
