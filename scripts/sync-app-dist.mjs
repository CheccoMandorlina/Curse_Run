import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = process.cwd();
const sourceDir = resolve(rootDir, 'app', 'dist');
const targetDir = resolve(rootDir, 'dist', 'app-dist');

if (!existsSync(sourceDir)) {
  throw new Error(`App build not found at ${sourceDir}. Run app build first.`);
}

mkdirSync(resolve(rootDir, 'dist'), { recursive: true });
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`synced app assets: ${sourceDir} -> ${targetDir}`);
