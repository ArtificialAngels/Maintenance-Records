import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { paths } from '../storage/paths.js';

function parseArgs() {
  const inIdx = process.argv.indexOf('--in');
  const inFile = inIdx >= 0 ? process.argv[inIdx + 1] : undefined;
  if (!inFile) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm import -- --in <file.zip|file.tar.gz>');
    process.exit(2);
  }
  return { inFile };
}

async function main() {
  const { inFile } = parseArgs();
  const archive = path.resolve(inFile);
  if (!fs.existsSync(archive)) {
    // eslint-disable-next-line no-console
    console.error(`Archive not found: ${archive}`);
    process.exit(1);
  }
  const dataDir = paths.root();
  fs.mkdirSync(dataDir, { recursive: true });

  const isZip = /\.zip$/i.test(archive);
  const isTar = /\.tar\.gz$|\.tgz$/i.test(archive);

  if (isZip) {
    // Try 7z
    const r = spawnSync('7z', ['x', '-y', '-o' + dataDir, archive], { stdio: 'inherit' });
    if (r.status === 0) {
      // eslint-disable-next-line no-console
      console.log(`✅ Imported ${archive} → ${dataDir} (7z)`);
      return;
    }
    // PowerShell Expand-Archive
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -Path '${archive}' -DestinationPath '${dataDir}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (ps.status === 0) {
      // eslint-disable-next-line no-console
      console.log(`✅ Imported ${archive} → ${dataDir} (PowerShell Expand-Archive)`);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('No extractor available for .zip (need 7z or PowerShell).');
    process.exit(1);
  }

  if (isTar) {
    const r = spawnSync('tar', ['-xzf', archive, '-C', dataDir], { stdio: 'inherit' });
    if (r.status === 0) {
      // eslint-disable-next-line no-console
      console.log(`✅ Imported ${archive} → ${dataDir} (tar)`);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('tar failed.');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.error('Unsupported archive extension. Use .zip or .tar.gz');
  process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});