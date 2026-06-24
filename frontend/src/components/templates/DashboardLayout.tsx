import React from 'react';
import { Sidebar } from '../organisms/Sidebar';
import { TopNav } from '../organisms/TopNav';

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-surface-container-lowest flex text-on-surface font-body selection:bg-primary-container selection:text-on-primary">
      {/* 260px Fixed Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 ml-[260px] relative h-screen flex flex-col overflow-hidden">
        {/* Background gradient subtle glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary-container/5 rounded-full blur-[120px] pointer-events-none" />
        
        <TopNav />
        
        <div className="flex-1 relative overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};
