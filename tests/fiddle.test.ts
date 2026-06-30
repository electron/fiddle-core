import os from 'node:os';
import path from 'node:path';

import * as asar from '@electron/asar';
import fs from 'graceful-fs';
import nock, { Scope } from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Fiddle, FiddleFactory } from '../src/index.js';

const GITHUB_API = 'https://api.github.com';

describe('FiddleFactory', () => {
  let tmpdir: string;
  let fiddleDir: string;
  let fiddleFactory: FiddleFactory;

  beforeEach(async () => {
    tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fiddle-core-'));
    fiddleDir = path.join(tmpdir, 'fiddles');
    fiddleFactory = new FiddleFactory(fiddleDir);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpdir, { recursive: true, force: true });
    nock.cleanAll();
    nock.enableNetConnect();
    delete process.env.FIDDLE_CORE_GITHUB_TOKEN;
  });

  // Mock the GitHub REST API responses used by `fromRepo`. The repo is
  // expected to have a single `main.js` file in its root.
  function mockRepo(
    scope: Scope,
    {
      owner,
      repo,
      ref,
      defaultBranch,
      content = '"use strict";',
    }: {
      owner: string;
      repo: string;
      ref: string;
      defaultBranch?: string;
      content?: string;
    },
  ): void {
    if (defaultBranch !== undefined) {
      scope.get(`/repos/${owner}/${repo}`).reply(200, { default_branch: defaultBranch });
    }
    scope
      .get(`/repos/${owner}/${repo}/contents`)
      .query({ ref })
      .reply(200, [{ type: 'file', name: 'main.js', path: 'main.js' }]);
    scope
      .get(`/repos/${owner}/${repo}/contents/main.js`)
      .query({ ref })
      .reply(200, {
        type: 'file',
        name: 'main.js',
        path: 'main.js',
        encoding: 'base64',
        content: Buffer.from(content).toString('base64'),
      });
  }

  function fiddleFixture(name: string): string {
    return path.join(import.meta.dirname, 'fixtures', 'fiddles', name);
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

      // test that main.js file is created (not app.asar)
      expect(path.basename(fiddle!.mainPath)).toBe('main.js');

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
        expect(fs.readFileSync(fiddleFile)).toStrictEqual(fs.readFileSync(sourceFile));
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

    it('rejects entries with filenames that escape the fiddle directory', async () => {
      const files: [string, string][] = [
        ['main.js', '"use strict";'],
        [path.join('..', '..', 'escaped.txt'), 'pwned'],
      ];
      await expect(fiddleFactory.create(files)).rejects.toThrow(/outside of fiddle/);
      expect(fs.existsSync(path.join(tmpdir, 'escaped.txt'))).toBe(false);
    });

    it('reads fiddles from gists', async () => {
      const gistId = '642fa8daaebea6044c9079e3f8a46390';
      nock.disableNetConnect();
      const scope = nock(GITHUB_API)
        .get(`/gists/${gistId}`)
        .reply(200, {
          files: {
            'main.js': { filename: 'main.js', content: '"use strict";' },
            'index.html': { filename: 'index.html', content: '<!DOCTYPE html>' },
          },
        });

      const fiddle = await fiddleFactory.create(gistId);
      expect(fiddle).toBeTruthy();
      expect(fs.existsSync(fiddle!.mainPath)).toBe(true);
      expect(path.basename(fiddle!.mainPath)).toBe('main.js');
      expect(path.dirname(path.dirname(fiddle!.mainPath))).toBe(fiddleDir);
      expect(scope.isDone()).toBe(true);
    });

    it('acts as a pass-through when given a fiddle', async () => {
      const fiddleIn = new Fiddle('/main/path', 'source');
      const fiddle = await fiddleFactory.create(fiddleIn);
      expect(fiddle).toBe(fiddleIn);
    });

    it('packages fiddle into ASAR archive', async () => {
      const sourceDir = fiddleFixture('642fa8daaebea6044c9079e3f8a46390');
      const fiddle = await fiddleFactory.create(sourceDir, {
        packAsAsar: true,
      });

      function normalizeAsarFiles(files: string[]): string[] {
        return files.map(
          (f) => f.replace(/^[\\/]/, ''), // Remove leading slash or backslash
        );
      }

      // test that app.asar file is created
      expect(fiddle).toBeTruthy();
      expect(path.basename(fiddle!.mainPath)).toBe('app.asar');

      // test that the file list is identical
      const dirname: string = fiddle!.mainPath;
      const sourceFiles = fs.readdirSync(sourceDir);
      const asarFiles = normalizeAsarFiles(asar.listPackage(dirname, { isPack: false }));
      expect(asarFiles).toStrictEqual(sourceFiles);

      // test that the files' contents are identical
      for (const file of sourceFiles) {
        const sourceFileContent = fs.readFileSync(path.join(sourceDir, file), 'utf-8');
        const asarFileContent = asar.extractFile(dirname, file).toString();
        expect(asarFileContent).toStrictEqual(sourceFileContent);
      }
    });

    it('reads fiddles from git repositories', async () => {
      nock.disableNetConnect();
      const scope = nock(GITHUB_API);
      // No checkout given, so the default branch is resolved via the API.
      mockRepo(scope, {
        owner: 'electron',
        repo: 'electron-quick-start',
        ref: 'main',
        defaultBranch: 'main',
      });

      const repo = 'https://github.com/electron/electron-quick-start.git';
      const fiddle = await fiddleFactory.create(repo);
      expect(fiddle).toBeTruthy();
      expect(fs.existsSync(fiddle!.mainPath)).toBe(true);
      expect(path.basename(fiddle!.mainPath)).toBe('main.js');
      expect(path.dirname(path.dirname(fiddle!.mainPath))).toBe(fiddleDir);
      expect(scope.isDone()).toBe(true);
    });

    it('resolves the default branch when it is "main"', async () => {
      nock.disableNetConnect();
      const scope = nock(GITHUB_API);
      mockRepo(scope, {
        owner: 'electron',
        repo: 'main-default',
        ref: 'main',
        defaultBranch: 'main',
      });

      const fiddle = await fiddleFactory.fromRepo('https://github.com/electron/main-default.git');
      expect(fiddle).toBeTruthy();
      expect(scope.isDone()).toBe(true);
    });

    it('resolves the default branch when it is "master"', async () => {
      nock.disableNetConnect();
      const scope = nock(GITHUB_API);
      mockRepo(scope, {
        owner: 'electron',
        repo: 'master-default',
        ref: 'master',
        defaultBranch: 'master',
      });

      const fiddle = await fiddleFactory.fromRepo('https://github.com/electron/master-default.git');
      expect(fiddle).toBeTruthy();
      expect(scope.isDone()).toBe(true);
    });

    it('uses an explicit checkout without resolving the default branch', async () => {
      nock.disableNetConnect();
      // Note: no `default_branch` mock, so the test fails if `repos.get` is
      // called when an explicit checkout is provided.
      const scope = nock(GITHUB_API);
      mockRepo(scope, {
        owner: 'electron',
        repo: 'some-repo',
        ref: 'some-branch',
      });

      const fiddle = await fiddleFactory.fromRepo(
        'https://github.com/electron/some-repo.git',
        'some-branch',
      );
      expect(fiddle).toBeTruthy();
      expect(scope.isDone()).toBe(true);
    });

    it('sends the auth token from FIDDLE_CORE_GITHUB_TOKEN', async () => {
      process.env.FIDDLE_CORE_GITHUB_TOKEN = 'test-token';
      nock.disableNetConnect();
      const scope = nock(GITHUB_API, {
        reqheaders: { authorization: 'token test-token' },
      });
      mockRepo(scope, {
        owner: 'electron',
        repo: 'auth-repo',
        ref: 'main',
        defaultBranch: 'main',
      });

      const fiddle = await fiddleFactory.fromRepo('https://github.com/electron/auth-repo.git');
      expect(fiddle).toBeTruthy();
      // If the authorization header didn't match, nock wouldn't have replied.
      expect(scope.isDone()).toBe(true);
    });

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
