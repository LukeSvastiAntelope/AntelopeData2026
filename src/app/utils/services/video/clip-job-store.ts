/**
 * Persist clip jobs for async polling (.data/video-clip-jobs).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type {
  VideoClipCandidate,
  VideoClipJobStatus,
  VideoClipProviderId,
} from '@/app/utils/services/video/clippers';

export type StoredClipJob = {
  jobId: string;
  providerJobId: string;
  provider: VideoClipProviderId;
  userId: number;
  sourceUrl: string;
  status: VideoClipJobStatus;
  progress: number;
  clips: VideoClipCandidate[];
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

function jobsDir(): string {
  const dir = path.resolve(process.cwd(), '.data', 'video-clip-jobs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function jobPath(jobId: string): string {
  const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(jobsDir(), `${safe}.json`);
}

export function saveClipJob(job: StoredClipJob): void {
  writeFileSync(jobPath(job.jobId), JSON.stringify(job, null, 2), 'utf8');
}

export function loadClipJob(jobId: string): StoredClipJob | null {
  const p = jobPath(jobId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StoredClipJob;
  } catch {
    return null;
  }
}
