import { inspect } from 'util';
import debug from 'debug';

import { ElectronVersions } from './versions';
import { Fiddle, FiddleFactory } from './fiddle';
import { Runner } from './runner';

export async function runFromCommandLine(argv: string[]): Promise<void> {
  const d = debug('fiddle-runner:runFromCommandLine');

  d(inspect({ argv }));
  const versions = await ElectronVersions.create();
  const fiddleFactory = new FiddleFactory();
  const runner = await Runner.create({ versions, fiddleFactory });
  const versionArgs: string[] = [];

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
    } else if (versions.isVersion(param)) {
      versionArgs.push(param);
    } else {
      fiddle = await fiddleFactory.create(param);
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
    if (versionArgs.length === 1) {
      await runner.test(versionArgs[0], fiddle);
    } else {
      console.error(
        `Test must use one Electron version. Got: ${versionArgs.join(', ')}`,
      );
      process.exit(1);
    }
  } else if (cmd === 'bisect') {
    if (versionArgs.length === 2) {
      await runner.bisect(versionArgs[0], versionArgs[1], fiddle);
    } else {
      console.error(
        `Bisect must use two Electron versions. Got: ${versionArgs.join(', ')}`,
      );
      process.exit(1);
    }
  }
}
