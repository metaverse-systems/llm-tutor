import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { execa } from 'execa';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../../..');
const fixturesDir = resolve(currentDir, '__fixtures__/formatter');

const cssFixture = resolve(fixturesDir, 'frontier.css');
const scssFixture = resolve(fixturesDir, 'frontier.scss');

let workDir: string;

async function formatWithPrettier(sourcePath: string, targetPath: string) {
  const contents = await readFile(sourcePath, 'utf8');
  const formatted = await prettier.format(contents, { filepath: targetPath });
  await cp(sourcePath, targetPath);
  return formatted;
}

describe('css formatter workflow', () => {
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'llm-tutor-formatter-'));
  });

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('rewrites CSS and SCSS files via format:css workspace script', async () => {
    const cssTarget = resolve(workDir, 'frontier.css');
    const scssTarget = resolve(workDir, 'frontier.scss');

    const expectedCss = await formatWithPrettier(cssFixture, cssTarget);
    const expectedScss = await formatWithPrettier(scssFixture, scssTarget);

    await execa(
      'npm',
      [
        'run',
        'format:css',
        '--workspace',
        '@metaverse-systems/llm-tutor-frontend',
        '--',
        cssTarget,
        scssTarget
      ],
      {
        cwd: repoRoot,
        stderr: 'pipe'
      }
    );

    const formattedCss = await readFile(cssTarget, 'utf8');
    const formattedScss = await readFile(scssTarget, 'utf8');

    expect(formattedCss).toBe(expectedCss);
    expect(formattedScss).toBe(expectedScss);
  });
});
