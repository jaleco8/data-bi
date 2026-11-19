'use client';
import { use } from 'react';
import { DashboardView } from '@/components/DashboardView';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DashboardView path={`/dashboards/saved/${id}`} />;
}
