import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  RotateCcw, 
  XCircle, 
  ArrowRight, 
  Filter, 
  Search,
  RefreshCw,
  PlusCircle
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { apiRequest } from '../api/client.ts';
import { useSocket } from '../context/SocketContext.tsx';

export const JobMonitorPage: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const { socket } = useSocket();

  const fetchJobs = async () => {
    try {
      const url = filterStatus ? `/jobs?status=${filterStatus}` : '/jobs';
      const res = await apiRequest(url);
      setJobs(res.data.jobs);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    if (socket) {
      socket.on('job_status_change', () => fetchJobs());
    }

    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [socket, filterStatus]);

  const handleCancel = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to cancel this job?')) return;
    try {
      await apiRequest(`/jobs/${jobId}/cancel`, { method: 'POST' });
      fetchJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel job');
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await apiRequest(`/jobs/${jobId}/retry`, { method: 'POST' });
      fetchJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to retry job');
    }
  };

  const filteredJobs = jobs.filter(j => 
    j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.job_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Job Monitor</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time tracking of distributed AI/ML batch executions across worker processes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/submit"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Workload</span>
          </Link>
          <button
            onClick={fetchJobs}
            className="p-2 glass-panel hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by job name or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {['', 'RUNNING', 'QUEUED', 'COMPLETED', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === st
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Job Name</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Policy</th>
                <th className="py-3 px-3">Batches</th>
                <th className="py-3 px-3">Progress</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No workloads matching your search/filter criteria.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white max-w-[220px]">
                      <Link to={`/jobs/${j.id}`} className="hover:text-emerald-400 transition-colors block truncate">
                        {j.name}
                      </Link>
                      <span className="text-[10px] font-mono text-slate-500 block">ID: {j.id.slice(0, 8)}...</span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[11px] text-slate-400">
                      {j.job_type}
                    </td>
                    <td className="py-3.5 px-3 text-slate-300 font-mono text-[11px] capitalize">
                      <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                        {j.scheduling_strategy?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-300">
                      {j.completed_batches} / {j.total_batches}
                    </td>
                    <td className="py-3.5 px-3 w-44">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              j.status === 'COMPLETED' ? 'bg-emerald-400' : j.status === 'FAILED' ? 'bg-rose-500' : 'bg-cyan-400'
                            }`}
                            style={{ width: `${j.progress_percent || 0}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-slate-300 w-10 text-right">
                          {j.progress_percent || 0}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <StatusBadge status={j.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {['RUNNING', 'QUEUED', 'SCHEDULED'].includes(j.status) && (
                          <button
                            onClick={() => handleCancel(j.id)}
                            className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                            title="Cancel Job"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {['FAILED', 'CANCELLED'].includes(j.status) && (
                          <button
                            onClick={() => handleRetry(j.id)}
                            className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                            title="Retry Job"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          to={`/jobs/${j.id}`}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors inline-flex items-center gap-1"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
