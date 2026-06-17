/** @internal — not part of @hirobius/design-system public API surface. */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const incomingDir = path.resolve(cwd, 'public/assets/_incoming');
const convertibleExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.bmp',
]);

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    quality: 82,
    keepPng: new Set(),
    files: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--quality') {
      options.quality = Number(argv[i + 1] ?? options.quality);
      i += 1;
      continue;
    }

    if (arg === '--keep-png') {
      const value = argv[i + 1];
      if (value) {
        options.keepPng.add(value.toLowerCase());
        i += 1;
      }
      continue;
    }

    options.files.push(arg);
  }

  return options;
}

function printUsage() {
  console.log(`
Convert images in public/assets/_incoming to WebP.

Usage:
  node scripts/convert-incoming-assets.mjs
  node scripts/convert-incoming-assets.mjs hero-01.png asset-02.jpg
  node scripts/convert-incoming-assets.mjs --keep-png hero-01.png
  node scripts/convert-incoming-assets.mjs --quality 90 --force
  node scripts/convert-incoming-assets.mjs --dry-run

Notes:
  - Converted files are written next to the source file in _incoming.
  - Source files are left in place so you can inspect results before slotting.
  - Use --keep-png <file> for assets that should remain PNG.
  - This script uses the first available encoder from: cwebp, magick, ffmpeg.
`);
}

function commandExists(command) {
  const result = spawnSync(command, ['-version'], {
    stdio: 'ignore',
    shell: true,
  });

  return result.status === 0;
}

function detectEncoder() {
  if (commandExists('cwebp')) {
    return 'cwebp';
  }

  if (commandExists('magick')) {
    return 'magick';
  }

  if (commandExists('ffmpeg')) {
    return 'ffmpeg';
  }

  return null;
}

async function listIncomingFiles() {
  const entries = await readdir(incomingDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(incomingDir, entry.name);
    const fileStat = await stat(filePath);
    files.push({
      name: entry.name,
      path: filePath,
      size: fileStat.size,
      extension: path.extname(entry.name).toLowerCase(),
    });
  }

  return files;
}

function buildEncoderCommand(encoder, inputPath, outputPath, quality) {
  switch (encoder) {
    case 'cwebp':
      return {
        command: 'cwebp',
        args: ['-q', String(quality), inputPath, '-o', outputPath],
      };
    case 'magick':
      return {
        command: 'magick',
        args: [inputPath, '-quality', String(quality), outputPath],
      };
    case 'ffmpeg':
      return {
        command: 'ffmpeg',
        args: ['-y', '-i', inputPath, '-quality', '80', '-compression_level', '6', outputPath],
      };
    default:
      throw new Error(`Unsupported encoder: ${encoder}`);
  }
}

function runConversion(encoder, inputPath, outputPath, quality) {
  const { command, args } = buildEncoderCommand(encoder, inputPath, outputPath, quality);
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  });
}

function shouldConvert(file, options) {
  if (!convertibleExtensions.has(file.extension)) {
    return false;
  }

  if (options.files.length > 0 && !options.files.some((name) => name.toLowerCase() === file.name.toLowerCase())) {
    return false;
  }

  if (options.keepPng.has(file.name.toLowerCase())) {
    return false;
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const options = parseArgs(args);
  const encoder = detectEncoder();
  const files = await listIncomingFiles();
  const candidates = files.filter((file) => shouldConvert(file, options));

  if (files.length === 0) {
    console.log(`No files found in ${incomingDir}`);
    return;
  }

  if (candidates.length === 0) {
    console.log('No convertible files matched the current filters.');
    if (options.keepPng.size > 0) {
      console.log(`Skipped PNG-preserved files: ${Array.from(options.keepPng).join(', ')}`);
    }
    return;
  }

  if (!encoder) {
    console.log('No local WebP encoder found.');
    console.log('Install one of the following free tools, then re-run this script:');
    console.log('- cwebp (libwebp)');
    console.log('- ImageMagick (magick)');
    console.log('- ffmpeg');
    console.log('');
    console.log(`Planned conversions (${candidates.length}):`);
    for (const file of candidates) {
      const outputPath = path.join(incomingDir, `${path.parse(file.name).name}.webp`);
      console.log(`- ${file.name} -> ${path.basename(outputPath)}`);
    }
    return;
  }

  console.log(`Using encoder: ${encoder}`);

  for (const file of candidates) {
    const outputPath = path.join(incomingDir, `${path.parse(file.name).name}.webp`);

    if (!options.force) {
      try {
        await stat(outputPath);
        console.log(`Skipping ${file.name} because ${path.basename(outputPath)} already exists. Use --force to overwrite.`);
        continue;
      } catch {
        // File does not exist, continue.
      }
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${file.name} -> ${path.basename(outputPath)}`);
      continue;
    }

    console.log(`Converting ${file.name} -> ${path.basename(outputPath)}`);
    const result = runConversion(encoder, file.path, outputPath, options.quality);

    if (result.status !== 0) {
      throw new Error(`Conversion failed for ${file.name}`);
    }
  }

  if (options.keepPng.size > 0) {
    console.log(`Preserved as PNG: ${Array.from(options.keepPng).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
