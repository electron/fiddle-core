import { inspect } from 'util';
import debug from 'debug';

import { Electron } from './electron';
import { ElectronVersions } from './versions';
import { Fiddle, Fiddles } from './fiddle';
import { Runner } from './runner';

export async function runFromCommandLine(argv: string[]) {
  const d = debug('fiddle-runner:runFromCommandLine');

  d(inspect({ argv }));
  const elvers = await ElectronVersions.create();
  const runner = new Runner(new Electron(), elvers);
  const versions: string[] = [];

  type Cmd = 'bisect' | 'test' | undefined;
  let cmd: Cmd = undefined;
  let fiddle: Fiddle | undefined = undefined;

  d('argv', inspect(argv));
  for (const param of argv) {
    d('param', param);
    if (param === 'bisect') {
      cmd = 'bisect';
    } else if (param === 'test' || param === 'start' || param === 'run') {
      d('it is test');
      cmd = 'test';
    } else if (elvers.isVersion(param)) {
      versions.push(param);
    } else {
      fiddle = await Fiddles.from(param);
      if (fiddle) continue;
      console.error(
        `Unrecognized parameter "${param}". Must be 'test', 'start', 'bisect', a version, a gist, a folder, or a repo URL.`,
      );
      process.exit(1);
    }
  }

  d(inspect({ cmd, fiddle, versions }));

  if (!cmd) {
    console.error(
      "Command-line parameters must include one of ['bisect', 'test', 'start']",
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
