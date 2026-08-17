import { PositionedNode } from '@/types/orgChart';
import styles from './CenterCard.module.css';

interface Props {
  node: PositionedNode;
  color: string;
  /** Oculta labels de nome/cargo (modo fullscreen limpo) */
  hideText?: boolean;
}

const CR   = 75;  // single director: circle radius
const PR   = 40;  // paired director: each photo radius
const CX   = 52;  // paired director: x offset from origin to each photo center
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.toLowerCase() !== 'e' && w.toLowerCase() !== 'de')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function getShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function splitName(name: string): [string, string | null] {
  const match = name.match(/^(.+?)\s+[e&]\s+(.+)$/i);
  if (match) return [match[1].trim(), match[2].trim()];
  const words = name.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ') || null];
}

export default function CenterCard({ node, color, hideText = false }: Props) {
  // ── Modo duplo: nome com " & " indica co-diretores (mesma foto para ambos) ─
  const nameParts = node.name.split(/\s+&\s+/);
  const isPaired  = nameParts.length >= 2;

  if (isPaired) {
    const photo1 = node.photoUrl ?? null;
    const photo2 = node.photoUrl2 ?? null;
    const name1  = nameParts[0]?.trim() ?? node.name;
    const name2  = nameParts[1]?.trim() ?? '';
    const label  = `${getShortName(name1)} & ${getShortName(name2)}`;

    return (
      <g className={styles.group} {...({ title: `${node.name} — ${node.role}` } as { title?: string })}>
        <defs>
          <radialGradient id="grad-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor="#142133" stopOpacity={1} />
          </radialGradient>
          <clipPath id="clip-center">
            <circle cx={0} cy={0} r={CR - 1} />
          </clipPath>
        </defs>

        {/* Auras pulsantes */}
        <circle cx={0} cy={0} r={CR + 36} fill={color} fillOpacity={0.10} className={styles.glowAura} />
        <circle cx={0} cy={0} r={CR + 52} fill={color} fillOpacity={0.06} className={styles.glowAura2} />

        {/* Anel orbital externo */}
        <circle cx={0} cy={0} r={CR + 22} fill="none" stroke={color} strokeWidth={0.7} strokeOpacity={0.35} strokeDasharray="12 9" className={styles.orbitRingOuter} />

        {/* Anel orbital interno (sentido contrário) */}
        <circle cx={0} cy={0} r={CR + 13} fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.22} strokeDasharray="5 7" className={styles.orbitRingInner} />

        {/* Outer glow */}
        <circle cx={0} cy={0} r={CR + 10} fill={color} fillOpacity={0.07} />

        {/* Dashed ring */}
        <circle cx={0} cy={0} r={CR + 5} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />

        {/* Main border */}
        <circle cx={0} cy={0} r={CR + 2} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={0.75} className={styles.border} />

        {/* Background */}
        <circle cx={0} cy={0} r={CR} fill="url(#grad-center)" />

        {/* Initials: JO | AV — fallback por metade, coberto pela foto de quem tiver uma */}
        <text x={-CR * 0.30} y={0} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={CR * 0.34} fontWeight="700" fontFamily={FONT}>
          {getInitials(name1)}
        </text>
        <text x={CR * 0.30} y={0} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={CR * 0.34} fontWeight="700" fontFamily={FONT}>
          {getInitials(name2)}
        </text>

        {/* Fotos — com as 2, cada metade do círculo mostra a foto da própria
            pessoa; com só 1 (ex.: Diretoria, que não divide), essa foto cobre
            o círculo inteiro; sem nenhuma, mantém as iniciais visíveis. */}
        <g clipPath="url(#clip-center)">
          {photo1 && photo2 ? (
            <>
              <image href={photo1} x={-CR} y={-CR} width={CR} height={CR * 2} preserveAspectRatio="xMidYMid slice" />
              <image href={photo2} x={0} y={-CR} width={CR} height={CR * 2} preserveAspectRatio="xMidYMid slice" />
            </>
          ) : (
            (photo1 ?? photo2) && (
              <image href={photo1 ?? photo2 ?? undefined} x={-CR} y={-CR} width={CR * 2} height={CR * 2} preserveAspectRatio="xMidYMid slice" />
            )
          )}
        </g>

        {/* Linha divisória — some quando 1 foto só cobre o círculo inteiro
            (senão cortaria o rosto da pessoa ao meio); aparece com as 2 fotos
            (marca a divisão) ou sem nenhuma (acompanha as iniciais). */}
        {!(photo1 && !photo2) && !(photo2 && !photo1) && (
          <line x1={0} y1={-(CR - 2)} x2={0} y2={CR - 2}
            stroke={color} strokeWidth={0.8} strokeOpacity={0.35} />
        )}

        {!hideText && (
          <>
            <text x={0} y={CR + 20} textAnchor="middle" fill={color} fontSize={9} fontWeight="700" letterSpacing="2" fontFamily={FONT} opacity={0.9}>
              {node.role.toUpperCase()}
            </text>
            <text x={0} y={CR + 38} textAnchor="middle" style={{ fill: 'var(--text-primary)' }} fontSize={11} fontWeight="700" fontFamily={FONT}>
              {label}
            </text>
          </>
        )}
      </g>
    );
  }

  // ── Modo simples (card único) ──────────────────────────────────────────
  const [nameLine1, nameLine2] = splitName(node.name);
  const initials = getInitials(node.name);

  return (
    <g className={styles.group} {...({ title: `${node.name} — ${node.role}` } as { title?: string })}>
      <defs>
        <radialGradient id="grad-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor="#142133" stopOpacity={1} />
        </radialGradient>
        <clipPath id="clip-center">
          <circle cx={0} cy={0} r={CR - 1} />
        </clipPath>
      </defs>

      {/* Auras pulsantes */}
      <circle cx={0} cy={0} r={CR + 36} fill={color} fillOpacity={0.10} className={styles.glowAura} />
      <circle cx={0} cy={0} r={CR + 52} fill={color} fillOpacity={0.06} className={styles.glowAura2} />

      {/* Anel orbital externo */}
      <circle cx={0} cy={0} r={CR + 22} fill="none" stroke={color} strokeWidth={0.7} strokeOpacity={0.35} strokeDasharray="12 9" className={styles.orbitRingOuter} />

      {/* Anel orbital interno (sentido contrário) */}
      <circle cx={0} cy={0} r={CR + 13} fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.22} strokeDasharray="5 7" className={styles.orbitRingInner} />

      {/* Outer glow */}
      <circle cx={0} cy={0} r={CR + 10} fill={color} fillOpacity={0.07} />

      {/* Second ring (decorative) */}
      <circle cx={0} cy={0} r={CR + 5} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />

      {/* Main border */}
      <circle cx={0} cy={0} r={CR + 2} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={0.75} className={styles.border} />

      {/* Background */}
      <circle cx={0} cy={0} r={CR} fill="url(#grad-center)" />

      {/* Initials fallback */}
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={CR * 0.42} fontWeight="700" fontFamily={FONT}>
        {initials}
      </text>

      {/* Photo */}
      {node.photoUrl && (
        <image href={node.photoUrl} x={-CR} y={-CR} width={CR * 2} height={CR * 2}
          clipPath="url(#clip-center)" preserveAspectRatio="xMidYMid slice" />
      )}

      {!hideText && (
        <>
          <text x={0} y={CR + 20} textAnchor="middle" fill={color} fontSize={9} fontWeight="700" letterSpacing="2" fontFamily={FONT} opacity={0.9}>
            {node.role.toUpperCase()}
          </text>
          <text x={0} y={CR + 38} textAnchor="middle" style={{ fill: 'var(--text-primary)' }} fontSize={12} fontWeight="700" fontFamily={FONT}>
            {nameLine1}
          </text>
          {nameLine2 && (
            <text x={0} y={CR + 54} textAnchor="middle" style={{ fill: 'var(--text-primary)' }} fontSize={12} fontWeight="700" fontFamily={FONT}>
              {nameLine2}
            </text>
          )}
        </>
      )}
    </g>
  );
}
