import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECTS_ROOT = resolve(__dirname, '../data/projects');

export function getProjectsRoot(): string {
  const root = resolve(process.env.SYSML_PROJECTS_ROOT || DEFAULT_PROJECTS_ROOT);
  mkdirSync(root, { recursive: true });
  return root;
}

export function getProjectWorkDir(projectId: string): string {
  return resolve(getProjectsRoot(), projectId);
}

export function ensureProjectWorkDir(projectId: string): string {
  const workDir = getProjectWorkDir(projectId);
  mkdirSync(workDir, { recursive: true });
  return workDir;
}

export function ensureStoredProjectWorkDir(projectId: string, currentWorkDir?: string | null): string {
  const nextWorkDir = currentWorkDir?.trim() || ensureProjectWorkDir(projectId);
  mkdirSync(nextWorkDir, { recursive: true });

  if (!currentWorkDir?.trim()) {
    const now = Date.now();
    getDb()
      .prepare('UPDATE projects SET work_dir = ?, updated_at = ? WHERE id = ?')
      .run(nextWorkDir, now, projectId);
  }

  return nextWorkDir;
}

export function resolveProjectFilePath(workDir: string, projectPath: string): string {
  const segments = projectPath.split('/').filter(Boolean);
  return resolve(workDir, ...segments);
}

export function writeProjectFile(workDir: string, projectPath: string, content: string): string {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
  return absolutePath;
}

export function deleteProjectFile(workDir: string, projectPath: string): void {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

export function isManagedProjectDir(workDir: string): boolean {
  const root = getProjectsRoot();
  const resolvedDir = resolve(workDir);
  if (resolvedDir === root) {
    return false;
  }

  const rel = relative(root, resolvedDir);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function removeProjectWorkDir(workDir: string): void {
  if (!isManagedProjectDir(workDir)) {
    return;
  }

  rmSync(workDir, { recursive: true, force: true });
}