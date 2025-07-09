#!/usr/bin/env node

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runFromCommandLine } from './command-line.js';

if (
  (await fs.promises.realpath(process.argv[1])) ===
  fileURLToPath(import.meta.url)
) {
  void runFromCommandLine(process.argv.slice(2));
}
