import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { seedCodexHome, writeCodexSandboxMode } from '../../src/process/task/codexConfig';

async function makeTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe('codexConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
  });

  it('seedCodexHome copies only the minimal auth and config files', async () => {
    const sourceHome = await makeTempDir('codex-source-');
    const targetHome = await makeTempDir('codex-target-');
    tempDirs.push(sourceHome, targetHome);

    await fs.writeFile(path.join(sourceHome, 'auth.json'), '{"token":"test"}', 'utf8');
    await fs.writeFile(path.join(sourceHome, 'cap_sid'), 'cap', 'utf8');
    await fs.writeFile(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.4"\n', 'utf8');
    await fs.writeFile(path.join(sourceHome, 'installation_id'), 'install-id', 'utf8');
    await fs.writeFile(path.join(sourceHome, 'AGENTS.md'), 'global instructions', 'utf8');

    await seedCodexHome(targetHome, { sourceCodexHome: sourceHome });

    await expect(fs.readFile(path.join(targetHome, 'auth.json'), 'utf8')).resolves.toContain('token');
    await expect(fs.readFile(path.join(targetHome, 'cap_sid'), 'utf8')).resolves.toBe('cap');
    await expect(fs.readFile(path.join(targetHome, 'config.toml'), 'utf8')).resolves.toContain('gpt-5.4');
    await expect(fs.readFile(path.join(targetHome, 'installation_id'), 'utf8')).resolves.toBe('install-id');
    await expect(fs.access(path.join(targetHome, 'AGENTS.md'))).rejects.toThrow();
  });

  it('writeCodexSandboxMode writes config into the provided CODEX_HOME instead of the user home', async () => {
    const targetHome = await makeTempDir('codex-write-');
    tempDirs.push(targetHome);

    await fs.writeFile(path.join(targetHome, 'config.toml'), 'model = "gpt-5.4"\n', 'utf8');

    await writeCodexSandboxMode('workspace-write', targetHome);

    const content = await fs.readFile(path.join(targetHome, 'config.toml'), 'utf8');
    expect(content).toContain('sandbox_mode = "workspace-write"');
    expect(content).toContain('model = "gpt-5.4"');
  });
});
