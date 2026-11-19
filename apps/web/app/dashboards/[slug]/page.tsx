'use client';
import { use } from 'react';
import { DashboardView } from '@/components/DashboardView';

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <DashboardView path={`/dashboards/${slug}`} />;
}
