import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const s = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotColor = 'bg-slate-400';

  if (['COMPLETED', 'ONLINE', 'HEALTHY', 'UP'].includes(s)) {
    colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    dotColor = 'bg-emerald-400 animate-pulse';
  } else if (['RUNNING', 'BUSY', 'AGGREGATING'].includes(s)) {
    colorClasses = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    dotColor = 'bg-cyan-400 animate-ping';
  } else if (['QUEUED', 'SCHEDULED', 'VALIDATING', 'SUBMITTED'].includes(s)) {
    colorClasses = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    dotColor = 'bg-amber-400';
  } else if (['RETRYING', 'DRAINING', 'CANCEL_REQUESTED'].includes(s)) {
    colorClasses = 'bg-purple-500/10 text-purple-300 border-purple-500/30';
    dotColor = 'bg-purple-400';
  } else if (['FAILED', 'OFFLINE', 'CANCELLED', 'TIMED_OUT', 'STOPPED', 'UNHEALTHY'].includes(s)) {
    colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    dotColor = 'bg-rose-500';
  }

  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${colorClasses} ${px}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {s}
    </span>
  );
};
