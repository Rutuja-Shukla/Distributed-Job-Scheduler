import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, RotateCcw, AlertTriangle, Skull, ShieldCheck, 
  Server, Database, Cpu, Clock, RefreshCw, Zap, CheckCircle2
} from 'lucide-react';
import { SimulatedJob, WorkerNode, SchedulerLeader } from '../types/scheduler';
import { useTheme } from '../context/ThemeContext';

export const InteractiveSimulator: React.FC = () => {
  const { isDark } = useTheme();
  const [isRunning, setIsRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1);

  // Scheduler Leader election
  const [schedulers, setSchedulers] = useState<SchedulerLeader[]>([
    { id: 'sched-1', name: 'Scheduler-1 (us-east)', isLeader: true, lockAcquiredAt: Date.now() - 60000, lastAdvisoryCheck: Date.now() },
    { id: 'sched-2', name: 'Scheduler-2 (us-west)', isLeader: false, lastAdvisoryCheck: Date.now() }
  ]);

  // Workers
  const [workers, setWorkers] = useState<WorkerNode[]>([
    { id: 'w-1', name: 'Worker Alpha', status: 'idle', totalCompleted: 14, totalFailed: 1 },
    { id: 'w-2', name: 'Worker Beta', status: 'idle', totalCompleted: 18, totalFailed: 0 },
    { id: 'w-3', name: 'Worker Gamma', status: 'idle', totalCompleted: 11, totalFailed: 2 }
  ]);

  // Jobs
  const [jobs, setJobs] = useState<SimulatedJob[]>([
    {
      id: 'job-101',
      idempotencyKey: 'idemp-inv-4091',
      queue: 'billing',
      tenantId: 'stripe-us',
      type: 'charge_subscription',
      payload: { amount: 4900, currency: 'usd' },
      state: 'running',
      priority: 10,
      maxAttempts: 3,
      attempt: 1,
      runAt: Date.now() - 8000,
      claimedBy: 'w-1',
      leaseExpiresAt: Date.now() + 12000,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 2000,
      progressPercent: 45
    },
    {
      id: 'job-102',
      idempotencyKey: 'idemp-email-8821',
      queue: 'default',
      tenantId: 'acme-corp',
      type: 'send_welcome_email',
      payload: { to: 'alex@example.com' },
      state: 'queued',
      priority: 5,
      maxAttempts: 3,
      attempt: 0,
      runAt: Date.now() - 1000,
      createdAt: Date.now() - 2000,
      updatedAt: Date.now() - 2000
    },
    {
      id: 'job-103',
      idempotencyKey: 'idemp-img-3301',
      queue: 'media',
      tenantId: 'netflix-cdn',
      type: 'transcode_video_chunk',
      payload: { resolution: '4k', segment: 14 },
      state: 'queued',
      priority: 8,
      maxAttempts: 3,
      attempt: 0,
      runAt: Date.now() + 5000,
      createdAt: Date.now() - 500,
      updatedAt: Date.now() - 500
    },
    {
      id: 'job-104',
      idempotencyKey: 'idemp-bad-999',
      queue: 'default',
      tenantId: 'test-tenant',
      type: 'poison_pill_handler',
      payload: { corrupt_bytes: '0xDEADBEEF' },
      state: 'dead_letter',
      priority: 1,
      maxAttempts: 3,
      attempt: 3,
      lastError: 'Fatal: corrupt payload byte 0xDEADBEEF cannot be parsed (exhausted 3 attempts)',
      runAt: Date.now() - 35000,
      createdAt: Date.now() - 40000,
      updatedAt: Date.now() - 15000
    }
  ]);

  const [auditLogs, setAuditLogs] = useState<string[]>([
    '[INIT] System started with PostgreSQL 16 connection pool (30 conns)',
    '[LEADER] Scheduler-1 acquired advisory lock key 8899223344',
    '[CLAIM] Worker Alpha claimed job-101 (billing) via SELECT FOR UPDATE SKIP LOCKED (lease 20s)',
    '[HEARTBEAT] Worker Alpha extended lease for job-101 (+20s in DB clock)'
  ]);

  const addLog = (msg: string) => {
    setAuditLogs(prev => [ `[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 40) ]);
  };

  // Main simulation tick loop
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setJobs(prevJobs => {
        const now = Date.now();
        const updated = [...prevJobs];

        // 1. Check in-flight jobs
        updated.forEach(job => {
          if (job.state === 'running') {
            const worker = workers.find(w => w.id === job.claimedBy);

            if (!worker || worker.status === 'crashed') {
              if (job.leaseExpiresAt && now >= job.leaseExpiresAt) {
                job.state = 'queued';
                job.claimedBy = undefined;
                job.leaseExpiresAt = undefined;
                job.progressPercent = 0;
                addLog(`⚡ LEASE EXPIRED: job-${job.id.slice(-3)} abandoned by crashed worker. Re-queued in DB clock!`);
              }
            } else if (worker.status === 'executing') {
              job.progressPercent = Math.min(100, (job.progressPercent || 0) + (10 * simulationSpeed));

              if (job.progressPercent % 30 === 0 && job.progressPercent < 90) {
                job.leaseExpiresAt = now + 15000;
                addLog(`💓 HEARTBEAT: ${worker.name} extended lease for ${job.id} to +15s (DB clock)`);
              }

              if (job.progressPercent >= 100) {
                job.state = 'completed';
                job.completedAt = now;
                job.leaseExpiresAt = undefined;
                job.result = { processed: true, worker: worker.name, duration_ms: 1850 };
                addLog(`✅ COMPLETED: ${worker.name} executed ${job.type} (${job.id})`);

                setWorkers(currWorkers => currWorkers.map(w => 
                  w.id === worker.id ? { ...w, status: 'idle', currentJobId: undefined, totalCompleted: w.totalCompleted + 1 } : w
                ));
              }
            }
          }
        });

        // 2. Claim pending jobs with idle workers using SKIP LOCKED
        const idleWorkers = workers.filter(w => w.status === 'idle');
        const claimableJobs = updated
          .filter(j => j.state === 'queued' && j.runAt <= now)
          .sort((a, b) => b.priority - a.priority || a.runAt - b.runAt);

        if (idleWorkers.length > 0 && claimableJobs.length > 0) {
          const targetJob = claimableJobs[0];
          const targetWorker = idleWorkers[0];

          targetJob.state = 'running';
          targetJob.attempt += 1;
          targetJob.claimedBy = targetWorker.id;
          targetJob.leaseExpiresAt = now + 15000;
          targetJob.progressPercent = 5;

          addLog(`🔒 CLAIM: ${targetWorker.name} claimed ${targetJob.id} (priority ${targetJob.priority}) with SKIP LOCKED`);

          setWorkers(currWorkers => currWorkers.map(w => 
            w.id === targetWorker.id ? { ...w, status: 'executing', currentJobId: targetJob.id } : w
          ));
        }

        return updated;
      });
    }, 1000 / simulationSpeed);

    return () => clearInterval(interval);
  }, [isRunning, simulationSpeed, workers]);

  const handleKillWorker = (workerId: string) => {
    const target = workers.find(w => w.id === workerId);
    if (!target) return;

    if (target.status === 'crashed') {
      setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, status: 'idle', currentJobId: undefined } : w));
      addLog(`🛡️ RECOVERED: ${target.name} rebooted and reconnected to gRPC queue.`);
    } else {
      setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, status: 'crashed' } : w));
      addLog(`💀 CHAOS SIGKILL: ${target.name} killed mid-job! Heartbeat ceased immediately.`);
    }
  };

  const handleInjectPoisonJob = () => {
    const newId = `job-psn-${Math.floor(100 + Math.random() * 900)}`;
    const newJob: SimulatedJob = {
      id: newId,
      idempotencyKey: `idemp-poison-${Date.now()}`,
      queue: 'default',
      tenantId: 'untrusted-client',
      type: 'parse_binary_header',
      payload: { malformed: true, segfault: true },
      state: 'queued',
      priority: 10,
      maxAttempts: 3,
      attempt: 0,
      runAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setJobs(prev => [newJob, ...prev]);
    addLog(`🧪 POISON PILL: Injected unparseable binary payload (${newId}). Watch retry backoff & DLQ!`);
  };

  const handleRequeueJob = (jobId: string) => {
    setJobs(prev => prev.map(j => {
      if (j.id === jobId) {
        return {
          ...j,
          state: 'queued',
          attempt: 0,
          runAt: Date.now(),
          lastError: undefined,
          claimedBy: undefined,
          leaseExpiresAt: undefined,
          progressPercent: 0
        };
      }
      return j;
    }));
    addLog(`🔄 REQUEUE: Restored dead-letter job ${jobId} to queued state (attempt reset to 0).`);
  };

  const handleFailoverLeader = () => {
    setSchedulers(prev => prev.map(s => ({
      ...s,
      isLeader: !s.isLeader,
      lockAcquiredAt: !s.isLeader ? Date.now() : undefined,
      lastAdvisoryCheck: Date.now()
    })));
    addLog(`👑 ADVISORY LOCK FAILOVER: Leader lock released. Standby scheduler acquired pg_try_advisory_lock(8899223344)!`);
  };

  const handleAddSampleJob = (priority: number, delaySec: number) => {
    const types = ['email_send', 'pdf_generate', 'webhook_dispatch', 'ledger_sync'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const newId = `job-${Math.floor(100 + Math.random() * 900)}`;
    const newJob: SimulatedJob = {
      id: newId,
      idempotencyKey: `idemp-${Date.now()}`,
      queue: 'default',
      tenantId: `tenant-${Math.floor(1 + Math.random() * 3)}`,
      type: chosenType,
      payload: { user_id: 42, timestamp: Date.now() },
      state: 'queued',
      priority,
      maxAttempts: 3,
      attempt: 0,
      runAt: Date.now() + (delaySec * 1000),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setJobs(prev => [newJob, ...prev]);
    addLog(`📥 SUBMIT: New job ${newId} (${chosenType}, priority=${priority}, delay=${delaySec}s) enqueued.`);
  };

  const handleReset = () => {
    setWorkers([
      { id: 'w-1', name: 'Worker Alpha', status: 'idle', totalCompleted: 0, totalFailed: 0 },
      { id: 'w-2', name: 'Worker Beta', status: 'idle', totalCompleted: 0, totalFailed: 0 },
      { id: 'w-3', name: 'Worker Gamma', status: 'idle', totalCompleted: 0, totalFailed: 0 }
    ]);
    setJobs([
      {
        id: 'job-201',
        idempotencyKey: 'idemp-init-1',
        queue: 'default',
        tenantId: 'tenant-a',
        type: 'email_send',
        payload: { to: 'mentor@example.com' },
        state: 'queued',
        priority: 5,
        maxAttempts: 3,
        attempt: 0,
        runAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ]);
    addLog('🔄 RESET: Simulation environment restored to pristine state.');
  };

  // Light vs Dark class helpers
  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const subCardClass = isDark
    ? 'bg-slate-950/80 border-slate-800'
    : 'bg-slate-50 border-slate-200';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className={`border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition ${cardClass}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-4 py-2 rounded-lg font-medium text-xs sm:text-sm flex items-center gap-2 transition ${
              isRunning 
                ? (isDark 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30' 
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100')
                : (isDark 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs')
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Pause Engine' : 'Resume Engine'}
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition ${
            isDark ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <span>Speed:</span>
            {[1, 2, 4].map(s => (
              <button
                key={s}
                onClick={() => setSimulationSpeed(s)}
                className={`px-2 py-0.5 rounded font-mono ${
                  simulationSpeed === s 
                    ? (isDark ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-indigo-600 text-white font-bold') 
                    : 'hover:opacity-80'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className={`p-2 rounded-lg border transition ${
              isDark 
                ? 'text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800' 
                : 'text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-100'
            }`}
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Chaos Injection Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleAddSampleJob(10, 0)}
            className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isDark 
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30' 
                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-blue-500" />
            + High Priority Job
          </button>

          <button
            onClick={() => handleAddSampleJob(1, 10)}
            className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isDark 
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 hover:bg-purple-600/30' 
                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            + 10s Delayed Job
          </button>

          <button
            onClick={handleInjectPoisonJob}
            className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isDark 
                ? 'bg-rose-600/20 text-rose-300 border-rose-500/40 hover:bg-rose-600/30' 
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            Inject Poison Job
          </button>

          <button
            onClick={handleFailoverLeader}
            className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isDark 
                ? 'bg-amber-600/20 text-amber-300 border-amber-500/40 hover:bg-amber-600/30' 
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-amber-500" />
            Test Leader Failover
          </button>
        </div>
      </div>

      {/* Grid: Nodes, Database, Workers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Schedulers & Advisory Lock */}
        <div className={`border rounded-xl p-5 space-y-4 transition ${cardClass}`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-semibold flex items-center gap-2 ${headingText}`}>
              <Server className="w-4 h-4 text-amber-500" />
              Scheduler Control Plane
            </h3>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              pg_try_advisory_lock
            </span>
          </div>

          <p className={`text-xs leading-relaxed ${mutedText}`}>
            Mutual exclusion via PostgreSQL advisory lock key <code className={`font-mono px-1 py-0.5 rounded ${
              isDark ? 'bg-slate-950 text-amber-300' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>8899223344</code>. Standbys step up with zero split-brain risk.
          </p>

          <div className="space-y-3">
            {schedulers.map(s => (
              <div 
                key={s.id} 
                className={`p-3.5 rounded-lg border transition ${
                  s.isLeader 
                    ? (isDark ? 'bg-amber-500/10 border-amber-500/40 text-slate-100' : 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-xs')
                    : (isDark ? 'bg-slate-800/40 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600')
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-semibold flex items-center gap-1.5">
                    {s.name}
                    {s.isLeader && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                        LEADER
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {s.isLeader ? 'Holding Lock' : 'Standby Poll'}
                  </span>
                </div>
                <div className={`text-[11px] flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span>Cron Dispatcher: {s.isLeader ? 'Active (ticker 3s)' : 'Dormant'}</span>
                  <span className="text-[10px] font-mono text-emerald-600 font-semibold">pgxpool OK</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`p-3 rounded-lg border text-xs space-y-1 transition ${subCardClass}`}>
            <div className="font-semibold flex items-center gap-1.5 text-emerald-600">
              <ShieldCheck className="w-3.5 h-3.5" />
              Clock Skew Protection
            </div>
            <p className={`text-[11px] leading-normal ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Database clock <code className="text-indigo-600 dark:text-cyan-400 font-mono font-semibold">NOW()</code> is the single monotonic authority. Worker host clocks never affect lease validity.
            </p>
          </div>
        </div>

        {/* Column 2: PostgreSQL Engine & Row Locks */}
        <div className={`border rounded-xl p-5 space-y-4 transition ${cardClass}`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-semibold flex items-center gap-2 ${headingText}`}>
              <Database className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              PostgreSQL 16 Engine
            </h3>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              isDark 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              ACID Core
            </span>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={`p-2.5 rounded-lg border transition ${subCardClass}`}>
              <div className={`text-[10px] uppercase font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Active Claims</div>
              <div className="text-lg font-bold font-mono text-indigo-600 dark:text-cyan-400">
                {jobs.filter(j => j.state === 'running').length}
              </div>
            </div>
            <div className={`p-2.5 rounded-lg border transition ${subCardClass}`}>
              <div className={`text-[10px] uppercase font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>In Queue</div>
              <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                {jobs.filter(j => j.state === 'queued').length}
              </div>
            </div>
            <div className={`p-2.5 rounded-lg border transition ${subCardClass}`}>
              <div className={`text-[10px] uppercase font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dead Letter</div>
              <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">
                {jobs.filter(j => j.state === 'dead_letter').length}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-slate-100 p-3 rounded-lg border border-slate-800 font-mono text-[11px] space-y-1 shadow-inner">
            <div className="text-slate-400">// Claim query executed by workers:</div>
            <div className="text-cyan-300">SELECT id FROM jobs</div>
            <div className="text-slate-300 pl-2">WHERE queue = 'default'</div>
            <div className="text-slate-300 pl-4">AND (state = 'queued' AND run_at &lt;= NOW()</div>
            <div className="text-slate-300 pl-6">OR state = 'running' AND lease_expires_at &lt;= NOW())</div>
            <div className="text-slate-300 pl-2">ORDER BY priority DESC, run_at ASC</div>
            <div className="text-amber-300 pl-2 font-bold">FOR UPDATE SKIP LOCKED;</div>
          </div>

          <div className={`text-xs space-y-1 ${mutedText}`}>
            <span className={`font-semibold ${headingText}`}>Index Status:</span>
            <div className={`text-[11px] font-mono p-2 rounded border ${
              isDark 
                ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50' 
                : 'text-emerald-800 bg-emerald-50 border-emerald-200'
            }`}>
              idx_jobs_claimable (queue, priority DESC, run_at ASC) WHERE state IN ('queued', 'running') [HOT]
            </div>
          </div>
        </div>

        {/* Column 3: Worker Fleet & Chaos Monkey */}
        <div className={`border rounded-xl p-5 space-y-4 transition ${cardClass}`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-semibold flex items-center gap-2 ${headingText}`}>
              <Cpu className="w-4 h-4 text-emerald-500" />
              Worker Fleet (gRPC)
            </h3>
            <span className={`text-[11px] font-mono ${mutedText}`}>
              3 Nodes Online
            </span>
          </div>

          <p className={`text-xs ${mutedText}`}>
            Click <strong>Kill (SIGKILL)</strong> to simulate worker crash. The visibility lease in PostgreSQL will expire and a peer worker reclaims it without data loss!
          </p>

          <div className="space-y-3">
            {workers.map(w => {
              const currentJob = jobs.find(j => j.id === w.currentJobId);
              const isCrashed = w.status === 'crashed';
              const isExecuting = w.status === 'executing';

              return (
                <div 
                  key={w.id} 
                  className={`p-3 rounded-lg border transition ${
                    isCrashed 
                      ? (isDark ? 'bg-rose-500/10 border-rose-500/50 text-slate-200' : 'bg-rose-50 border-rose-200 text-rose-900')
                      : isExecuting 
                        ? (isDark ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950')
                        : (isDark ? 'bg-slate-800/40 border-slate-700/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700')
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                      <div className={`w-2 h-2 rounded-full ${isCrashed ? 'bg-rose-500 animate-ping' : isExecuting ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {w.name}
                    </div>

                    <button
                      onClick={() => handleKillWorker(w.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition ${
                        isCrashed 
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs' 
                          : 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-600 hover:text-white'
                      }`}
                    >
                      {isCrashed ? <RefreshCw className="w-3 h-3" /> : <Skull className="w-3 h-3" />}
                      {isCrashed ? 'Reboot' : 'Kill (SIGKILL)'}
                    </button>
                  </div>

                  {isExecuting && currentJob && (
                    <div className="space-y-1.5 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                      <div className="flex justify-between">
                        <span className="font-mono text-emerald-700 dark:text-emerald-300 font-bold">{currentJob.id}</span>
                        <span className={mutedText}>{currentJob.type}</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${currentJob.progressPercent || 10}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Lease expires in: {Math.max(0, Math.round(((currentJob.leaseExpiresAt || 0) - Date.now()) / 1000))}s</span>
                        <span>Attempt #{currentJob.attempt}</span>
                      </div>
                    </div>
                  )}

                  {isCrashed && (
                    <div className="text-[11px] text-rose-600 font-mono flex items-center gap-1 mt-1">
                      <Skull className="w-3 h-3" />
                      CRASHED: Heartbeat halted. Lease counting down.
                    </div>
                  )}

                  {!isExecuting && !isCrashed && (
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>Idle (polling 250ms)</span>
                      <span>Done: {w.totalCompleted}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Jobs Queue Table */}
      <div className={`border rounded-xl overflow-hidden transition ${cardClass}`}>
        <div className={`p-4 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/60'
        }`}>
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-sm ${headingText}`}>PostgreSQL Jobs Table (Active & Dead-Letter)</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
              isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-200/80 text-slate-700 border-slate-300'
            }`}>
              {jobs.length} jobs
            </span>
          </div>
          <div className={`text-xs ${mutedText}`}>
            Ordered by: <span className="font-mono text-indigo-600 dark:text-cyan-300 font-semibold">priority DESC, run_at ASC</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`uppercase font-mono text-[10px] border-b ${
              isDark ? 'bg-slate-950/60 text-slate-400 border-slate-800' : 'bg-slate-100/80 text-slate-600 border-slate-200'
            }`}>
              <tr>
                <th className="p-3">Job ID & Key</th>
                <th className="p-3">Queue / Tenant</th>
                <th className="p-3">Type</th>
                <th className="p-3">Priority</th>
                <th className="p-3">State</th>
                <th className="p-3">Attempt</th>
                <th className="p-3">Claimed By</th>
                <th className="p-3">Lease Expiry</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-mono ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
              {jobs.map(j => {
                const isRunningState = j.state === 'running';
                const isDeadLetter = j.state === 'dead_letter';
                const isCompleted = j.state === 'completed';
                const leaseRemainingSec = j.leaseExpiresAt ? Math.max(0, Math.round((j.leaseExpiresAt - Date.now()) / 1000)) : null;

                return (
                  <tr key={j.id} className={`transition ${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                    <td className="p-3">
                      <div className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{j.id}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{j.idempotencyKey || 'no-key'}</div>
                    </td>
                    <td className="p-3">
                      <span className={`font-sans font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{j.queue}</span>
                      <div className="text-[10px] text-slate-500 font-mono">{j.tenantId}</div>
                    </td>
                    <td className={`p-3 font-sans ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {j.type}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        j.priority >= 8 
                          ? (isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-200')
                          : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200')
                      }`}>
                        p{j.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans font-medium border ${
                        isRunningState 
                          ? (isDark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200')
                          : isDeadLetter
                            ? (isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200')
                            : isCompleted
                              ? (isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                              : (isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
                      }`}>
                        {isRunningState && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {isDeadLetter && <Skull className="w-3 h-3" />}
                        {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                        {j.state}
                      </span>
                    </td>
                    <td className={`p-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {j.attempt} / {j.maxAttempts}
                    </td>
                    <td className="p-3">
                      {j.claimedBy ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                          {workers.find(w => w.id === j.claimedBy)?.name || j.claimedBy}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {leaseRemainingSec !== null ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          leaseRemainingSec <= 3 
                            ? 'bg-rose-100 text-rose-800 border-rose-200 font-bold' 
                            : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200')
                        }`}>
                          {leaseRemainingSec}s left
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {isDeadLetter && (
                        <button
                          onClick={() => handleRequeueJob(j.id)}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-700 dark:bg-cyan-600/20 dark:text-cyan-300 border border-indigo-200 dark:border-cyan-500/40 rounded text-[11px] hover:bg-indigo-100 font-sans font-medium transition shadow-2xs"
                        >
                          Requeue DLQ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Audit Log Stream */}
      <div className={`border rounded-xl p-4 space-y-2 transition ${cardClass}`}>
        <div className="flex items-center justify-between text-xs">
          <span className={`font-semibold flex items-center gap-1.5 ${headingText}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Live Scheduler & Worker Event Log
          </span>
          <span className="font-mono text-[11px] text-slate-500">Real-time Event Stream</span>
        </div>
        <div className={`font-mono text-xs max-h-36 overflow-y-auto space-y-1 p-3 rounded-lg border transition ${
          isDark 
            ? 'bg-slate-950 text-slate-400 border-slate-800' 
            : 'bg-slate-900 text-slate-200 border-slate-800 shadow-inner'
        }`}>
          {auditLogs.map((log, i) => (
            <div key={i} className="leading-relaxed">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
