/**
 * Persist video generation jobs for async polling (filesystem, same spirit as uploads).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import type {
  VideoGenMode,
  VideoJobStatus,
  VideoProviderId,
  VideoAspectRatio,
} from '@/app/utils/services/video/providers';

export type StoredVideoJob = {
  jobId: string;
  providerJobId: string;
  provider: VideoProviderId;
  userId: number;
  status: VideoJobStatus;
  progress: number;
  mode: VideoGenMode;
  prompt: string;
  modelPrompt: string;
  aspectRatio: VideoAspectRatio;
  referenceImage?: string | null;
  referenceVideo?: string | null;
  assetUrl?: string | null;
  localAssetUrl?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

function jobsDir(): string {
  const dir = path.resolve(process.cwd(), '.data', 'video-jobs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function jobPath(jobId: string): string {
  const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(jobsDir(), `${safe}.json`);
}

export function saveVideoJob(job: StoredVideoJob): void {
  writeFileSync(jobPath(job.jobId), JSON.stringify(job, null, 2), 'utf8');
}

export function loadVideoJob(jobId: string): StoredVideoJob | null {
  const p = jobPath(jobId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StoredVideoJob;
  } catch {
    return null;
  }
}

export function listVideoJobsForUser(userId: number, limit = 20): StoredVideoJob[] {
  const dir = jobsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const jobs: StoredVideoJob[] = [];
  for (const f of files) {
    try {
      const job = JSON.parse(
        readFileSync(path.join(dir, f), 'utf8')
      ) as StoredVideoJob;
      if (Number(job.userId) === Number(userId)) jobs.push(job);
    } catch {
      /* skip */
    }
  }
  return jobs
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}
