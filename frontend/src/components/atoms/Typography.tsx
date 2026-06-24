import React from 'react';

type TypographyProps = {
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'label' | 'code';
  className?: string;
  children: React.ReactNode;
};

export const Typography: React.FC<TypographyProps> = ({ variant = 'body', className = '', children }) => {
  const styles = {
    h1: 'font-display text-display-lg font-bold tracking-tight',
    h2: 'font-display text-headline-md font-semibold tracking-tight',
    h3: 'font-display text-headline-sm font-semibold',
    body: 'font-body text-body-md text-on-surface-variant',
    label: 'font-mono text-mono-label font-medium uppercase tracking-wider',
    code: 'font-mono text-mono-code font-normal text-on-surface',
  };

  const Component = variant.startsWith('h') ? variant : variant === 'code' ? 'code' : 'p';

  // Provide fallback to font-sans if our custom properties aren't wired perfectly
  const Element = Component as any;

  return (
    <Element className={`${styles[variant]} ${className}`}>
      {children}
    </Element>
  );
};
