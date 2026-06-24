import React from 'react';

type StatusIndicatorProps = {
  status: 'healthy' | 'warning' | 'error' | 'offline';
  className?: string;
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, className = '' }) => {
  const styles = {
    healthy: 'bg-accent-green glow-green',
    warning: 'bg-tertiary glow-purple', /* Purple glow as requested for some states, but warning is usually amber */
    error: 'bg-error glow-red',
    offline: 'bg-outline-variant',
  };

  return (
    <div className={`w-2 h-2 rounded-full ${styles[status]} ${className}`} />
  );
};
