import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { paths } from '../storage/paths.js';

interface Args {
  out: string;
}

function parseArgs(): Args {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  if (!out) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm export -- --out <file.zip>');
    process.exit(2);
  }
  return { out };
}

async function main() {
  const { out } = parseArgs();
  const dataDir = paths.root();
  if (!fs.existsSync(dataDir)) {
    // eslint-disable-next-line no-console
    console.error(`Data dir not found: ${dataDir}`);
    process.exit(1);
  }
  const outAbs = path.resolve(out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  // Try 7z first (better compression for mixed content); fall back to zip via powershell on Windows.
  const sevenZip = spawnSync('7z', ['a', '-r', '-y', outAbs, '.'], {
    cwd: dataDir,
    stdio: 'inherit',
  });
  if (sevenZip.status === 0) {
    // eslint-disable-next-line no-console
    console.log(`✅ Exported ${dataDir} → ${outAbs}`);
    return;
  }

  // Fallback: tar.gz (works on Linux/macOS and Windows 10+ with tar.exe)
  const tarOut = outAbs.replace(/\.zip$/i, '.tar.gz');
  const tar = spawnSync('tar', ['-czf', tarOut, '.'], {
    cwd: dataDir,
    stdio: 'inherit',
  });
  if (tar.status === 0) {
    // eslint-disable-next-line no-console
    console.log(`✅ Exported ${dataDir} → ${tarOut} (7z not available, used tar.gz)`);
    return;
  }

  // Last resort: PowerShell Compress-Archive
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path '${dataDir}\\*' -DestinationPath '${outAbs}' -Force`,
    ],
    { stdio: 'inherit' },
  );
  if (ps.status === 0) {
    // eslint-disable-next-line no-console
    console.log(`✅ Exported ${dataDir} → ${outAbs} (PowerShell Compress-Archive)`);
    return;
  }

  // eslint-disable-next-line no-console
  console.error('No archiver available. Tried: 7z, tar, PowerShell Compress-Archive.');
  process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});