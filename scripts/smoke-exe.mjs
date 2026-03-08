import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const serverExe = resolve(distDir, 'curse-run-server.exe');
const launcherExe = resolve(distDir, 'curse-run-launcher.exe');
const PORT = Number(process.env.EXE_SMOKE_PORT ?? 3021);

function assertExe(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  const size = statSync(path).size;
  if (size < 1_000_000) throw new Error(`${label} too small, likely invalid: ${size} bytes`);
}

async function waitForHealth(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('server exe health timeout');
}

function waitExit(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      reject(new Error('launcher did not exit in time'));
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

assertExe(serverExe, 'server exe');
assertExe(launcherExe, 'launcher exe');

const server = spawn(serverExe, [], {
  cwd: process.cwd(),
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    HEADLESS: '1',
    AUTO_OPEN_BROWSER: '0'
  }
});

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);
  const launcher = spawn(launcherExe, [], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: {
      ...process.env,
      START_LOCAL_SERVER: '0',
      LAUNCH_BROWSER: '0',
      CURSE_RUN_URL: `http://127.0.0.1:${PORT}`
    }
  });
  await waitExit(launcher, 5000);
  console.log('smoke-exe: ok');
} finally {
  try {
    server.kill('SIGTERM');
  } catch {
    // ignore
  }
}
