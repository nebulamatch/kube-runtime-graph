import React from 'react';
import Link from 'next/link';
import { Typography } from '../atoms/Typography';

type NavMenuItemProps = {
  icon: React.ReactNode;
  label: string;
  href: string;
  isActive?: boolean;
};

export const NavMenuItem: React.FC<NavMenuItemProps> = ({ icon, label, href, isActive = false }) => {
  return (
    <Link 
      href={href}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
        isActive 
          ? 'bg-primary-container/10 text-primary-fixed border-l-2 border-primary' 
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span className={isActive ? 'text-primary' : 'text-outline'}>
        {icon}
      </span>
      <Typography variant="body" className={`!text-sm ${isActive ? 'font-medium !text-primary-fixed' : ''}`}>
        {label}
      </Typography>
    </Link>
  );
};
