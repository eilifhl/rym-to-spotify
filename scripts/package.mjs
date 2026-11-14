import { mkdtempSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'rym-package-'));
const extensionFiles = ['manifest.json', 'README.md', ...readdirSync('src').map(name => `src/${name}`)];
const sourceFiles = [...extensionFiles, 'package.json', 'package-lock.json', '.gitignore',
  ...['scripts', 'tests'].flatMap(folder => readdirSync(folder).map(name => `${folder}/${name}`))];
for (const [name, files] of [['extension.zip', extensionFiles], ['source-code.zip', sourceFiles]]) {
  const archive = join(directory, name);
  const result = spawnSync('zip', ['-q', archive, ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  copyFileSync(archive, name);
  console.log(`Packaged ${name}`);
}
