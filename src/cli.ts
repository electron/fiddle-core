import { inspect } from 'util';
import * as fs from 'fs';
import debug from 'debug';

import { Electron } from './electron';
import { ElectronVersions } from './versions';
import { Fiddle, FiddleFactory } from './fiddle';
import { Runner } from './runner';

async function main() {
  const d = debug('fiddle-runner:main');

  const electronVersions = new ElectronVersions();
  const fiddleFactory = new FiddleFactory();
  const runner = new Runner(new Electron(), electronVersions);
  const versions: string[] = [];

  // skip past 'node' and 'cli.js'
  const params = process.argv.slice(process.argv.indexOf(__filename) + 1);

  type Cmd = 'bisect' | 'test' | undefined;
  let cmd: Cmd = undefined;
  let fiddle: Fiddle | undefined = undefined;

  for (const param of params) {
    if (param === 'bisect') {
      cmd = 'bisect';
    } else if (param === 'test') {
      cmd = 'test';
    } else if (await electronVersions.isVersion(param)) {
      versions.push(param);
    } else if (fs.existsSync(param)) {
      fiddle = await fiddleFactory.fromFolder(param);
    } else if (param.startsWith('https://') || param.endsWith('.git')) {
      fiddle = await fiddleFactory.fromRepo(param);
    } else if (/^[0-9A-Fa-f]{32}$/.test(param)) {
      fiddle = await fiddleFactory.fromGist(param);
    } else {
      console.error(
        `Unrecognized parameter "${param}". Must be 'test', 'bisect', a version, a gist, a folder, or a repo URL.`,
      );
      process.exit(1);
    }
  }

  d(inspect({ cmd, fiddle, versions }));

  if (!cmd) {
    console.error(
      "Command-line parameters must include one of ['bisect', 'test']",
    );
    process.exit(1);
  }

  if (!fiddle) {
    console.error('No fiddle specified.');
    process.exit(1);
  }

  if (cmd === 'test') {
    if (versions.length === 1) {
      await runner.test(versions[0], fiddle);
    } else {
      console.error(
        `Test must include exactly one Electron version. Got: ${versions.join(
          ', ',
        )}`,
      );
      process.exit(1);
    }
  } else if (cmd === 'bisect') {
    if (versions.length === 2) {
      await runner.bisect([versions[0], versions[1]], fiddle);
    } else {
      console.error(
        `Test must include exactly two Electron versions. Got: ${versions.join(
          ', ',
        )}`,
      );
      process.exit(1);
    }
  }
}

void main();
