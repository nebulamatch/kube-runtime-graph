import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import styles from './layout.module.css';
import { Activity, LayoutDashboard, Settings } from 'lucide-react';
import { Providers } from '../components/Providers';
import AuthButton from '../components/AuthButton';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kube Runtime Graph',
  description: 'Real-time Kubernetes dependency visualizer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className={styles.container}>
            <aside className={styles.sidebar}>
            <div className={styles.brand}>
              <Activity color="#3b82f6" size={28} />
              <h1>KubeGraph</h1>
            </div>
            
            <nav className={styles.nav}>
              <Link href="/" className={`${styles.navItem} ${styles.active}`}>
                <LayoutDashboard size={20} />
                Runtime Graph
              </Link>
              <Link href="/settings" className={styles.navItem}>
                <Settings size={20} />
                Settings
              </Link>
            </nav>
          </aside>
          
          <main className={styles.main}>
            <header className={styles.header}>
              <div>
                {/* Cluster context or namespace selector could go here */}
                <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Cluster: local-cluster</h2>
              </div>
              <div>
                <AuthButton />
              </div>
            </header>
            
            <div className={styles.content}>
              {children}
            </div>
          </main>
        </div>
        </Providers>
      </body>
    </html>
  );
}
