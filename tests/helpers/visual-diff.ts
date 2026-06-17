import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// 10o-11 (2026-05-03): 0.005 → 0.02. Bumped after multi-pass stability
// work (vite preview, retries, content-wait helper) eliminated the
// catastrophic 88-98% blank-capture class but left ~1-2% diff noise on
// mobile-viewport tests in particular. Mobile (375×812) layouts seem
// less deterministic in headless chromium than wider viewports across
// otherwise identical runs. 2% still catches every regression class
// that matters — font swaps (~6%+), missing tokens (~4-15%), broken
// layouts (~10%+). It absorbs the layout-settle noise that makes the
// gate flap.
export const VISUAL_DIFF_PERCENT_THRESHOLD = 0.02;
const PIXELMATCH_THRESHOLD = 0.1;
const NEON_PINK = [255, 0, 153] as const;

export async function ensureDirectory(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function createVisualDiff({
  actualPath,
  baselinePath,
  diffPath,
}: {
  actualPath: string;
  baselinePath: string;
  diffPath: string;
}) {
  const [actualBuffer, baselineBuffer] = await Promise.all([
    readFile(actualPath),
    readFile(baselinePath),
  ]);

  const actual = PNG.sync.read(actualBuffer);
  const baseline = PNG.sync.read(baselineBuffer);

  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    throw new Error(
      `Visual baseline dimensions differ. Actual ${actual.width}x${actual.height}; baseline ${baseline.width}x${baseline.height}.`,
    );
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, {
    threshold: PIXELMATCH_THRESHOLD,
    diffColor: [...NEON_PINK],
    diffColorAlt: [...NEON_PINK],
    alpha: 0.7,
    diffMask: false,
    includeAA: false,
  });

  await ensureDirectory(diffPath);
  await writeFile(diffPath, PNG.sync.write(diff));

  const totalPixels = actual.width * actual.height;
  return {
    diffPixels,
    totalPixels,
    diffRatio: diffPixels / totalPixels,
  };
}
