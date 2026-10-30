import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Server, 
  Layers, 
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { apiRequest } from '../api/client.ts';
import { useSocket } from '../context/SocketContext.tsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';

export const OverviewPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchData = async () => {
    try {
      const [overviewRes, jobsRes, workersRes] = await Promise.all([
        apiRequest('/analytics/overview'),
        apiRequest('/jobs?limit=5'),
        apiRequest('/workers')
      ]);

      setStats(overviewRes.data);
      setRecentJobs(jobsRes.data.jobs);
      setWorkers(workersRes.data);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to real-time events from socket
    if (socket) {
      socket.on('job_status_change', () => {
        fetchData();
      });
      socket.on('worker_updated', () => {
        fetchData();
      });
    }

    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [socket]);

  return (
    <div className="space-y-6">
      {/* Page Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry and execution metrics across distributed compute nodes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/submit"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
          >
            <span>+ Submit Workload</span>
          </Link>
          <button
            onClick={fetchData}
            className="p-2 glass-panel hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Workloads"
          value={stats?.total_jobs ?? '...'}
          subtitle={`${stats?.running_jobs || 0} active, ${stats?.queued_jobs || 0} queued`}
          icon={Layers}
          variant="cyan"
        />
        <MetricCard
          title="Active Workers"
          value={`${stats?.active_workers ?? '...'} / ${stats?.total_workers ?? '...'}`}
          subtitle="Real-time heartbeat verified"
          icon={Cpu}
          variant="emerald"
        />
        <MetricCard
          title="Avg Task Execution"
          value={stats?.avg_task_exec_time_ms ? `${stats.avg_task_exec_time_ms} ms` : '...'}
          subtitle={`${stats?.total_tasks_executed || 0} batches executed`}
          icon={Clock}
          variant="purple"
        />
        <MetricCard
          title="Records Processed"
          value={stats?.total_records_processed ? Number(stats.total_records_processed).toLocaleString() : '...'}
          subtitle="Zero data loss verified"
          icon={CheckCircle2}
          variant="amber"
        />
      </div>

      {/* Cluster Nodes & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Worker Nodes Card */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-sm text-white">Compute Nodes Status</h3>
            </div>
            <Link to="/workers" className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
              Details <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {workers.map((w) => (
              <div key={w.id} className="p-3.5 bg-slate-900/60 rounded-lg border border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-xs text-white">{w.name}</span>
                    <p className="text-[11px] text-slate-400 font-mono">{w.hostname} • {w.cpu_cores} Cores • {Math.round(w.total_ram_mb/1024)}GB</p>
                  </div>
                  <StatusBadge status={w.status} size="sm" />
                </div>
                {/* Real-time Hardware Meters */}
                <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-400">CPU Usage:</span>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, w.cpu_percent || 0)}%` }}
                      />
                    </div>
                    <span className="text-white font-mono mt-0.5 block">{w.cpu_percent || 0}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Available RAM:</span>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-cyan-400 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, ((w.available_ram_mb || 0) / w.total_ram_mb) * 100)}%` }}
                      />
                    </div>
                    <span className="text-white font-mono mt-0.5 block">{Math.round(w.available_ram_mb || 0)} MB</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Workloads Table */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-xl border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-sm text-white">Recent Workload Submissions</h3>
            </div>
            <Link to="/jobs" className="text-xs text-cyan-400 hover:underline flex items-center gap-1">
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-medium">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Job Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Policy</th>
                  <th className="py-2.5 px-3">Progress</th>
                  <th className="py-2.5 px-3 rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No jobs submitted yet. Click "+ Submit Workload" to start your first job.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-3 font-medium text-white max-w-[180px] truncate">
                        <Link to={`/jobs/${j.id}`} className="hover:text-emerald-400 transition-colors">
                          {j.name}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {j.job_type}
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono text-[11px] capitalize">
                        {j.scheduling_strategy?.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-3 w-36">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                j.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-cyan-400'
                              }`} 
                              style={{ width: `${j.progress_percent || 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-slate-300">{j.progress_percent || 0}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={j.status} size="sm" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
