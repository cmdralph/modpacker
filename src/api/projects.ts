import type { ModSource, ProjectDetails, Profile, VersionOption } from '../types';
import { getCurseForgeDetails, listCurseForgeVersionOptions } from './curseforge';
import { getModrinthDetails, listModrinthVersionOptions } from './modrinth';

export function getProjectDetails(source: ModSource, projectId: string, signal?: AbortSignal): Promise<ProjectDetails> {
  return source === 'modrinth' ? getModrinthDetails(projectId, signal) : getCurseForgeDetails(projectId, signal);
}

/** Every file of the project that fits the profile, newest first. */
export function listVersionOptions(source: ModSource, projectId: string, profile: Profile, signal?: AbortSignal): Promise<VersionOption[]> {
  return source === 'modrinth'
    ? listModrinthVersionOptions(projectId, profile, signal)
    : listCurseForgeVersionOptions(projectId, profile, signal);
}

/** Orders Minecraft versions newest first (1.21.10 > 1.21.9 > 1.21; 26.1 > 1.21). */
export function compareGameVersionsDesc(a: string, b: string): number {
  const parse = (v: string) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Keeps plain release versions (drops snapshots like 24w14a or 1.21-pre1) and sorts them newest first. */
export function releaseVersions(versions: string[]): string[] {
  return [...new Set(versions.filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)))].sort(compareGameVersionsDesc);
}
