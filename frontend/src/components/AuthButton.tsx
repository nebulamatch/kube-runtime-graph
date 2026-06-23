'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { LogIn, LogOut, User } from 'lucide-react';
import React from 'react';

export default function AuthButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <User size={16} />
          <span style={{ fontSize: '0.9rem' }}>{session.user?.name}</span>
        </div>
        <button 
          onClick={() => signOut()}
          style={{ 
            background: 'rgba(255,255,255,0.05)', 
            border: '1px solid var(--border-color)', 
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.85rem'
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={() => signIn('azure-ad')}
      style={{ 
        background: 'var(--accent-color)', 
        border: 'none', 
        color: '#fff',
        padding: '6px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: 500,
        fontSize: '0.9rem'
      }}
    >
      <LogIn size={16} />
      Sign In with Azure AD
    </button>
  );
}
