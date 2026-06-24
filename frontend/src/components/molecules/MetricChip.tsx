import React from 'react';
import { Typography } from '../atoms/Typography';

type MetricChipProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

export const MetricChip: React.FC<MetricChipProps> = ({ icon, label, value }) => {
  return (
    <div className="flex items-center space-x-1.5 bg-surface-container/50 px-2 py-1 rounded-full border border-white/5">
      <span className="text-outline-variant flex items-center">
        {icon}
      </span>
      <div className="flex items-baseline space-x-1">
        <Typography variant="label" className="!text-[10px] text-on-surface-variant">
          {label}
        </Typography>
        <Typography variant="code" className="!text-[10px] text-on-surface font-medium">
          {value}
        </Typography>
      </div>
    </div>
  );
};
