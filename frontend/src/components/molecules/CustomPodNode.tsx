import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Typography } from '../atoms/Typography';
import { StatusIndicator } from '../atoms/StatusIndicator';
import { MetricChip } from './MetricChip';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import HubIcon from '@mui/icons-material/Hub';

export const CustomPodNode = memo(({ data, selected }: NodeProps) => {
  const isSelected = selected;
  
  // Decide what icon to show based on pod name/type loosely
  const isDb = data.label.toLowerCase().includes('db') || data.label.toLowerCase().includes('redis') || data.label.toLowerCase().includes('postgres');

  return (
    <div className={`
      level-1-panel relative flex flex-col w-[280px] p-4 transition-all duration-300
      ${isSelected ? 'ring-2 ring-primary glow-purple border-primary' : 'hover:border-outline-variant'}
    `}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="bg-surface-container p-2 rounded-lg text-primary-fixed">
            {isDb ? <StorageIcon fontSize="small" /> : <HubIcon fontSize="small" />}
          </div>
          <div>
            <Typography variant="h3" className="text-on-surface truncate max-w-[150px]">
              {data.label}
            </Typography>
            <div className="flex items-center space-x-2 mt-0.5">
              <StatusIndicator status={data.status === 'Running' ? 'healthy' : 'error'} />
              <Typography variant="label" className="!text-[10px] text-on-surface-variant">
                {data.status || 'Running'}
              </Typography>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 mt-2">
        <MetricChip icon={<MemoryIcon fontSize="inherit" />} label="CPU" value="12m" />
        <MetricChip icon={<StorageIcon fontSize="inherit" />} label="MEM" value="128Mi" />
      </div>

      {/* Show IP or other metadata subtly */}
      <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
        <Typography variant="code" className="!text-[9px] text-outline">
          {data.ip || '10.244.x.x'}
        </Typography>
        <Typography variant="label" className="!text-[9px] text-outline">
          {data.namespace || 'default'}
        </Typography>
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
});

CustomPodNode.displayName = 'CustomPodNode';
