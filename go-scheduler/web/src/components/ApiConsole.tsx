import React, { useState } from 'react';
import { Terminal, Send, Copy, Check, AlertCircle, Database, ShieldCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ApiConsole: React.FC = () => {
  const { isDark } = useTheme();
  const [selectedEndpoint, setSelectedEndpoint] = useState<'submit' | 'get' | 'list' | 'cancel' | 'requeue' | 'metrics'>('submit');
  
  // Submit Form state
  const [idempotencyKey, setIdempotencyKey] = useState('txn-pay-90218');
  const [queue, setQueue] = useState('billing');
  const [tenantId, setTenantId] = useState('tenant-alpha');
  const [jobType, setJobType] = useState('charge_customer_card');
  const [priority, setPriority] = useState(10);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [payloadJson, setPayloadJson] = useState('{\n  "amount_cents": 4900,\n  "currency": "usd",\n  "customer_id": "cus_N72Jk"\n}');

  // Responses
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  const handleSendRequest = () => {
    if (selectedEndpoint === 'submit') {
      try {
        const parsed = JSON.parse(payloadJson);
        const mockJob = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          idempotency_key: idempotencyKey || null,
          queue,
          tenant_id: tenantId,
          type: jobType,
          payload: parsed,
          state: 'queued',
          priority,
          max_attempts: 3,
          attempt: 0,
          run_at: new Date(Date.now() + (delaySeconds * 1000)).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setResponseStatus(201);
        setResponseBody(JSON.stringify(mockJob, null, 2));
      } catch (e: any) {
        setResponseStatus(400);
        setResponseBody(JSON.stringify({ error: 'invalid json in payload: ' + e.message }, null, 2));
      }
    } else if (selectedEndpoint === 'get') {
      setResponseStatus(200);
      setResponseBody(JSON.stringify({
        id: '550e8400-e29b-41d4-a716-446655440000',
        idempotency_key: 'txn-pay-90218',
        queue: 'billing',
        tenant_id: 'tenant-alpha',
        type: 'charge_customer_card',
        state: 'completed',
        priority: 10,
        max_attempts: 3,
        attempt: 1,
        result: { status: 'succeeded', charge_id: 'ch_3N82JkL9' },
        claimed_by: 'worker-node-1',
        created_at: new Date(Date.now() - 60000).toISOString(),
        completed_at: new Date(Date.now() - 58000).toISOString()
      }, null, 2));
    } else if (selectedEndpoint === 'list') {
      setResponseStatus(200);
      setResponseBody(JSON.stringify({
        jobs: [
          { id: '550e8400-e29b-41d4-a716-446655440000', queue: 'billing', state: 'completed', priority: 10 },
          { id: '710b9100-c11a-41d4-b912-882244110001', queue: 'default', state: 'queued', priority: 5 },
          { id: '820c9200-d22b-41d4-c813-993355220002', queue: 'media', state: 'running', priority: 8 }
        ],
        count: 3
      }, null, 2));
    } else if (selectedEndpoint === 'cancel') {
      setResponseStatus(200);
      setResponseBody(JSON.stringify({
        id: '710b9100-c11a-41d4-b912-882244110001',
        state: 'cancelled',
        updated_at: new Date().toISOString()
      }, null, 2));
    } else if (selectedEndpoint === 'requeue') {
      setResponseStatus(200);
      setResponseBody(JSON.stringify({
        id: '990f9900-e99b-41d4-f999-112233445566',
        state: 'queued',
        attempt: 0,
        run_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString()
      }, null, 2));
    } else if (selectedEndpoint === 'metrics') {
      setResponseStatus(200);
      setResponseBody(
`# HELP scheduler_jobs_submitted_total Total count of jobs submitted
# TYPE scheduler_jobs_submitted_total counter
scheduler_jobs_submitted_total{queue="billing",tenant_id="tenant-alpha",type="charge_customer_card"} 1420
scheduler_jobs_submitted_total{queue="default",tenant_id="default",type="email_send"} 3890

# HELP scheduler_jobs_claimed_total Total count of jobs claimed by workers
# TYPE scheduler_jobs_claimed_total counter
scheduler_jobs_claimed_total{queue="billing",worker_id="worker-node-1"} 1419
scheduler_jobs_claimed_total{queue="default",worker_id="worker-node-2"} 3888

# HELP scheduler_claim_duration_seconds Duration spent executing SELECT FOR UPDATE SKIP LOCKED
# TYPE scheduler_claim_duration_seconds histogram
scheduler_claim_duration_seconds_bucket{queue="default",le="0.001"} 1840
scheduler_claim_duration_seconds_bucket{queue="default",le="0.005"} 3820
scheduler_claim_duration_seconds_bucket{queue="default",le="0.01"} 3880
scheduler_claim_duration_seconds_sum{queue="default"} 1.48
scheduler_claim_duration_seconds_count{queue="default"} 3888`
      );
    }
  };

  const handleTestDuplicateKey = () => {
    setResponseStatus(409);
    setResponseBody(JSON.stringify({
      error: "Conflict: unique_violation on idx_jobs_idempotency_key. A job with idempotency key '" + idempotencyKey + "' already exists in database.",
      code: "ERR_DUPLICATE_IDEMPOTENCY_KEY"
    }, null, 2));
  };

  const handleCopy = () => {
    if (responseBody) {
      navigator.clipboard.writeText(responseBody);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className={`border rounded-xl p-6 transition ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-800' 
          : 'bg-gradient-to-r from-white via-indigo-50/40 to-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-2 text-indigo-600 dark:text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <Terminal className="w-4 h-4" />
          Admin REST & Observability Console
        </div>
        <h2 className={`text-xl font-bold ${headingText}`}>
          Job Scheduler Interactive API & Metrics Inspector
        </h2>
        <p className={`text-sm mt-1 ${mutedText}`}>
          Test REST routes implemented in <code className="text-indigo-600 dark:text-cyan-300 font-mono text-xs font-semibold">internal/api/router.go</code>. Test idempotency deduplication, job cancellation, DLQ requeue, and live Prometheus metric scrapes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Route Selector & Request Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className={`border rounded-xl p-4 space-y-3 transition ${cardClass}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Endpoint</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'submit', path: 'POST /jobs', label: 'Submit' },
                { id: 'get', path: 'GET /jobs/:id', label: 'Inspect' },
                { id: 'list', path: 'GET /jobs', label: 'List Filter' },
                { id: 'cancel', path: 'POST /cancel', label: 'Cancel' },
                { id: 'requeue', path: 'POST /requeue', label: 'Requeue DLQ' },
                { id: 'metrics', path: 'GET /metrics', label: 'Prometheus' }
              ].map(ep => (
                <button
                  key={ep.id}
                  onClick={() => { setSelectedEndpoint(ep.id as any); setResponseStatus(null); setResponseBody(null); }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition flex items-center justify-between border ${
                    selectedEndpoint === ep.id 
                      ? isDark 
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                        : 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold shadow-xs'
                      : isDark
                        ? 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{ep.path}</span>
                  <span className="text-[10px] font-mono opacity-60">{ep.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields for Submit */}
          {selectedEndpoint === 'submit' && (
            <div className={`border rounded-xl p-5 space-y-4 transition ${cardClass}`}>
              <h3 className={`text-sm font-semibold ${headingText}`}>Submit Job Payload Builder</h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className={`font-mono flex items-center justify-between mb-1 ${mutedText}`}>
                    <span>idempotency_key</span>
                    <span className="text-slate-500 text-[10px]">Unique partial index</span>
                  </label>
                  <input
                    type="text"
                    value={idempotencyKey}
                    onChange={e => setIdempotencyKey(e.target.value)}
                    className={`w-full border rounded-lg p-2 font-mono text-xs focus:outline-none transition ${
                      isDark 
                        ? 'bg-slate-950 border-slate-800 text-cyan-300 focus:border-cyan-500' 
                        : 'bg-slate-50 border-slate-300 text-indigo-900 focus:border-indigo-500'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`font-mono mb-1 block ${mutedText}`}>queue</label>
                    <input
                      type="text"
                      value={queue}
                      onChange={e => setQueue(e.target.value)}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`font-mono mb-1 block ${mutedText}`}>tenant_id</label>
                    <input
                      type="text"
                      value={tenantId}
                      onChange={e => setTenantId(e.target.value)}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`font-mono mb-1 block ${mutedText}`}>type</label>
                    <input
                      type="text"
                      value={jobType}
                      onChange={e => setJobType(e.target.value)}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`font-mono mb-1 block ${mutedText}`}>priority (0-100)</label>
                    <input
                      type="number"
                      value={priority}
                      onChange={e => setPriority(Number(e.target.value))}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`font-mono mb-1 block ${mutedText}`}>payload (JSON)</label>
                  <textarea
                    rows={4}
                    value={payloadJson}
                    onChange={e => setPayloadJson(e.target.value)}
                    className={`w-full border rounded-lg p-2 font-mono text-xs focus:outline-none transition ${
                      isDark 
                        ? 'bg-slate-950 border-slate-800 text-amber-300 focus:border-cyan-500' 
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSendRequest}
                  className={`flex-1 font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-sm ${
                    isDark 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-cyan-500/20' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  POST /api/v1/jobs
                </button>

                <button
                  onClick={handleTestDuplicateKey}
                  className="px-3 bg-rose-50 text-rose-700 dark:bg-rose-600/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-600/30 rounded-lg text-xs font-medium transition"
                  title="Simulate submitting identical idempotency key to test 409 Conflict"
                >
                  Test 409 Conflict
                </button>
              </div>
            </div>
          )}

          {selectedEndpoint !== 'submit' && (
            <div className={`border rounded-xl p-5 space-y-4 transition ${cardClass}`}>
              <h3 className={`text-sm font-semibold ${headingText}`}>Execute Request</h3>
              <p className={`text-xs ${mutedText}`}>
                Trigger mock API response representing live execution from <code className="text-indigo-600 dark:text-cyan-300 font-mono font-semibold">internal/api/router.go</code>.
              </p>
              <button
                onClick={handleSendRequest}
                className={`w-full font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-xs ${
                  isDark 
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-slate-950' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                Execute API Call
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Response Inspector */}
        <div className={`lg:col-span-7 border rounded-xl overflow-hidden flex flex-col transition ${cardClass}`}>
          <div className={`p-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                HTTP Response
              </span>
              {responseStatus && (
                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                  responseStatus >= 200 && responseStatus < 300 
                    ? (isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300')
                    : responseStatus === 409
                      ? (isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300')
                      : (isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300')
                }`}>
                  HTTP {responseStatus}
                </span>
              )}
            </div>

            {responseBody && (
              <button
                onClick={handleCopy}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          <div className="flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto min-h-[360px] shadow-inner">
            {responseBody ? (
              <pre className="text-slate-200 leading-relaxed whitespace-pre">
                {responseBody}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                <Terminal className="w-8 h-8 opacity-40" />
                <p>Send a request or test idempotency to view JSON response payload.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
