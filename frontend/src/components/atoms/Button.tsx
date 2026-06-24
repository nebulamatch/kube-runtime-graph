import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  children, 
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    primary: 'bg-gradient-to-br from-primary to-primary-container text-on-primary border-none shadow-[0_0_10px_rgba(173,198,255,0.2)] hover:shadow-[0_0_15px_rgba(173,198,255,0.4)] focus:ring-primary-container',
    secondary: 'bg-gradient-to-br from-secondary to-secondary-container text-on-secondary border-none focus:ring-secondary-container',
    ghost: 'bg-transparent text-on-surface hover:bg-surface-variant border border-white/10 focus:ring-outline',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-12 px-8 text-base'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
