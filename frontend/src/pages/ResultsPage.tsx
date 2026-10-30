import React, { useEffect, useState } from 'react';
import { 
  Layers, 
  Download, 
  FileText, 
  CheckCircle2, 
  Database,
  BarChart2,
  Table as TableIcon
} from 'lucide-react';
import { apiRequest, downloadFile } from '../api/client.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';

export const ResultsPage: React.FC = () => {
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingResult, setFetchingResult] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiRequest('/jobs?status=COMPLETED')
      .then((res) => {
        setCompletedJobs(res.data.jobs);
        if (res.data.jobs.length > 0) {
          selectJob(res.data.jobs[0].id);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const selectJob = async (jobId: string) => {
    setSelectedJobId(jobId);
    setFetchingResult(true);
    try {
      const res = await apiRequest(`/jobs/${jobId}/results`);
      setResultData(res.data);
    } catch (err) {
      setResultData(null);
    } finally {
      setFetchingResult(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Results & Artifacts</h1>
        <p className="text-xs text-slate-400 mt-1">
          Inspect deterministic aggregations, download CSV predictions, and view evaluation metrics
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: List of completed jobs */}
        <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 mb-3">
            Completed Workloads ({completedJobs.length})
          </h2>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {completedJobs.length === 0 ? (
              <p className="text-xs text-slate-500 p-4 text-center">No completed jobs yet.</p>
            ) : (
              completedJobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => selectJob(j.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedJobId === j.id
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="font-semibold text-xs truncate">{j.name}</p>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span className="font-mono">{j.job_type}</span>
                    <span>{new Date(j.completed_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Artifact Preview & Metrics */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
          {fetchingResult ? (
            <div className="py-20 text-center text-slate-400 text-xs">Loading artifact data...</div>
          ) : !resultData ? (
            <div className="py-20 text-center text-slate-500 text-xs">
              Select a completed job on the left to inspect results.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header with Download button */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-bold text-base text-white">Aggregated Result Artifact</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{resultData.result_path}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!selectedJobId) return;
                    try {
                      setDownloading(true);
                      await downloadFile(`/jobs/${selectedJobId}/artifacts`, `job_${selectedJobId}_artifact.csv`);
                    } catch (err: any) {
                      alert(err.message || 'Failed to download artifact.');
                    } finally {
                      setDownloading(false);
                    }
                  }}
                  disabled={downloading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> {downloading ? 'Downloading...' : 'Download Artifact'}
                </button>
              </div>

              {/* Evaluation Metrics JSON Card */}
              {resultData.preview?.evaluation_type ? (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-emerald-400" />
                    Model Evaluation Metrics
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[11px] text-slate-400">Accuracy</span>
                      <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">
                        {(resultData.preview.accuracy * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[11px] text-slate-400">Precision</span>
                      <p className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                        {(resultData.preview.precision * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[11px] text-slate-400">Recall</span>
                      <p className="text-xl font-bold text-purple-400 mt-1 font-mono">
                        {(resultData.preview.recall * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[11px] text-slate-400">F1-Score</span>
                      <p className="text-xl font-bold text-amber-400 mt-1 font-mono">
                        {(resultData.preview.f1_score * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Confusion Matrix */}
                  {resultData.preview.confusion_matrix && (
                    <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-300 block mb-2 font-mono">
                        Confusion Matrix (Actual vs Predicted):
                      </span>
                      <div className="inline-block border border-slate-700 rounded-lg overflow-hidden font-mono text-xs">
                        {resultData.preview.confusion_matrix.map((row: number[], ri: number) => (
                          <div key={ri} className="flex border-b border-slate-800 last:border-0">
                            {row.map((val: number, ci: number) => (
                              <div key={ci} className="w-16 py-2 text-center border-r border-slate-800 last:border-0 bg-slate-850/40 text-emerald-300">
                                {val}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* CSV Sample Preview Table */}
              {resultData.preview?.sample_rows ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <TableIcon className="w-4 h-4 text-cyan-400" />
                      Prediction Samples Preview (Total: {resultData.preview.total_rows} Records)
                    </h4>
                    <span className="text-[11px] text-emerald-400 font-mono">Ordered by Record Index</span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 max-h-80">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-800 text-slate-300 sticky top-0">
                        <tr>
                          {resultData.preview.headers?.map((h: string, idx: number) => (
                            <th key={idx} className="py-2 px-3 border-r border-slate-700/50 last:border-0">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {resultData.preview.sample_rows?.map((row: string[], ri: number) => (
                          <tr key={ri} className="hover:bg-slate-800/40 text-slate-300">
                            {row.map((val: string, ci: number) => (
                              <td key={ci} className="py-1.5 px-3 border-r border-slate-800 last:border-0">{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
