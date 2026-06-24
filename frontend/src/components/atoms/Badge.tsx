import React from 'react';
import { Typography } from './Typography';

type BadgeProps = {
  text: string;
  variant?: 'default' | 'http-get' | 'http-post' | 'http-put' | 'http-delete';
  className?: string;
};

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', className = '' }) => {
  const baseStyles = 'inline-flex items-center justify-center px-2 py-0.5 rounded-full border';
  
  const variants = {
    default: 'bg-surface-variant border-outline-variant text-on-surface',
    'http-get': 'bg-[rgba(16,185,129,0.1)] border-accent-green text-accent-green glow-green',
    'http-post': 'bg-[rgba(111,0,190,0.1)] border-secondary-container text-secondary glow-purple',
    'http-put': 'bg-[rgba(223,116,18,0.1)] border-[#df7412] text-[#df7412]',
    'http-delete': 'bg-[rgba(255,180,171,0.1)] border-error text-error glow-red',
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      <Typography variant="label" className="!text-[10px] leading-tight">
        {text}
      </Typography>
    </div>
  );
};
