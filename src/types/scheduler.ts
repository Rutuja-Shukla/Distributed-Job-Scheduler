export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter' | 'cancelled';

export interface SimulatedJob {
  id: string;
  idempotencyKey?: string;
  queue: string;
  tenantId: string;
  type: string;
  payload: Record<string, any>;
  state: JobState;
  priority: number;
  maxAttempts: number;
  attempt: number;
  lastError?: string;
  result?: Record<string, any>;
  runAt: number; // timestamp ms
  claimedBy?: string;
  leaseExpiresAt?: number; // timestamp ms
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  progressPercent?: number;
}

export interface WorkerNode {
  id: string;
  name: string;
  status: 'idle' | 'executing' | 'crashed' | 'stopping';
  currentJobId?: string;
  lastHeartbeat?: number;
  totalCompleted: number;
  totalFailed: number;
}

export interface SchedulerLeader {
  id: string;
  name: string;
  isLeader: boolean;
  lockAcquiredAt?: number;
  lastAdvisoryCheck: number;
}

export interface PrometheusMetricSample {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number | string;
  labels?: Record<string, string>;
}
