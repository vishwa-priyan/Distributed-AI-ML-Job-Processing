import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  Cpu, 
  Settings2, 
  AlertCircle, 
  Sparkles,
  Database,
  ArrowRight
} from 'lucide-react';
import { apiRequest } from '../api/client.ts';

export const JobSubmissionPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('Customer Churn Distributed Inference');
  const [description, setDescription] = useState('Parallel batch inference with intelligent worker dispatch');
  const [jobType, setJobType] = useState('csv_batch_inference');
  const [datasetMode, setDatasetMode] = useState<'sample' | 'upload'>('sample');
  const [sampleDataset, setSampleDataset] = useState('customer_churn');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [schedulingStrategy, setSchedulingStrategy] = useState('resource_aware');
  const [batchSize, setBatchSize] = useState(500);
  const [priority, setPriority] = useState(7);
  const [maxRetries, setMaxRetries] = useState(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState(600);

  // Model selection
  const [models, setModels] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  // Preview data
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load models
    apiRequest('/models')
      .then((res) => {
        setModels(res.data);
        if (res.data.length > 0) setSelectedModelId(res.data[0].id);
      })
      .catch(() => {});

    // Set sample preview
    loadSamplePreview('customer_churn');
  }, []);

  const loadSamplePreview = (key: string) => {
    if (key === 'customer_churn') {
      setPreviewData({
        headers: ['tenure', 'monthly_charges', 'total_charges', 'contract_type', 'payment_method', 'churn'],
        rows: [
          ['52', '45.47', '2400.91', '0', '2', '0'],
          ['15', '104.09', '1575.74', '0', '2', '1'],
          ['61', '23.84', '1371.66', '0', '2', '0'],
          ['21', '110.18', '2265.70', '0', '1', '1']
        ]
      });
    } else if (key === 'housing_prices') {
      setPreviewData({
        headers: ['square_feet', 'bedrooms', 'bathrooms', 'year_built', 'zipcode_density', 'price'],
        rows: [
          ['2100', '3', '2', '1998', '45.2', '425000.00'],
          ['1450', '2', '1', '1982', '62.1', '285000.00'],
          ['3200', '4', '3', '2015', '30.8', '680000.00']
        ]
      });
    } else {
      setPreviewData({
        headers: ['feature_1', 'feature_2', 'feature_3', 'target'],
        rows: [
          ['0.45', '1.20', '34.5', '1'],
          ['0.82', '0.95', '21.0', '0']
        ]
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // Read text preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (lines.length > 0) {
            const headers = lines[0].split(',');
            const rows = lines.slice(1, 5).map(l => l.split(','));
            setPreviewData({ headers, rows });
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let res;
      if (datasetMode === 'upload' && uploadedFile) {
        const formData = new FormData();
        formData.append('dataset', uploadedFile);
        formData.append('name', name);
        formData.append('description', description);
        formData.append('job_type', jobType);
        formData.append('scheduling_strategy', schedulingStrategy);
        formData.append('batch_size', String(batchSize));
        formData.append('priority', String(priority));
        formData.append('max_retries', String(maxRetries));
        formData.append('timeout_seconds', String(timeoutSeconds));
        if (selectedModelId) formData.append('model_id', selectedModelId);

        res = await apiRequest('/jobs', {
          method: 'POST',
          body: formData
        });
      } else {
        res = await apiRequest('/jobs', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description,
            job_type: jobType,
            scheduling_strategy: schedulingStrategy,
            batch_size: batchSize,
            priority,
            max_retries: maxRetries,
            timeout_seconds: timeoutSeconds,
            sample_dataset: sampleDataset,
            model_id: selectedModelId
          })
        });
      }

      const jobId = res.data.job.id;
      navigate(`/jobs/${jobId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit job.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Submit AI/ML Workload</h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure workload parameters, select an intelligent scheduling policy, and distribute tasks
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Configuration */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            1. Workload Specification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Job Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Workload Type</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
              >
                <option value="csv_batch_inference">CSV Batch Inference (Classification / Regression)</option>
                <option value="data_preprocessing">Data Preprocessing & Normalization</option>
                <option value="model_evaluation">Model Evaluation & Confusion Matrix</option>
                <option value="model_training">Model Training (Scikit-Learn)</option>
                <option value="image_classification">Image Classification / Feature Batch</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Section 2: Dataset Selection & Preview */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            2. Dataset & Features
          </h2>

          <div className="flex gap-4 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setDatasetMode('sample')}
              className={`text-xs font-medium pb-1 transition-colors ${
                datasetMode === 'sample' ? 'text-emerald-400 border-b-2 border-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pre-loaded Academic Datasets
            </button>
            <button
              type="button"
              onClick={() => setDatasetMode('upload')}
              className={`text-xs font-medium pb-1 transition-colors ${
                datasetMode === 'upload' ? 'text-emerald-400 border-b-2 border-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Upload Custom CSV Dataset
            </button>
          </div>

          {datasetMode === 'sample' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'customer_churn', name: 'Customer Churn (2,000 Rows)', desc: 'Classification: tenure, charges, contract' },
                { id: 'housing_prices', name: 'Housing Prices (2,000 Rows)', desc: 'Regression: sqft, bedrooms, year built' },
                { id: 'evaluation_test', name: 'Evaluation Holdout (300 Rows)', desc: 'Ground truth validation split' }
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSampleDataset(item.id);
                    loadSamplePreview(item.id);
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    sampleDataset === item.id
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="font-semibold text-xs text-white">{item.name}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-300 font-medium">Click to upload CSV dataset</p>
              <p className="text-[11px] text-slate-500 mt-1">Accepts CSV, max file size 100MB</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="mt-3 text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-600"
              />
            </div>
          )}

          {/* Dataset Preview Table */}
          {previewData && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <p className="text-xs font-semibold text-slate-300 mb-2">Dataset Schema & Preview (First Rows):</p>
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-800/80 text-slate-300 font-mono">
                    <tr>
                      {previewData.headers.map((h, i) => (
                        <th key={i} className="py-1.5 px-2.5 border-r border-slate-700/50 last:border-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {previewData.rows.map((row, ri) => (
                      <tr key={ri} className="text-slate-400 font-mono">
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-1.5 px-2.5 border-r border-slate-800 last:border-0">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Scheduling Strategy & Batching */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            3. Intelligent Scheduling Strategy & Execution Options
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'resource_aware',
                name: 'Resource-Aware',
                badge: 'Recommended',
                desc: 'Evaluates real-time CPU, RAM, GPU, queue depth and slot capacity'
              },
              {
                id: 'predictive',
                name: 'Predictive ML',
                badge: 'AI-Guided',
                desc: 'Estimates completion time using a trained HistGradientBoosting regression model'
              },
              {
                id: 'least_loaded',
                name: 'Least Loaded',
                badge: 'Dynamic',
                desc: 'Routes to worker process with lowest active task count'
              },
              {
                id: 'round_robin',
                name: 'Round Robin',
                badge: 'Static',
                desc: 'Fair cyclic rotation across healthy registered workers'
              }
            ].map((strat) => (
              <div
                key={strat.id}
                onClick={() => setSchedulingStrategy(strat.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  schedulingStrategy === strat.id
                    ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-lg shadow-purple-500/10'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-white">{strat.name}</span>
                    <span className="text-[10px] bg-slate-800 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20 font-mono">
                      {strat.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{strat.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Batch Size (records / task)</label>
              <input
                type="number"
                min={10}
                max={5000}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Controls degree of parallelism</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Job Priority (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Higher priority dispatches first</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Max Retries</label>
              <input
                type="number"
                min={0}
                max={5}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Exponential backoff with jitter</span>
            </div>
          </div>
        </div>

        {/* Submit Action Button */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="px-4 py-2.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-sm transition-all duration-200 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {submitting ? 'Submitting & Partitioning...' : 'Dispatch Job to Cluster'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
