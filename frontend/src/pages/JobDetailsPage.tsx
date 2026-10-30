import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Activity, 
  Cpu, 
  ArrowLeft, 
  Download, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  FileText,
  AlertTriangle,
  BrainCircuit,
  Layers
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { apiRequest } from '../api/client.ts';
import { useSocket } from '../context/SocketContext.tsx';

export const JobDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [jobData, setJobData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();

  const fetchJobDetails = async () => {
    if (!id) return;
    try {
      const res = await apiRequest(`/jobs/${id}`);
      setJobData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobDetails();

    if (socket && id) {
      socket.emit('join_job', id);
      socket.on('job_updated', () => fetchJobDetails());
    }

    const interval = setInterval(fetchJobDetails, 3000);
    return () => {
      clearInterval(interval);
      if (socket && id) socket.emit('leave_job', id);
    };
  }, [id, socket]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 text-sm">
        Loading workload execution data...
      </div>
    );
  }

  if (error || !jobData) {
    return (
      <div className="p-6 text-center text-rose-400 glass-panel rounded-xl">
        <p>{error || 'Job not found'}</p>
        <Link to="/jobs" className="mt-3 inline-block text-xs text-emerald-400 underline">
          Back to Job Monitor
        </Link>
      </div>
    );
  }

  const { job, tasks, transitions, decisions, artifacts } = jobData;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/jobs" className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Monitor
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{job.name}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Job ID: {job.id} • Submitted: {new Date(job.created_at).toLocaleString()}
          </p>
        </div>

        {job.status === 'COMPLETED' && artifacts && artifacts.length > 0 && (
          <a
            href={`/api/v1/jobs/${job.id}/artifacts`}
            download
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-4 h-4" />
            Download Final Artifact
          </a>
        )}
      </div>

      {/* Progress & Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Batch Progress</span>
          <div className="text-xl font-bold text-white mt-1">
            {job.completed_batches} / {job.total_batches} ({job.progress_percent}%)
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-emerald-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${job.progress_percent || 0}%` }}
            />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Scheduling Policy</span>
          <div className="text-lg font-bold text-purple-400 capitalize mt-1">
            {job.scheduling_strategy?.replace('_', ' ')}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Priority Level: {job.priority}/10</span>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Execution Duration</span>
          <div className="text-lg font-bold text-cyan-400 mt-1">
            {job.started_at && job.completed_at
              ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
              : (job.started_at ? 'In progress...' : 'Pending')}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Max Timeout: {job.timeout_seconds}s</span>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Fault Recovery</span>
          <div className="text-lg font-bold text-amber-400 mt-1">
            {job.failed_batches > 0 ? `${job.failed_batches} retried` : '0 Failures'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Max Retries: {job.max_retries}</span>
        </div>
      </div>

      {/* Intelligent Scheduling Decision Card */}
      {decisions && decisions.length > 0 && (
        <div className="glass-panel p-5 rounded-xl border border-purple-500/30 bg-purple-950/10">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-sm text-white">Intelligent Scheduling Decision</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400">Assigned Node:</span>
              <p className="font-bold text-white mt-0.5">{decisions[0].worker_name || decisions[0].selected_worker_id}</p>
            </div>
            <div>
              <span className="text-slate-400">Scheduling Latency:</span>
              <p className="font-mono text-cyan-400 mt-0.5">{decisions[0].scheduling_latency_ms} ms</p>
            </div>
            <div>
              <span className="text-slate-400">Predicted Exec Duration:</span>
              <p className="font-mono text-emerald-400 mt-0.5">
                {decisions[0].predicted_exec_time_ms ? `${decisions[0].predicted_exec_time_ms} ms` : 'Resource Vector Scored'}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-300 mt-3 pt-3 border-t border-purple-500/20 font-mono bg-slate-900/40 p-2.5 rounded-lg">
            <span className="text-purple-400 font-semibold">Decision Reason: </span>
            {decisions[0].decision_reason}
          </p>
        </div>
      )}

      {/* Batch Tasks Breakdown Table */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Distributed Task Batches ({tasks?.length || 0})</h3>
          </div>
          <span className="text-xs text-slate-400">Atomic Idempotent Commits</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-medium border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Batch</th>
                <th className="py-2.5 px-3">Records</th>
                <th className="py-2.5 px-3">Assigned Worker</th>
                <th className="py-2.5 px-3">Retries</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Output Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {tasks?.map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-900/40">
                  <td className="py-3 px-4 font-bold text-white">Batch #{t.batch_index ?? 0}</td>
                  <td className="py-3 px-3 text-slate-300">{t.record_count || 'Default'}</td>
                  <td className="py-3 px-3 text-emerald-400">
                    {t.worker_name ? `${t.worker_name} (${t.assigned_worker_id})` : (t.assigned_worker_id || 'Unassigned')}
                  </td>
                  <td className="py-3 px-3 text-slate-400">{t.retry_count}</td>
                  <td className="py-3 px-3">
                    <StatusBadge status={t.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400 max-w-[200px] truncate">
                    {t.output_data_path || 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* State Transitions Timeline */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800">
        <h3 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" /> State Transition Audit Trail
        </h3>
        <div className="space-y-3 font-mono text-xs">
          {transitions?.map((tr: any) => (
            <div key={tr.id} className="flex items-start gap-3 p-2.5 bg-slate-900/50 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {new Date(tr.created_at).toLocaleTimeString()}
              </span>
              <div className="flex-1">
                <span className="font-bold text-slate-300">{tr.from_status}</span>
                <span className="text-slate-500 mx-1.5">→</span>
                <span className="font-bold text-emerald-400">{tr.to_status}</span>
                <span className="text-slate-400 ml-2">({tr.trigger_event})</span>
                {tr.message && <p className="text-[11px] text-slate-400 font-sans mt-0.5">{tr.message}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
