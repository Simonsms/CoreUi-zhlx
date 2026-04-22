/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isCodexNoSandboxMode } from '@/common/types/codex/codexModes';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, posix, win32 } from 'path';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type SupportedCodexSandboxMode = 'workspace-write' | 'danger-full-access';

const isWindowsStylePath = (value: string): boolean => /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

const getCodexPathApi = (baseDirectory: string) =>
  process.platform === 'win32' || isWindowsStylePath(baseDirectory) ? win32 : posix;

const CODEX_HOME_SEED_FILES = ['auth.json', 'cap_sid', 'config.toml', 'installation_id'] as const;

export function normalizeCodexSandboxMode(sandboxMode?: CodexSandboxMode | null): SupportedCodexSandboxMode {
  return sandboxMode === 'danger-full-access' ? 'danger-full-access' : 'workspace-write';
}

export function getCodexSandboxModeForSessionMode(
  mode?: string | null,
  fallbackMode?: CodexSandboxMode | null
): SupportedCodexSandboxMode {
  if (mode) {
    return isCodexNoSandboxMode(mode) ? 'danger-full-access' : 'workspace-write';
  }

  return normalizeCodexSandboxMode(fallbackMode);
}

export function getDefaultCodexHome(): string {
  const homeDirectory = homedir();
  return getCodexPathApi(homeDirectory).join(homeDirectory, '.codex');
}

export function getCodexConfigPath(codexHome?: string): string {
  const resolvedCodexHome = codexHome?.trim() || process.env.CODEX_HOME?.trim();
  if (resolvedCodexHome) {
    return getCodexPathApi(resolvedCodexHome).join(resolvedCodexHome, 'config.toml');
  }

  return getCodexPathApi(getDefaultCodexHome()).join(getDefaultCodexHome(), 'config.toml');
}

export async function seedCodexHome(targetCodexHome: string, options?: { sourceCodexHome?: string }): Promise<void> {
  const sourceCodexHome = options?.sourceCodexHome?.trim() || getDefaultCodexHome();

  await mkdir(targetCodexHome, { recursive: true });

  for (const fileName of CODEX_HOME_SEED_FILES) {
    const pathApi = getCodexPathApi(sourceCodexHome);
    const sourcePath = pathApi.join(sourceCodexHome, fileName);
    const targetPath = getCodexPathApi(targetCodexHome).join(targetCodexHome, fileName);

    try {
      await copyFile(sourcePath, targetPath);
    } catch {
      // Best effort: missing source files are acceptable for partially configured Codex setups.
    }
  }
}

export async function writeCodexSandboxMode(sandboxMode: CodexSandboxMode, codexHome?: string): Promise<void> {
  const path = getCodexConfigPath(codexHome);
  let content = '';

  try {
    content = await readFile(path, 'utf8');
  } catch {
    content = '';
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const sandboxLine = `sandbox_mode = "${sandboxMode}"`;
  let nextContent: string;

  if (/^\s*sandbox_mode\s*=.*$/m.test(content)) {
    nextContent = content.replace(/^\s*sandbox_mode\s*=.*$/m, sandboxLine);
  } else {
    const sectionIndex = content.search(/^\s*\[/m);

    if (sectionIndex >= 0) {
      const prefix = content.slice(0, sectionIndex).trimEnd();
      const suffix = content.slice(sectionIndex);
      nextContent = prefix
        ? `${prefix}${newline}${sandboxLine}${newline}${newline}${suffix}`
        : `${sandboxLine}${newline}${newline}${suffix}`;
    } else if (content.trim().length > 0) {
      nextContent = `${content.trimEnd()}${newline}${sandboxLine}${newline}`;
    } else {
      nextContent = `${sandboxLine}${newline}`;
    }
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, nextContent, 'utf8');
}
