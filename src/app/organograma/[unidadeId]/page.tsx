import { requireAuth } from '@/lib/apiAuth';
import { getOrgNodes } from '@/lib/data/org';
import { levelColors, levelNames } from '@/data/orgData';
import OrgChartRealtimeWrapper from '@/components/OrgChart/OrgChartRealtimeWrapper';
import type { OrgNode } from '@/types/orgChart';
import styles from '../../page.module.css';

export const dynamic = 'force-dynamic';

export default async function OrganogramaUnidadePage({
  params,
}: {
  params: Promise<{ unidadeId: string }>;
}) {
  const { unidadeId } = await params;

  const auth = await requireAuth();

  let initialNodes: OrgNode[] = [];
  if (!auth.err) {
    try {
      initialNodes = await getOrgNodes({ unidadeId });
    } catch {}
  }

  return (
    <div className={styles.page}>
      <OrgChartRealtimeWrapper
        key={unidadeId}
        unidadeId={unidadeId}
        initialNodes={initialNodes}
        levelColors={levelColors}
        levelNames={levelNames}
      />
    </div>
  );
}
