import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../../..');

describe('tailwind build workflow', () => {
  it('executes the tailwind:build workspace script successfully', async () => {
    const result = await execa(
      'npm',
      ['run', 'tailwind:build', '--workspace', '@metaverse-systems/llm-tutor-frontend'],
      {
        cwd: repoRoot,
        stderr: 'pipe'
      }
    );

    expect(result.exitCode).toBe(0);
  });
});
