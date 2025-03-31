import { FiddleFactory, Fiddle } from '../src/fiddle';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('FiddleFactory', () => {
  it('should package a Fiddle as ASAR when packAsAsar is true', async () => {
    const fiddlePath = path.join(__dirname, 'testFiddle');
    await fs.ensureDir(fiddlePath);
    await fs.writeFile(path.join(fiddlePath, 'main.js'), 'console.log("Hello World");');

    const factory = new FiddleFactory(DefaultPaths.fiddles, true);
    const fiddle = await factory.fromFolder(fiddlePath);

    expect(fiddle?.mainPath).toBe(`${fiddlePath}.asar`);
    expect(await fs.pathExists(fiddle.mainPath)).toBe(true);
  });

  it('should not package a Fiddle as ASAR when packAsAsar is false', async () => {
    const fiddlePath = path.join(__dirname, 'testFiddle');
    await fs.ensureDir(fiddlePath);

    const factory = new FiddleFactory(DefaultPaths.fiddles, false);
    const fiddle = await factory.fromFolder(fiddlePath);

    expect(fiddle?.mainPath).toBe(path.join(fiddlePath, 'main.js'));
    expect(await fs.pathExists(fiddle.mainPath)).toBe(true);
  });
});
