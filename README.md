# Electron-Fiddle-Runner

Run fiddles from anywhere, on any Electron release

## CLI

```sh
# electron-fiddle-runner run ver (gist | repo URL | folder)
# electron-fiddle-runner test ver (gist | repo URL | folder)
# electron-fiddle-runner bisect ver1 ver2 (gist | repo URL | folder)
#
# Examples:

$ electron-fiddle-runner run 12.0.0 /path/to/fiddle
$ electron-fiddle-runner test 12.0.0 642fa8daaebea6044c9079e3f8a46390
$ electron-fiddle-runner bisect 8.0.0 13.0.0 https://github.com/my/testcase.git


$ electron-fiddle-runner bisect 8.0.0 13.0.0 642fa8daaebea6044c9079e3f8a46390
...
🏁 finished bisecting across 438 versions...
# 219 🟢 passed 11.0.0-nightly.20200611 (test #1)
# 328 🟢 passed 12.0.0-beta.12 (test #2)
# 342 🟢 passed 12.0.0-beta.29 (test #5)
# 346 🟢 passed 12.0.1 (test #7)
# 347 🔴 failed 12.0.2 (test #9)
# 348 🔴 failed 12.0.3 (test #8)
# 349 🔴 failed 12.0.4 (test #6)
# 356 🔴 failed 12.0.11 (test #4)
# 383 🔴 failed 13.0.0-nightly.20210108 (test #3)

🏁 Done bisecting
🟢 passed 12.0.1
🔴 failed 12.0.2
Commits between versions:
↔ https://github.com/electron/electron/compare/v12.0.1...v12.0.2
Done in 28.19s.
```

## API

### Hello, World!

```ts
import { Runner } from 'electron-fiddle-runner';

const runner = await Runner.create();
const { status } = await runner.test(versionString, '/path/to/fiddle');
console.log(status);
```

### Running Fiddles

```ts
import { Runner } from 'electron-fiddle-runner';

const runner = await Runner.create();

// run or test a fiddle
let result = await runner.test(versionString, '/path/to/fiddle');
result = await runner.test(versionString, '/path/to/fiddle');

// bisect a fiddle
const range = [versionString1, versionString2];
const bisectResult = await runner.bisect(range, fiddle);

// see alsow `Runner.spawn()` and `Runner.spawnSync()` in Advanced Usage
```

### Managing Electron Installations

```ts
import { Electron } from 'electron-fiddle-runner';

const electron = new Electron();

// download a version of electron
await electron.ensureDownloaded(versionString);
// expect(await electron.isDownloaded(versionString)).toBe(true);
// expect(await electron.downloaded()).toContain(versionString);

// remove a download
await electron.remove(versionString);
// expect(await electron.isDownloaded(versionString)).toBe(false);
// expect(await electron.downloaded()).not.toContain(versionString);

// install a specific version for the runner to use
const exec = await electron.install(versionString);
// expect(await electron.installed()).toBe(versionString);
// expect(await electron.isDownloaded(versionString)).toBe(true);
```

### Versions

```ts
import { Versions } from 'electron-fiddle-runner';

// - querying specific versions
const elvers = await ElectronVersions.create();
// expect(elvers.isVersion('12.0.0')).toBe(true);
// expect(elvers.isVersion('12.99.99')).toBe(false);
const { versions } = elvers;
// expect(versions).find((ver) => ver.version === '12.0.0').not.toBeNull();
// expect(versions[versions.length - 1]).toStrictEqual(elvers.latest);

// - supported major versions
const { supportedMajors } = elvers;
// expect(supportedMajors.length).toBe(4);

// - querying prerelease branches
const { supportedMajors, prereleaseMajors } = elvers;
const newestSupported = Math.max(...supportedMajors);
const oldestPrerelease = Math.min(...prereleaseMajors);
// expect(newestSupported + 1).toBe(oldestPrerelease);

// - get all releases in a range
let range = releases.inRange('12.0.0', '12.0.15');
// expect(range.length).toBe(16);
// expect(range.shift().version).toBe('12.0.0');
// expect(range.pop().version).toBe('12.0.15');

// - get all releases in a branch
range = releases.inBranch(10);
// expect(range.length).toBe(101);
// expect(range.shift().version).toBe('10.0.0-nightly.20200209');
// expect(range.pop().version).toBe('10.4.7');
```

## Advanced Usage

### child_process.Spawn

```ts
import { Runner } from 'electron-fiddle-runner';

// third argument is same as node.spawnSync()'s opts
const result = await runner.spawnSync('12.0.0', fiddle, nodeSpawnSyncOpts);

// third argument is same as node.spawn()'s opts
const child = await runner.spawn('12.0.1', fiddle, nodeSpawnOpts);

// see also `Runner.test()` and `Runner.bisect()` above
```

### Using Local Builds

```ts
import { Runner } from 'electron-fiddle-runner';

const runner = await Runner.create();
const testResult = await runner.test('/path/to/electron/build', fiddle);
```

### Using Custom Paths

```ts
import { Paths, Runner } from 'electron-fiddle-runner';

const paths: Paths = {
  // where to store zipfiles of downloaded electron versions
  electronDownloads: '/tmp/my/electron-downloads',

  // where to install an electron version to be used by the Runner
  electronInstall: '/tmp/my/electron-install',

  // where to save temporary copies of fiddles
  fiddles: '/tmp/my/fiddles',

  // where to save releases fetched from online
  versionsCache: '/tmp/my/releases.json',
});

const runner = await Runner.create({ paths });
const child = await runner.spawn(versionString, fiddle);
```

### Manually Creating Fiddle Objects 

Runner can do this for you; but if you want finer-grained control over
the lifecycle of a Fiddle, you can instantiate them yourself:

```ts
import { DefaultPaths, Fiddle, FiddleFactory } from 'electron-fiddle-runner';

const factory = new FiddleFactory(DefaultPaths.fiddles);

let fiddle: Fiddle;

// load a fiddle from a local directory
fiddle = await factory.from('/path/to/fiddle'));

// ...or from a gist
fiddle = await factory.from('642fa8daaebea6044c9079e3f8a46390'));

// ...or from a git repo
fiddle = await factory.from('https://github.com/my/testcase.git'));

// ...or from memory
fiddle = await factory.from(new Map<string, string>(
  ['main.js', '"use strict";'],
);
```

