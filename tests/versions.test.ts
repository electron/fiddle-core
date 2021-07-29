import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';

import { BaseVersions } from '../src/versions';

describe('BaseVersions', () => {
  let testVersions: BaseVersions;

  beforeEach(async () => {
    const filename = path.join(__dirname, 'fixtures', 'releases.json');
    const json = (await fs.readJson(filename)) as unknown;
    testVersions = new BaseVersions(json);
  });

  describe('.versions', () => {
    it('returns the expected versions', () => {
      const { versions } = testVersions;
      expect(versions.length).toBe(1061);
      expect(versions).toContainEqual(expect.objectContaining({ version: '13.0.1' }));
      expect(versions).not.toContainEqual(expect.objectContaining({ version: '13.0.2' }));
    });
  });

  describe('majors', () => {
    it('returns the expected prerelease majors', () => {
      const { prereleaseMajors } = testVersions;
      expect(prereleaseMajors).toEqual([14, 15, 16]);
    });

    it('returns stable majors in sorted order', () => {
      const { stableMajors } = testVersions;
      expect(stableMajors).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    });

    it('returns supported majors in sorted order', () => {
      const { supportedMajors } = testVersions;
      expect(supportedMajors).toEqual([10, 11, 12, 13]);
    });

    it('returns obsolete majors in sorted order', () => {
      const { obsoleteMajors } = testVersions;
      expect(obsoleteMajors).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('latest', () => {
    it('returns the latest release', () => {
      expect(testVersions.latest).not.toBe(undefined);
      expect(testVersions.latest!.version).toBe('16.0.0-nightly.20210726');
    });
  });

  describe('latestStable', () => {
    it('returns the latest stable release', () => {
      expect(testVersions.latestStable).not.toBe(undefined);
      expect(testVersions.latestStable!.version).toBe('13.1.7');
    });
  });

  describe('inRange()', () => {
    it('returns all the versions in a range', () => {
      let range = testVersions.inRange('12.0.0', '12.0.15');
      expect(range.length).toBe(16);
      expect(range.shift()!.version).toBe('12.0.0');
      expect(range.pop()!.version).toBe('12.0.15');

      range = testVersions.inRange(semver.parse('12.0.0')!, semver.parse('12.0.15')!);
      expect(range.length).toBe(16);
      expect(range.shift()!.version).toBe('12.0.0');
      expect(range.pop()!.version).toBe('12.0.15');
    });
  });

  describe('inMajor()', () => {
    it('returns all the versions in a branch', () => {
      const range = testVersions.inMajor(10);
      expect(range.length).toBe(101);
      expect(range.shift()!.version).toBe('10.0.0-nightly.20200209');
      expect(range.pop()!.version).toBe('10.4.7');
    });
  });

  describe('isVersion()', () => {
    it('returns true for existing versions', () => {
      expect(testVersions.isVersion('13.0.1')).toBe(true);
      expect(testVersions.isVersion('13.0.2')).toBe(false);
      expect(testVersions.isVersion(semver.parse('13.0.1')!)).toBe(true);
      expect(testVersions.isVersion(semver.parse('13.0.2')!)).toBe(false);
    });
  });

  describe('getLatestVersion()', () => {
    it('returns the latest version', () => {
      const latest = '16.0.0-nightly.20210726';
      expect(testVersions.latest).not.toBe(undefined);
      expect(testVersions.latest!.version).toBe(latest);
    });
  });

  describe('getVersionsInRange', () => {
    it('includes the expected versions', () => {
      const first = '10.0.0';
      const last = '11.0.0';
      const expected = [
        '10.0.0',
        '10.0.1',
        '10.1.0',
        '10.1.1',
        '10.1.2',
        '10.1.3',
        '10.1.4',
        '10.1.5',
        '10.1.6',
        '10.1.7',
        '10.2.0',
        '10.3.0',
        '10.3.1',
        '10.3.2',
        '10.4.0',
        '10.4.1',
        '10.4.2',
        '10.4.3',
        '10.4.4',
        '10.4.5',
        '10.4.6',
        '10.4.7',
        '11.0.0-nightly.20200525',
        '11.0.0-nightly.20200526',
        '11.0.0-nightly.20200529',
        '11.0.0-nightly.20200602',
        '11.0.0-nightly.20200603',
        '11.0.0-nightly.20200604',
        '11.0.0-nightly.20200609',
        '11.0.0-nightly.20200610',
        '11.0.0-nightly.20200611',
        '11.0.0-nightly.20200615',
        '11.0.0-nightly.20200616',
        '11.0.0-nightly.20200617',
        '11.0.0-nightly.20200618',
        '11.0.0-nightly.20200619',
        '11.0.0-nightly.20200701',
        '11.0.0-nightly.20200702',
        '11.0.0-nightly.20200703',
        '11.0.0-nightly.20200706',
        '11.0.0-nightly.20200707',
        '11.0.0-nightly.20200708',
        '11.0.0-nightly.20200709',
        '11.0.0-nightly.20200716',
        '11.0.0-nightly.20200717',
        '11.0.0-nightly.20200720',
        '11.0.0-nightly.20200721',
        '11.0.0-nightly.20200723',
        '11.0.0-nightly.20200724',
        '11.0.0-nightly.20200729',
        '11.0.0-nightly.20200730',
        '11.0.0-nightly.20200731',
        '11.0.0-nightly.20200803',
        '11.0.0-nightly.20200804',
        '11.0.0-nightly.20200805',
        '11.0.0-nightly.20200811',
        '11.0.0-nightly.20200812',
        '11.0.0-nightly.20200822',
        '11.0.0-nightly.20200824',
        '11.0.0-nightly.20200825',
        '11.0.0-nightly.20200826',
        '11.0.0-beta.1',
        '11.0.0-beta.3',
        '11.0.0-beta.4',
        '11.0.0-beta.5',
        '11.0.0-beta.6',
        '11.0.0-beta.7',
        '11.0.0-beta.8',
        '11.0.0-beta.9',
        '11.0.0-beta.11',
        '11.0.0-beta.12',
        '11.0.0-beta.13',
        '11.0.0-beta.16',
        '11.0.0-beta.17',
        '11.0.0-beta.18',
        '11.0.0-beta.19',
        '11.0.0-beta.20',
        '11.0.0-beta.22',
        '11.0.0-beta.23',
        '11.0.0',
      ] as const;

      let sems = testVersions.inRange(first, last);
      expect(sems.map((sem) => sem.version)).toEqual(expected);
      sems = testVersions.inRange(last, first);
      expect(sems.map((sem) => sem.version)).toEqual(expected);
    });
  });
});
