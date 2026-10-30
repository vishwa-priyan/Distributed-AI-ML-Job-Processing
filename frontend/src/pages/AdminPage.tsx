import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Activity, 
  Settings, 
  CheckCircle2, 
  AlertTriangle,
  Save,
  Server
} from 'lucide-react';
import { apiRequest } from '../api/client.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [defaultPolicy, setDefaultPolicy] = useState('resource_aware');
  const [maxRetries, setMaxRetries] = useState(3);
  const [taskTimeout, setTaskTimeout] = useState(600);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    apiRequest('/admin/users').then((res) => setUsers(res.data)).catch(() => {});
    apiRequest('/admin/system-health').then((res) => setHealth(res.data)).catch(() => {});
    apiRequest('/admin/scheduling-policies').then((res) => {
      setDefaultPolicy(res.data.current_default);
      setMaxRetries(res.data.max_task_retries);
      setTaskTimeout(res.data.default_task_timeout_seconds);
    }).catch(() => {});
  }, []);

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiRequest('/admin/scheduling-policies', {
        method: 'PUT',
        body: JSON.stringify({
          default_policy: defaultPolicy,
          max_retries: maxRetries,
          task_timeout_seconds: taskTimeout
        })
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update policies');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">System Administration</h1>
        <p className="text-xs text-slate-400 mt-1">
          Cluster health monitoring, user access governance, and global scheduling policy controls
        </p>
      </div>

      {/* System Health Cards */}
      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium block">PostgreSQL Database</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white text-sm capitalize">{health.components.database.status}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
              Latency: {health.components.database.latency_ms} ms
            </span>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium block">Redis Broker / Queues</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white text-sm capitalize">{health.components.redis.status}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
              Latency: {health.components.redis.latency_ms} ms
            </span>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium block">Scheduler Engine</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white text-sm capitalize">{health.components.scheduler.status}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
              FastAPI Daemon :8000
            </span>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium block">Active Workers</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-bold text-emerald-400 text-lg">
                {health.components.workers.active} / {health.components.workers.total}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">Nodes online</span>
          </div>
        </div>
      )}

      {/* Global Scheduling Policies */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-sm text-white">Cluster Scheduling Policies</h3>
          </div>
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Policies updated successfully!
            </span>
          )}
        </div>

        <form onSubmit={handleSavePolicies} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Default Policy</label>
            <select
              value={defaultPolicy}
              onChange={(e) => setDefaultPolicy(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="resource_aware">Resource-Aware (Recommended)</option>
              <option value="predictive">Predictive Scheduling (ML Regressor)</option>
              <option value="least_loaded">Least Loaded</option>
              <option value="round_robin">Round Robin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Max Task Retries</label>
            <input
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Task Timeout (Seconds)</label>
            <input
              type="number"
              min={30}
              max={3600}
              value={taskTimeout}
              onChange={(e) => setTaskTimeout(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end mt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* User Governance Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Registered Users ({users.length})</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-medium border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-sans">Username</th>
                <th className="py-2.5 px-3 font-sans">Email</th>
                <th className="py-2.5 px-3 font-sans">Role</th>
                <th className="py-2.5 px-4 text-right font-sans">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/40">
                  <td className="py-3 px-4 font-bold text-white">{u.username}</td>
                  <td className="py-3 px-3 text-slate-400">{u.email}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      u.role === 'admin'
                        ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
