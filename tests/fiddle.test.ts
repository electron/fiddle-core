import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { Fiddle, FiddleFactory } from '../src/index';

describe('FiddleFactory', () => {
  let tmpdir: string;
  let fiddleDir: string;
  let fiddleFactory: FiddleFactory;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiddle-core-'));
    fiddleDir = path.join(tmpdir, 'fiddles');
    fiddleFactory = new FiddleFactory(fiddleDir);
  });

  afterEach(() => {
    fs.removeSync(tmpdir);
  });

  function fiddleFixture(name: string): string {
    return path.join(__dirname, 'fixtures', 'fiddles', name);
  }

  it.todo('uses the fiddle cache path if none is specified');

  describe('create()', () => {
    it('reads fiddles from local folders', async () => {
      const sourceDir = fiddleFixture('642fa8daaebea6044c9079e3f8a46390');
      const fiddle = await fiddleFactory.create(sourceDir);
      expect(fiddle).toBeTruthy();

      // test that the fiddle is a copy of the original
      const dirname = path.dirname(fiddle!.mainPath);
      expect(dirname).not.toEqual(sourceDir);

      // test that the fiddle is kept in the fiddle cache
      expect(path.dirname(dirname)).toBe(fiddleDir);

      // test that the file list is identical
      const sourceFiles = fs.readdirSync(sourceDir);
      const fiddleFiles = fs.readdirSync(dirname);
      expect(fiddleFiles).toStrictEqual(sourceFiles);

      // test that the files' contents are identical
      for (const file of fiddleFiles) {
        const sourceFile = path.join(sourceDir, file);
        const fiddleFile = path.join(dirname, file);
        expect(fs.readFileSync(fiddleFile)).toStrictEqual(
          fs.readFileSync(sourceFile),
        );
      }
    });

    it('reads fiddles from entries', async () => {
      const id = 'main.js';
      const content = '"use strict";';
      const files = new Map([[id, content]]);
      const fiddle = await fiddleFactory.create(files.entries());
      expect(fiddle).toBeTruthy();

      // test that the fiddle is kept in the fiddle cache
      const dirname = path.dirname(fiddle!.mainPath);
      expect(path.dirname(dirname)).toBe(fiddleDir);

      // test that the file list is identical
      const sourceFiles = [...files.keys()];
      const fiddleFiles = fs.readdirSync(dirname);
      expect(fiddleFiles).toEqual(sourceFiles);

      // test that the files' contents are identical
      for (const file of fiddleFiles) {
        const source = files.get(file);
        const fiddleFile = path.join(dirname, file);
        const target = fs.readFileSync(fiddleFile, 'utf8');
        expect(target).toEqual(source);
      }
    });

    it('reads fiddles from gists', async () => {
      const gistId = '642fa8daaebea6044c9079e3f8a46390';
      const fiddle = await fiddleFactory.create(gistId);
      expect(fiddle).toBeTruthy();
      expect(fs.existsSync(fiddle!.mainPath)).toBe(true);
      expect(path.basename(fiddle!.mainPath)).toBe('main.js');
      expect(path.dirname(path.dirname(fiddle!.mainPath))).toBe(fiddleDir);
    });

    it('acts as a pass-through when given a fiddle', async () => {
      const fiddleIn = new Fiddle('/main/path', 'source');
      const fiddle = await fiddleFactory.create(fiddleIn);
      expect(fiddle).toBe(fiddleIn);
    });

    it.todo('reads fiddles from git repositories');
    it.todo('refreshes the cache if given a previously-cached git repository');

    it('returns undefined for unknown input', async () => {
      const fiddle = await fiddleFactory.create('fnord');
      expect(fiddle).toBeUndefined();
    });
  });
});

describe('Fiddle', () => {
  describe('remove()', () => {
    it.todo('removes the fiddle');
  });
});
