import React, { useState, useMemo } from 'react';
import { Activity, ShieldAlert, Sparkles, RefreshCw, BarChart2, Zap } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const JitterCalculator: React.FC = () => {
  const { isDark } = useTheme();
  const [baseBackoff, setBaseBackoff] = useState(2);
  const [maxBackoff, setMaxBackoff] = useState(60);
  const [attempt, setAttempt] = useState(3);
  const [simulatedJobsCount, setSimulatedJobsCount] = useState(60);

  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  // Calculate backoff values
  const cap = useMemo(() => {
    return Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt - 1));
  }, [baseBackoff, maxBackoff, attempt]);

  // Generate simulated retry time distributions for 60 simultaneous failed jobs
  const simulation = useMemo(() => {
    const naiveTimes: number[] = [];
    const fullJitterTimes: number[] = [];
    const equalJitterTimes: number[] = [];

    for (let i = 0; i < simulatedJobsCount; i++) {
      naiveTimes.push(cap);
      fullJitterTimes.push(Math.random() * cap);
      const half = cap / 2;
      equalJitterTimes.push(half + (Math.random() * half));
    }

    return { naiveTimes, fullJitterTimes, equalJitterTimes };
  }, [cap, simulatedJobsCount]);

  // Histogram buckets across 0 to cap seconds
  const bucketCount = 12;
  const buckets = useMemo(() => {
    const step = cap / bucketCount;
    const naiveBuckets = new Array(bucketCount).fill(0);
    const fullJitterBuckets = new Array(bucketCount).fill(0);

    simulation.naiveTimes.forEach(t => {
      const b = Math.min(bucketCount - 1, Math.floor(t / step));
      naiveBuckets[b]++;
    });

    simulation.fullJitterTimes.forEach(t => {
      const b = Math.min(bucketCount - 1, Math.floor(t / step));
      fullJitterBuckets[b]++;
    });

    return { step, naiveBuckets, fullJitterBuckets };
  }, [simulation, cap]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className={`border rounded-xl p-6 transition ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border-slate-800' 
          : 'bg-gradient-to-r from-white via-amber-50/50 to-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <ShieldAlert className="w-4 h-4" />
          Retry Storms & Thundering Herds
        </div>
        <h2 className={`text-xl font-bold ${headingText}`}>
          Exponential Backoff with Full Jitter Simulator
        </h2>
        <p className={`text-sm mt-1 max-w-3xl ${mutedText}`}>
          When an upstream dependency fails, dozens or thousands of jobs fail simultaneously. Without jitter, naive exponential retries synchronize into a catastrophic thundering herd. <strong>Full Jitter</strong> decorrelates retries smoothly across time.
        </p>
      </div>

      {/* Control Sliders */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 border rounded-xl p-6 transition ${cardClass}`}>
        <div>
          <div className="flex justify-between text-xs font-medium mb-2">
            <span className={mutedText}>Base Backoff ($B$)</span>
            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{baseBackoff}s</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={baseBackoff}
            onChange={e => setBaseBackoff(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="text-[11px] text-slate-500 mt-1">Initial delay for attempt 1</div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-medium mb-2">
            <span className={mutedText}>Max Backoff Cap ($M$)</span>
            <span className="font-mono text-indigo-600 dark:text-cyan-400 font-bold">{maxBackoff}s</span>
          </div>
          <input
            type="range"
            min="10"
            max="300"
            step="10"
            value={maxBackoff}
            onChange={e => setMaxBackoff(Number(e.target.value))}
            className="w-full accent-indigo-600 dark:accent-cyan-500 cursor-pointer"
          />
          <div className="text-[11px] text-slate-500 mt-1">Ceiling to prevent endless delay</div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-medium mb-2">
            <span className={mutedText}>Failure Attempt ($a$)</span>
            <span className="font-mono text-purple-600 dark:text-purple-400 font-bold">Attempt #{attempt}</span>
          </div>
          <input
            type="range"
            min="1"
            max="6"
            step="1"
            value={attempt}
            onChange={e => setAttempt(Number(e.target.value))}
            className="w-full accent-purple-600 cursor-pointer"
          />
          <div className="text-[11px] text-slate-500 mt-1">Exceeding max attempts moves to DLQ</div>
        </div>
      </div>

      {/* Mathematical Calculations Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`border rounded-xl p-4 transition ${cardClass}`}>
          <div className="text-xs text-slate-500 font-mono">1. Upper Bound (Cap)</div>
          <div className={`text-2xl font-bold font-mono my-1 ${headingText}`}>
            {cap.toFixed(1)}s
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            min({maxBackoff}, {baseBackoff} &times; 2<sup>{attempt - 1}</sup>)
          </div>
        </div>

        <div className={`border rounded-xl p-4 transition ${cardClass}`}>
          <div className="text-xs text-rose-600 dark:text-rose-400 font-mono">2. Naive Retry Delay (No Jitter)</div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 my-1">
            {cap.toFixed(1)}s <span className="text-xs font-normal text-rose-500">(100% collision)</span>
          </div>
          <div className="text-[11px] text-slate-500">
            All 60 jobs retry at the exact same second
          </div>
        </div>

        <div className={`border rounded-xl p-4 transition ${cardClass}`}>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">3. Full Jitter Range</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 my-1">
            0.0s &rarr; {cap.toFixed(1)}s
          </div>
          <div className="text-[11px] text-slate-500">
            Uniformly distributed, 0 resonance peaks
          </div>
        </div>
      </div>

      {/* Visual Histogram Comparison */}
      <div className={`border rounded-xl p-6 space-y-6 transition ${cardClass}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-semibold text-sm flex items-center gap-2 ${headingText}`}>
              <BarChart2 className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              Simulated Retry Arrival Distribution ({simulatedJobsCount} Concurrent Failures)
            </h3>
            <p className={`text-xs mt-0.5 ${mutedText}`}>
              Comparison of worker request arrival times back to the database / upstream API.
            </p>
          </div>

          <button
            onClick={() => setSimulatedJobsCount(prev => prev)}
            className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isDark 
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' 
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Resimulate RNG
          </button>
        </div>

        {/* Chart 1: Naive Exponential (Thundering Herd) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Naive Exponential (NO Jitter) &mdash; Spike / Thundering Herd Collapse
            </span>
            <span className="text-slate-500 font-mono">100% concentration at t={cap.toFixed(1)}s</span>
          </div>

          <div className={`h-16 rounded-lg p-2 flex items-end gap-1.5 border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            {buckets.naiveBuckets.map((count, i) => {
              const heightPct = count > 0 ? 100 : 4;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${count > 0 ? 'bg-rose-500 shadow-sm shadow-rose-500/50' : 'bg-slate-300 dark:bg-slate-800/40'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`Bucket ${i}: ${count} jobs`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Full Jitter (Safe & Smooth) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Full Jitter (Our Implementation) &mdash; Uniform Distributed Load
            </span>
            <span className="text-slate-500 font-mono">Smoothly distributed across [0, {cap.toFixed(1)}s]</span>
          </div>

          <div className={`h-20 rounded-lg p-2 flex items-end gap-1.5 border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            {buckets.fullJitterBuckets.map((count, i) => {
              const maxCount = Math.max(...buckets.fullJitterBuckets, 1);
              const heightPct = Math.max(8, (count / maxCount) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-t transition-all duration-300"
                    style={{ height: `${heightPct}%` }}
                    title={`Interval ${(i * buckets.step).toFixed(1)}s - ${((i + 1) * buckets.step).toFixed(1)}s: ${count} jobs`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1">
            <span>0.0s</span>
            <span>{(cap * 0.25).toFixed(1)}s</span>
            <span>{(cap * 0.5).toFixed(1)}s</span>
            <span>{(cap * 0.75).toFixed(1)}s</span>
            <span>{cap.toFixed(1)}s</span>
          </div>
        </div>

        <div className="bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-800 font-mono text-xs shadow-inner">
          <div className="text-slate-400 mb-1">// The exact Go implementation in internal/store/postgres.go:</div>
          <span className="text-purple-400">baseBackoff</span> := <span className="text-amber-300">2.0</span><br />
          <span className="text-purple-400">maxBackoff</span> := <span className="text-amber-300">300.0</span><br />
          <span className="text-purple-400">backoffCap</span> := math.Min(maxBackoff, baseBackoff * math.Pow(<span className="text-amber-300">2</span>, float64(job.Attempt-1)))<br />
          <span className="text-emerald-400">jitteredDelaySeconds</span> := int(rand.Float64() * backoffCap)
        </div>
      </div>
    </div>
  );
};
