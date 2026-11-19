import type { Metadata } from 'next';
import { PersonaProvider } from '@/lib/api';
import { TopBar } from '@/components/TopBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mercadia Data',
  description: 'Analítica conversacional con métricas certificadas sobre un e-commerce ficticio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <PersonaProvider>
          <TopBar />
          {children}
        </PersonaProvider>
      </body>
    </html>
  );
}
