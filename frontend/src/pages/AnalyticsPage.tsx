import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Cpu, 
  Zap, 
  Award,
  Download
} from 'lucide-react';
import { apiRequest } from '../api/client.ts';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  Legend,
  LineChart,
  Line
} from 'recharts';

export const AnalyticsPage: React.FC = () => {
  const [schedulingData, setSchedulingData] = useState<any[]>([]);
  const [jobsAnalytics, setJobsAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest('/analytics/scheduling'),
      apiRequest('/analytics/jobs')
    ])
      .then(([schedRes, jobsRes]) => {
        setSchedulingData(schedRes.data.comparison);
        setJobsAnalytics(jobsRes.data);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const benchmarkMatrix = [
    { strategy: 'Round Robin', wall_clock: 5.286, speedup: 0.401, efficiency: 20.1, throughput: 378.36, latency: 79.81 },
    { strategy: 'Least Loaded', wall_clock: 3.701, speedup: 0.572, efficiency: 28.6, throughput: 540.36, latency: 50.18 },
    { strategy: 'Resource-Aware', wall_clock: 3.705, speedup: 0.572, efficiency: 28.6, throughput: 539.84, latency: 52.39 },
    { strategy: 'Predictive ML', wall_clock: 4.235, speedup: 0.500, efficiency: 25.0, throughput: 472.26, latency: 122.78 }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analytics & Benchmark Insights</h1>
        <p className="text-xs text-slate-400 mt-1">
          Empirical comparison of intelligent scheduling strategies, speedup efficiency, and parallel execution
        </p>
      </div>

      {/* Benchmark Summary Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Empirical Benchmark Matrix (N=2 Workers)</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Speedup: S(N) = T(1)/T(N) • Efficiency: E(N) = S(N)/N
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-sans">Scheduling Strategy</th>
                <th className="py-3 px-3">Wall Clock T(N)</th>
                <th className="py-3 px-3">Measured Speedup</th>
                <th className="py-3 px-3">Parallel Efficiency</th>
                <th className="py-3 px-3">Throughput</th>
                <th className="py-3 px-4 text-right">Avg Dispatch Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {benchmarkMatrix.map((b) => (
                <tr key={b.strategy} className="hover:bg-slate-900/40">
                  <td className="py-3 px-4 font-sans font-semibold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {b.strategy}
                  </td>
                  <td className="py-3 px-3 text-cyan-400 font-bold">{b.wall_clock}s</td>
                  <td className="py-3 px-3 text-emerald-400 font-bold">{b.speedup}x</td>
                  <td className="py-3 px-3 text-purple-400 font-bold">{b.efficiency}%</td>
                  <td className="py-3 px-3 text-amber-400">{b.throughput} rec/s</td>
                  <td className="py-3 px-4 text-right text-slate-400">{b.latency} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Execution Wall Clock Chart */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <h3 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Strategy Execution Time Comparison (Lower is Better)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchmarkMatrix}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="strategy" stroke="#64748b" textAnchor="middle" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="s" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="wall_clock" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Wall Clock (s)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Throughput Chart */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <h3 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            Throughput (Records / Sec) (Higher is Better)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchmarkMatrix}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="strategy" stroke="#64748b" textAnchor="middle" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="throughput" fill="#10b981" radius={[4, 4, 0, 0]} name="Records/Sec" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
