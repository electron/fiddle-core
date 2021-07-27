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
```

## API

### Hello World

```ts
import { Fiddles, Runner } from 'electron-fiddle-runner';

const fiddle = await Fiddles.from('/path/to/fiddle'));
const runner = await Runner.create();
const testResult = await runner.test(versionString, fiddle, process.stdout);
console.log(testResult.status);
```

### Getting a Fiddle

```ts
import { Fiddles } from 'electron-fiddle-runner';

// load a fiddle from a local directory
let fiddle = await Fiddles.from('/path/to/fiddle'));

// ...or from a gist
fiddle = await Fiddles.from('642fa8daaebea6044c9079e3f8a46390'));

// ...or from a git repo
fiddle = await Fiddles.from('https://github.com/my/testcase.git'));

// ...or from memory
fiddle = await Fiddles.fromMem(new Map<string, string>([
  ['main.js', '// main.js'],
]));
```

### Running Fiddles

```
import { Fiddles, Runner } from 'electron-fiddle-runner';

const runner = await Runner.create();

// lower-level utils to spawn a fiddle
const result = await runner.spawnSync(versionString, fiddle, nodeSpawnSyncOpts);
const child = await runner.spawn(versionString, fiddle, nodeSpawnOpts);

// ...or test a fiddle
const testResult = await runner.test(versionString, fiddle, process.stdout);

// ...or bisect a fiddle
const range = [versionString1, versionString2];
const bisectResult = await runner.bisect(range, fiddle, process.stdout);
```

### Electron Installations

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
// expect(versions).toInclude('12.0.0'));
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

### Using Local Builds

```ts
import { Fiddles, Runner } from 'electron-fiddle-runner';

const fiddle = await Fiddles.from('/path/to/fiddle'));
const runner = await Runner.create();
const testResult = await runner.test('/path/to/electron/build', fiddle, process.stdout);
```

### Using Custom Paths

```ts
import { Paths, FiddleFactory, Electron, Runner } from 'electron-fiddle-runner';

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

const runner = await Runner.create(paths);
const fiddles = new FiddleFactory(paths);
const child = await runner.spawn(versionString, fiddles.create('/path/to/fiddle'));
```

