import React, { useEffect, useState } from 'react';
import { 
  Cpu, 
  Server, 
  Activity, 
  RefreshCw, 
  ShieldAlert, 
  Layers, 
  CheckCircle2, 
  XCircle,
  HardDrive
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { apiRequest } from '../api/client.ts';
import { useSocket } from '../context/SocketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';

export const WorkerMonitorPage: React.FC = () => {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const { isAdmin } = useAuth();

  const fetchWorkers = async () => {
    try {
      const res = await apiRequest('/workers');
      setWorkers(res.data);
    } catch (err) {
      console.error('Failed to fetch workers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();

    if (socket) {
      socket.on('worker_updated', () => fetchWorkers());
    }

    const interval = setInterval(fetchWorkers, 3000);
    return () => clearInterval(interval);
  }, [socket]);

  const handleToggleDrain = async (workerId: string, currentDrain: boolean) => {
    try {
      await apiRequest(`/workers/${workerId}/drain`, {
        method: 'POST',
        body: JSON.stringify({ drain: !currentDrain })
      });
      fetchWorkers();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle drain mode');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Worker Node Cluster</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time node telemetry, hardware capacity, and dynamic drain controls
          </p>
        </div>
        <button
          onClick={fetchWorkers}
          className="p-2 glass-panel hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Worker Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workers.map((w) => {
          const ramUsedPercent = Math.min(100, Math.round(((w.total_ram_mb - (w.available_ram_mb || 0)) / w.total_ram_mb) * 100));

          return (
            <div key={w.id} className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">{w.name}</h3>
                      <p className="text-xs text-slate-400 font-mono">ID: {w.id} • {w.hostname}</p>
                    </div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>

                {/* Real Hardware Gauges */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {/* CPU Meter */}
                  <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" /> CPU Load
                      </span>
                      <span className="font-mono text-white">{w.cpu_percent || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, w.cpu_percent || 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1.5 block font-mono">
                      {w.cpu_cores} Logical Cores
                    </span>
                  </div>

                  {/* RAM Meter */}
                  <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> Memory Load
                      </span>
                      <span className="font-mono text-white">{ramUsedPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${ramUsedPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1.5 block font-mono">
                      {Math.round(w.available_ram_mb || 0)} MB free of {Math.round(w.total_ram_mb/1024)}GB
                    </span>
                  </div>
                </div>

                {/* Slots and capabilities */}
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Execution Slots:</span>
                    <span className="text-white font-mono">{w.active_tasks || 0} active / {w.max_concurrency} max slots</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">GPU Acceleration:</span>
                    <span className="text-white font-mono">{w.has_gpu ? (w.gpu_name || 'Enabled') : 'CPU Mode'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Supported Handlers:</span>
                    <div className="flex flex-wrap gap-1">
                      {w.supported_job_types?.map((type: string) => (
                        <span key={type} className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Drain Mode Button (Admin) */}
              {isAdmin && (
                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleToggleDrain(w.id, w.drain_mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                      w.drain_mode
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {w.drain_mode ? 'Resume Node' : 'Drain Node'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
