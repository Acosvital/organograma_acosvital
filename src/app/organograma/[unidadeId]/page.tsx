import { levelColors, levelNames } from '@/data/orgData';
import OrgChartRealtimeWrapper from '@/components/OrgChart/OrgChartRealtimeWrapper';
import styles from '../../page.module.css';

export default async function OrganogramaUnidadePage({
  params,
}: {
  params: Promise<{ unidadeId: string }>;
}) {
  const { unidadeId } = await params;

  return (
    <div className={styles.page}>
      <OrgChartRealtimeWrapper
        unidadeId={unidadeId}
        levelColors={levelColors}
        levelNames={levelNames}
      />
    </div>
  );
}
