'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react';
import type { GeoProjection, GeoPath, GeoPermissibleObjects } from 'd3-geo';
import type { GlobePoint, Star } from '@/types/globe';
import { COUNTRY_LABELS } from '@/data/countryNames';
import styles from './GlobeCanvas.module.css';
import { useFsMode } from '@/lib/fsContext';

const SPHERE = { type: 'Sphere' } as unknown as GeoPermissibleObjects;

export type GlobeTheme = 'hub' | 'vital';

/** Grupo de pontos agrupados por proximidade de coordenada */
export interface DotGroup {
  sx: number;
  sy: number;
  ids: number[];
  lat: number;
  lon: number;
}

interface Props {
  points: GlobePoint[];
  theme?: GlobeTheme;
  onPointClick?: (group: DotGroup) => void;
  /** Quando muda (via nonce), o globo gira suavemente para centralizar o ponto. */
  focusTarget?: { lat: number; lon: number; nonce: number } | null;
  /** ID do ponto em foco: as demais marcações ficam esmaecidas para destacá-lo. */
  focusedId?: number | null;
  /** Oculta a citação lateral e a barra de stats — usado quando o painel lateral assume a contagem. */
  hideInfoOverlays?: boolean;
  /** Oculta o título e o painel de controles — usado em modo tela cheia. */
  hideControls?: boolean;
  /** Desloca o centro do globo horizontalmente (0 = centro, 0.25 = 25% para direita). */
  xShift?: number;
}

interface CityProps { name: string; capital: boolean; pop: number; rank: number }
interface CityFeature { properties: CityProps; geometry: { coordinates: [number, number] } }

function seededRng(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildStars(): Star[] {
  return Array.from({ length: 420 }, (_, i) => ({
    x:   seededRng(i * 6),
    y:   seededRng(i * 6 + 1),
    r:   0.15 + seededRng(i * 6 + 2) * (i % 12 === 0 ? 2.2 : 1.4), // occasional bright star
    b:   seededRng(i * 6 + 3) * 0.72 + 0.18,
    spd: seededRng(i * 6 + 4) * 1.6 + 0.3,
    c:   seededRng(i * 6 + 5), // color temperature
  }));
}

/** Returns fill color for a land area based on its centroid coordinates */
function getBiomeColor(lon: number, lat: number): string {
  // ── Polar ice ──
  if (lat > 70 || lat < -62) return 'rgba(215,232,250,0.95)';
  // ── Boreal / taiga ──
  if (lat > 58)              return 'rgba(22,52,32,0.90)';

  // ── Hot deserts & arid ──
  const arid =
    (lon >= -17 && lon <=  25 && lat >= 14 && lat <= 34) || // Sahara W
    (lon >=  25 && lon <=  60 && lat >= 12 && lat <= 36) || // Sahara E + Oriente Médio
    (lon >=  42 && lon <=  66 && lat >= 12 && lat <= 32) || // Península Arábica
    (lon >=  50 && lon <=  88 && lat >= 37 && lat <= 52) || // Ásia Central
    (lon >=  88 && lon <= 122 && lat >= 38 && lat <= 50) || // Gobi / Mongolia
    (lon >=  60 && lon <=  78 && lat >= 22 && lat <= 34) || // Paquistão / NW Índia
    (lon >= 113 && lon <= 150 && lat >= -40 && lat <= -16) || // Austrália interior
    (lon >=  10 && lon <=  22 && lat >= -28 && lat <= -16) || // Namíbia
    (lon >= -76 && lon <= -66 && lat >= -30 && lat <= -14) || // Atacama
    (lon >= -72 && lon <= -57 && lat >= -54 && lat <= -38);   // Patagônia
  if (arid) return 'rgba(188,152,88,0.92)';

  // ── Savana / semi-árido ──
  const savanna =
    (lon >= -18 && lon <=  40 && lat >=  8 && lat <= 18) || // Sahel
    (lon >=  28 && lon <=  52 && lat >= -2 && lat <= 16) || // Chifre da África
    (lon >=  18 && lon <=  42 && lat >= -35 && lat <= -15) || // África do Sul seca
    (lon >= -18 && lon <=  15 && lat >=  2 && lat <= 10);    // África Oc. costeira
  if (savanna) return 'rgba(148,162,68,0.90)';

  // ── Floresta tropical ──
  const tropical =
    (lon >= -80 && lon <= -44 && lat >= -14 && lat <=  7) || // Amazônia
    (lon >=  14 && lon <=  32 && lat >=  -8 && lat <=  6) || // Congo
    (lon >=  95 && lon <= 145 && lat >= -10 && lat <= 15) || // Sudeste Asiático
    (lon >= -18 && lon <=  10 && lat >=   2 && lat <=  8);   // África Oc. úmida
  if (tropical) return 'rgba(16,72,18,0.92)';

  // ── Temperado (padrão) ──
  return 'rgba(28,65,25,0.90)';
}

async function loadGeoLibs() {
  const [d3geo, topo] = await Promise.all([
    import('d3-geo'),
    import('topojson-client'),
  ]);
  return { d3geo, topo };
}

const ZOOM_MIN  = 0.6;
const ZOOM_MAX  = 20;
// Graus de rotação por pixel arrastado, na zoom padrão (1x) — dividido pelo
// zoom atual (ver uso abaixo), então um zoom maior gira menos por pixel e
// vice-versa. Reduzido de 0.38: em telas grandes o mesmo gesto físico cobre
// muito mais pixels, então qualquer sensibilidade calibrada num mouse/laptop
// fica exagerada num painel touch de 65".
const ROTATE_SENSITIVITY = 0.16;
// Piso de tempo entre amostras de arraste usado no cálculo de velocidade (ver
// dragVelLonRef abaixo) — sem isso, dois eventos muito próximos no tempo (comum
// em touch, que as vezes entrega eventos em lote) geram um "elapsed" perto de
// 0ms, o que amplifica a velocidade estimada e faz a inércia pós-toque continuar
// girando o globo sozinha por vários frames. E MAX_DRAG_VEL trava um teto duro
// independente da causa (ruído de timing, flick genuíno muito rápido, etc.).
const MIN_DRAG_SAMPLE_MS = 8;
// Deslocamento total da inércia ≈ MAX_DRAG_VEL / (1 - fator de atrito por frame)
// — com o atrito antigo (0.93) e o teto antigo (8), um flick rápido coastava
// ~8/0.07 ≈ 114° sozinho depois de soltar o dedo. Reduzido para ~2.4/0.15 ≈ 16°.
const MAX_DRAG_VEL = 2.4; // graus por frame de 60fps (TARGET_DT)
const TARGET_DT = 1000 / 60; // 60fps target for rotation normalization
const MAX_HUB_ARCS = 40;     // cap on pairwise arcs to avoid O(n²) draw cost
const RESET_LON = 50;
const RESET_LAT = 18;

export default function GlobeCanvas({ points, theme = 'hub', onPointClick, focusTarget, focusedId, hideInfoOverlays, hideControls, xShift = 0 }: Props) {
  const fsMode          = useFsMode();
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const rotLonRef       = useRef(RESET_LON);
  const rotLatRef       = useRef(RESET_LAT);
  const zoomRef         = useRef(1);
  const draggingRef     = useRef(false);
  const dragLastRef     = useRef<{ x: number; y: number } | null>(null);
  const dragVelLonRef   = useRef(0);
  const dragVelLatRef   = useRef(0);
  const pinchRef        = useRef<number | null>(null);
  const animFrameRef    = useRef<number | null>(null);
  const lastTimeRef     = useRef<number>(0);
  const starsRef        = useRef<Star[]>(buildStars());
  const projRef         = useRef<GeoProjection | null>(null);
  const pathFnRef       = useRef<GeoPath | null>(null);
  const landRef         = useRef<GeoPermissibleObjects | null>(null);
  const bordersRef      = useRef<GeoPermissibleObjects | null>(null);
  const coastRef        = useRef<GeoPermissibleObjects | null>(null);
  const statesRef       = useRef<GeoPermissibleObjects | null>(null);
  const graticuleRef    = useRef<GeoPermissibleObjects | null>(null);
  const equatorRef      = useRef<GeoPermissibleObjects | null>(null);
  const tropicsCancerRef    = useRef<GeoPermissibleObjects | null>(null);
  const tropicsCapricornRef = useRef<GeoPermissibleObjects | null>(null);
  const sortedCitiesRef = useRef<CityFeature[]>([]);
  const geoLibsRef      = useRef<Awaited<ReturnType<typeof loadGeoLibs>> | null>(null);
  const countriesRef      = useRef<GeoPermissibleObjects[]>([]);
  const hoveredCountryRef = useRef<GeoPermissibleObjects | null>(null);
  const highlightAlphaRef = useRef(0);
  const pointsRef       = useRef<GlobePoint[]>(points);
  const autoRotateRef       = useRef(true);
  /** Posições dos grupos de dots visíveis — usado para hit-test no click */
  const dotGroupsRef        = useRef<DotGroup[]>([]);
  const onPointClickRef     = useRef(onPointClick);
  useEffect(() => { onPointClickRef.current = onPointClick; }, [onPointClick]);
  /** Proximity groups precomputed from points — rebuilt only when points change */
  const precomputedGroupsRef = useRef<{ lat: number; lon: number; ids: number[] }[]>([]);
  /** Hub-theme arc pairs capped at MAX_HUB_ARCS — rebuilt only when points change */
  const hubArcsRef = useRef<{ i: number; j: number; seed: number; line: GeoPermissibleObjects }[]>([]);
  /** Lerp targets: when set, animation loop smoothly moves toward these values */
  const targetLonRef    = useRef<number | null>(null);
  const targetLatRef    = useRef<number | null>(null);
  const targetZoomRef   = useRef<number | null>(null);
  const isResettingRef  = useRef(false);
  /** Ponto destacado pelo "voar até" — pulsa por alguns segundos. */
  const highlightRef    = useRef<{ lat: number; lon: number; until: number } | null>(null);
  /** ID em foco — mantido em ref para ser lido dentro do loop de desenho. */
  const focusedIdRef    = useRef<number | null>(null);

  const [ready, setReady]       = useState(false);
  const [zoom, setZoom]         = useState(1);
  const [mounted, setMounted]   = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const introStartRef = useRef(0);
  const [tooltip, setTooltip]   = useState<{ x: number; y: number; count: number; city: string } | null>(null);
  const biomeGroupsRef = useRef<{ fill: string; features: GeoPermissibleObjects[] }[]>([]);
  const nightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nightPathRef   = useRef<GeoPath | null>(null);
  // Canvas com o blur do terminador dia/noite JÁ aplicado ("baked") — o blur em
  // si (ctx.filter) é caro; recalculá-lo a cada frame é desperdício, já que o
  // terminador se desloca pouco de um frame para o outro. Só rebake a cada
  // NIGHT_UPDATE_MS; nos demais frames apenas um drawImage (blit) barato.
  const nightBlurredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nightUpdateAtRef      = useRef(0);
  // Gradientes radiais reaproveitados (criados 1x, reposicionados via translate)
  // em vez de um `createRadialGradient` por ponto/por frame.
  const vitalGlowGradRef  = useRef<CanvasGradient | null>(null);
  const hubPinGlowGradRef = useRef<CanvasGradient | null>(null);
  // Telas grandes (painéis 4K, ex. quiosque touch de 65") não desenham os anéis
  // pulsantes dos pontos — o efeito "piscante" fica exagerado/distrativo nessa
  // escala. Atualizado no resize junto com o buffer do canvas.
  const skipPulseRingsRef = useRef(false);
  // Mesmo gatilho de tela grande, mas para custos de desenho que se somam a
  // cada frame (estrelas, brilhos decorativos) — o draw() completo do globo
  // (mapa-múndi + grade + atmosfera) já é pesado; em hardware fraco isso pode
  // cair pra ~1fps ("tick" a cada segundo em vez de rotação fluida).
  const reduceFxRef = useRef(false);
  const arcParticleGradsRef = useRef<CanvasGradient[] | null>(null);
  // Buffers reaproveitados entre frames (evita alocar array novo + GC a cada tick).
  const visGroupsBufRef   = useRef<DotGroup[]>([]);
  const visHubBufRef      = useRef<{ pt: GlobePoint; sx: number; sy: number; fade: number }[]>([]);
  const occupiedBufRef    = useRef<[number, number, number, number][]>([]);
  const occupiedHubBufRef = useRef<[number, number, number, number][]>([]);
  // Sincronização throttled do state `zoom` (usado só pelo % no painel) — o
  // desenho sempre lê zoomRef.current ao vivo; sem isso, o lerp de zoom e o
  // wheel forçavam um re-render de todo o componente a cada frame/evento.
  const lastZoomSyncRef    = useRef(0);
  const lastSyncedZoomRef  = useRef(1);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { focusedIdRef.current = focusedId ?? null; }, [focusedId]);

  // ── Precompute per-frame-expensive data whenever points change ──
  useEffect(() => {
    // Vital theme: cada ponto renderizado individualmente (sem agrupamento)
    precomputedGroupsRef.current = points.map(p => ({ lat: p.lat, lon: p.lon, ids: [p.id] }));

    // Hub theme: pairwise arc list capped at MAX_HUB_ARCS (was O(n²) every frame)
    const pairs: typeof hubArcsRef.current = [];
    outer: for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        pairs.push({
          i, j,
          seed: ((points[i].id * 3 + points[j].id * 7) % 97) * 0.01,
          line: {
            type: 'LineString' as const,
            coordinates: [[points[i].lon, points[i].lat], [points[j].lon, points[j].lat]],
          } as GeoPermissibleObjects,
        });
        if (pairs.length >= MAX_HUB_ARCS) break outer;
      }
    }
    hubArcsRef.current = pairs;
  }, [points]);

  useEffect(() => { setMounted(true); }, []);

  // ── Acessibilidade: desliga a rotação automática para quem prefere menos movimento ──
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (mq.matches) {
        autoRotateRef.current = false;
        setAutoRotate(false);
      }
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // ── "Voar até" um ponto: gira o globo para centralizá-lo, aproxima o zoom
  //    e marca o ponto para o destaque pulsante. ──────────────────────────
  useEffect(() => {
    if (!focusTarget) return;
    targetLonRef.current = -focusTarget.lon;
    targetLatRef.current = Math.max(-85, Math.min(85, -focusTarget.lat));
    isResettingRef.current = true;
    targetZoomRef.current = Math.max(zoomRef.current, 4.8); // bom zoom no local
    highlightRef.current = { lat: focusTarget.lat, lon: focusTarget.lon, until: performance.now() + 4200 };
    // Pausa o mapa ao focar uma empresa (clique na lista ou no marcador).
    autoRotateRef.current = false;
    setAutoRotate(false);
  }, [focusTarget]);

  // ── Offscreen canvases for night terminator — created once, cleaned on unmount ──
  useEffect(() => {
    nightCanvasRef.current = document.createElement('canvas');
    nightBlurredCanvasRef.current = document.createElement('canvas');
    return () => {
      nightCanvasRef.current = null;
      nightBlurredCanvasRef.current = null;
    };
  }, []);

  // ── Load geo libraries + world data ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const libs = await loadGeoLibs();
      if (cancelled) return;
      geoLibsRef.current = libs;

      const [res, statesRes, citiesRes] = await Promise.all([
        fetch('/world-data/countries-110m.json'),
        fetch('/world-data/states-50m.json'),
        fetch('/world-data/cities.json'),
      ]);
      const [data, statesData, citiesData] = await Promise.all([
        res.json(),
        statesRes.json(),
        citiesRes.json(),
      ]);
      if (cancelled) return;

      const { topo, d3geo } = libs;
      landRef.current    = topo.feature(data, data.objects.land) as GeoPermissibleObjects;
      bordersRef.current = topo.mesh(data, data.objects.countries, (a: unknown, b: unknown) => a !== b) as unknown as GeoPermissibleObjects;
      coastRef.current   = topo.mesh(data, data.objects.countries, (a: unknown, b: unknown) => a === b) as unknown as GeoPermissibleObjects;
      const fc = topo.feature(data, data.objects.countries) as unknown as { features: GeoPermissibleObjects[] };
      countriesRef.current = fc.features;

      // Pre-compute biome groups: batch countries by fill color so each biome is one draw call
      const biomeMap = new Map<string, { fill: string; features: GeoPermissibleObjects[] }>();
      for (const feat of fc.features) {
        const [lon, lat] = d3geo.geoCentroid(feat as GeoPermissibleObjects);
        const fill = getBiomeColor(lon, lat);
        const g = biomeMap.get(fill);
        if (g) g.features.push(feat as GeoPermissibleObjects);
        else biomeMap.set(fill, { fill, features: [feat as GeoPermissibleObjects] });
      }
      biomeGroupsRef.current = Array.from(biomeMap.values());

      statesRef.current  = statesData as GeoPermissibleObjects;

      // Pre-compute graticule geometry once (expensive — avoids re-running every frame)
      graticuleRef.current = d3geo.geoGraticule().step([15, 15])() as unknown as GeoPermissibleObjects;
      equatorRef.current   = d3geo.geoGraticule().step([360, 90])() as unknown as GeoPermissibleObjects;

      // Pre-create tropic parallels as dense LineStrings (many points = smooth arc on sphere)
      const makeTropic = (lat: number): GeoPermissibleObjects => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: Array.from({ length: 361 }, (_, i) => [i - 180, lat]),
        },
        properties: {},
      } as unknown as GeoPermissibleObjects);
      tropicsCancerRef.current    = makeTropic(23.43659);
      tropicsCapricornRef.current = makeTropic(-23.43659);

      // Pre-sort cities once by importance so collision detection always wins correctly
      const cityData = citiesData as { features: CityFeature[] };
      sortedCitiesRef.current = [...cityData.features].sort(
        (a, b) => a.properties.rank - b.properties.rank || b.properties.pop - a.properties.pop,
      );

      const proj = d3geo.geoOrthographic().clipAngle(90);
      projRef.current = proj;
      // Create the path generator once and reuse; context is updated each frame
      pathFnRef.current = d3geo.geoPath(proj);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Draw function ──
  const draw = useCallback((timestamp: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // Use logical CSS pixels for all coordinates; scale buffer to physical pixels.
    // Cap em 2x: acima disso o ganho visual é imperceptível e o custo de preencher
    // o buffer (crítico em GPUs móveis fracas, ex. painéis touch Android) cresce à toa.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W   = cv.clientWidth;
    const H   = cv.clientHeight;
    if (!W || !H) return; // canvas not yet laid out
    const cx  = W * (0.5 + xShift);
    const cy  = H / 2;
    // Intro animation — ease-out cubic over 2.5 s, starts when globe first becomes ready
    if (ready && introStartRef.current === 0) introStartRef.current = timestamp;
    const introLinear = introStartRef.current > 0 ? Math.min(1, (timestamp - introStartRef.current) / 2500) : 0;
    const introEase   = introLinear < 1 ? 1 - Math.pow(1 - introLinear, 3) : 1;
    const R   = Math.min(W, H) * 0.41 * zoomRef.current * introEase;
    const t   = timestamp / 1000;
    const TAU = Math.PI * 2;
    const pts = pointsRef.current;
    const z   = zoomRef.current;

    // Apply DPR transform so all drawing is in CSS-pixel space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // ── Background — deep space, near-black with subtle blue tint ──
    const bg = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, Math.max(W, H) * 0.85);
    bg.addColorStop(0,   '#04091a');
    bg.addColorStop(0.5, '#02060f');
    bg.addColorStop(1,   '#010308');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Stars — varied colors (blue-white / white / warm) with gentle twinkle ──
    // Em telas grandes/hardware fraco, desenha só 1 em cada 3 estrelas — 420
    // arcos + sin() por frame é caro demais pra somar ao resto do desenho.
    const starStep = reduceFxRef.current ? 3 : 1;
    for (let i = 0; i < starsRef.current.length; i += starStep) {
      const s = starsRef.current[i];
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.spd + s.b * 25));
      ctx.globalAlpha = s.b * 0.78 * tw;
      ctx.fillStyle = s.c < 0.28 ? '#b8d8ff' : s.c < 0.65 ? '#e8f2ff' : '#fff6e0';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Outer atmosphere halo ──
    const atm = ctx.createRadialGradient(cx, cy, R * 0.90, cx, cy, R * 1.55);
    atm.addColorStop(0,   'rgba(30,82,215,0.24)');
    atm.addColorStop(0.35,'rgba(18,58,175,0.11)');
    atm.addColorStop(0.7, 'rgba(6,24,100,0.04)');
    atm.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.55, 0, TAU);
    ctx.fillStyle = atm;
    ctx.fill();

    // ── Bright limb — thin luminous ring at globe edge (as seen from space) ──
    // Puramente decorativo — pulado em telas grandes pra economizar 1 gradiente
    // radial + fill por frame.
    if (!reduceFxRef.current) {
    const limb = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.10);
    limb.addColorStop(0,    'rgba(60,130,255,0.00)');
    limb.addColorStop(0.35, 'rgba(100,175,255,0.32)');
    limb.addColorStop(0.65, 'rgba(50,120,230,0.14)');
    limb.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.10, 0, TAU);
    ctx.fillStyle = limb;
    ctx.fill();
    }

    // ── Loading state ──
    if (!ready || !projRef.current || !geoLibsRef.current || !pathFnRef.current) {
      const sph = ctx.createRadialGradient(cx - R * 0.18, cy - R * 0.22, R * 0.04, cx, cy, R);
      sph.addColorStop(0, '#1c3070');
      sph.addColorStop(0.3, '#0e1e4a');
      sph.addColorStop(0.65, '#080f25');
      sph.addColorStop(1, '#020510');
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = sph; ctx.fill();
      const a0 = t * 2.8;
      ctx.strokeStyle = 'rgba(194,65,12,0.8)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, R + 14, a0, a0 + 1.6); ctx.stroke();
      ctx.strokeStyle = 'rgba(70,130,255,0.25)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.45)';
      ctx.font = '400 13px "Fira Sans",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Carregando dados geográficos…', cx, cy + R + 38);
      ctx.textAlign = 'left';
      return;
    }

    const { d3geo } = geoLibsRef.current;
    const proj = projRef.current;
    const path = pathFnRef.current;

    // Update projection in-place (no new object) and bind current ctx
    proj.scale(R).translate([cx, cy]).rotate([rotLonRef.current, rotLatRef.current, 0]);
    path.context(ctx);

    const antipodeLon = -rotLonRef.current;
    const antipodeLat = -rotLatRef.current;

    const isVis = (lon: number, lat: number): boolean =>
      d3geo.geoDistance([lon, lat], [antipodeLon, antipodeLat]) < Math.PI / 2;

    // ── Ocean — deep blue, slightly richer than before ──
    ctx.beginPath(); path(SPHERE);
    const ocean = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    ocean.addColorStop(0,    '#1a3a62');
    ocean.addColorStop(0.45, '#122848');
    ocean.addColorStop(0.82, '#0a1a30');
    ocean.addColorStop(1,    '#050d1c');
    ctx.fillStyle = ocean; ctx.fill();

    // ── Subsolar point — calculated from wall-clock UTC, drives day/night + lighting ──
    const _sunNow  = new Date();
    const _sunDoy  = (_sunNow.getTime() - Date.UTC(_sunNow.getUTCFullYear(), 0, 1)) / 86400000;
    const sunLat   = -23.43659 * Math.cos(2 * Math.PI * (_sunDoy + 10) / 365);
    const _sunUtcH = _sunNow.getUTCHours() + _sunNow.getUTCMinutes() / 60 + _sunNow.getUTCSeconds() / 3600;
    const sunLon   = ((12 - _sunUtcH) * 15 + 540) % 360 - 180;
    const antiLon  = sunLon > 0 ? sunLon - 180 : sunLon + 180;
    const antiLat  = -sunLat;
    // Project sun to canvas coordinates (valid even when sun is on far hemisphere)
    const _sunPP  = proj([sunLon, sunLat]) ?? [cx + R * 0.4, cy - R * 0.3];
    const _sdx    = _sunPP[0] - cx, _sdy = _sunPP[1] - cy;
    const _sdist  = Math.hypot(_sdx, _sdy) || Math.max(R, 1);
    const lightNX = _sdx / _sdist; // normalized sun direction x
    const lightNY = _sdy / _sdist; // normalized sun direction y
    // sunVis: 1 when sun faces viewer, fades to 0 at limb, stays 0 behind globe
    const _sunVisDist = d3geo.geoDistance([sunLon, sunLat], [antipodeLon, antipodeLat]);
    const sunVis = Math.max(0, Math.cos(_sunVisDist));

    // ── Sea glint — broad diffuse sun reflection on ocean ──
    // Puramente decorativo — pulado em telas grandes (1 gradiente radial + fill).
    if (sunVis > 0 && !reduceFxRef.current) {
      const gx = cx + lightNX * R * 0.30;
      const gy = cy + lightNY * R * 0.30;
      const seaGlint = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.72);
      seaGlint.addColorStop(0,   `rgba(210,235,255,${(0.16 * sunVis).toFixed(3)})`);
      seaGlint.addColorStop(0.38,`rgba(140,195,255,${(0.07 * sunVis).toFixed(3)})`);
      seaGlint.addColorStop(0.75,`rgba(60,130,220,${(0.02 * sunVis).toFixed(3)})`);
      seaGlint.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.beginPath(); path(SPHERE);
      ctx.fillStyle = seaGlint; ctx.fill();
    }

    // ── Graticule (pre-computed, not recreated each frame) ──
    if (graticuleRef.current) {
      ctx.beginPath(); path(graticuleRef.current);
      ctx.strokeStyle = 'rgba(50,95,210,0.2)';
      ctx.lineWidth = 0.45; ctx.stroke();
    }
    if (equatorRef.current) {
      ctx.beginPath(); path(equatorRef.current);
      ctx.strokeStyle = 'rgba(80,145,255,0.35)';
      ctx.lineWidth = 0.8; ctx.stroke();
    }

    // ── Tropic of Cancer (+23.44°) and Capricorn (−23.44°) in amber ──
    if (tropicsCancerRef.current && tropicsCapricornRef.current) {
      ctx.beginPath();
      path(tropicsCancerRef.current);
      path(tropicsCapricornRef.current);
      ctx.strokeStyle = 'rgba(251,146,60,0.28)';
      ctx.lineWidth = 0.65; ctx.stroke();
    }

    // ── Land — biome colors batched by group ──
    if (biomeGroupsRef.current.length > 0) {
      for (const group of biomeGroupsRef.current) {
        ctx.beginPath();
        for (const feat of group.features) path(feat);
        ctx.fillStyle = group.fill;
        ctx.fill();
      }
      // shared outline pass — dark halo + light edge for cross-biome visibility
      if (landRef.current) {
        ctx.beginPath(); path(landRef.current);
        ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 2.0; ctx.stroke();
        ctx.strokeStyle = 'rgba(160,190,160,0.30)'; ctx.lineWidth = 0.7; ctx.stroke();
      }
    } else if (landRef.current) {
      ctx.beginPath(); path(landRef.current);
      ctx.fillStyle = 'rgba(24,58,24,0.90)'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 2.0; ctx.stroke();
      ctx.strokeStyle = 'rgba(160,190,160,0.30)'; ctx.lineWidth = 0.7; ctx.stroke();
    }

    // ── Day/night terminator — offscreen single-blur technique, "baked" e reaproveitado ──
    // O blur (ctx.filter) é a operação mais cara deste componente por frame; o
    // terminador se desloca pouco entre frames consecutivos, então só é
    // recalculado + desfocado a cada NIGHT_UPDATE_MS. Nos demais frames, apenas
    // um drawImage (blit) do resultado já borrado — sem custo de filter.
    {
      const nc = nightCanvasRef.current;
      const ncBlurred = nightBlurredCanvasRef.current;
      if (nc && ncBlurred) {
        if (nc.width !== cv.width || nc.height !== cv.height) {
          nc.width = cv.width; nc.height = cv.height;
          ncBlurred.width = cv.width; ncBlurred.height = cv.height;
          nightUpdateAtRef.current = 0; // força rebake após resize
        }

        const NIGHT_UPDATE_MS = 66; // ~15fps é suficiente para um overlay já borrado
        if (timestamp - nightUpdateAtRef.current > NIGHT_UPDATE_MS) {
          nightUpdateAtRef.current = timestamp;
          const gc = d3geo.geoCircle().center([antiLon, antiLat]).precision(1.5);
          const nctx = nc.getContext('2d')!;
          nctx.clearRect(0, 0, nc.width, nc.height);

          // Reutiliza o geoPath em vez de criar novo objeto a cada frame
          if (!nightPathRef.current) nightPathRef.current = d3geo.geoPath().projection(proj);
          const nPath = nightPathRef.current.context(nctx);
          nctx.beginPath();
          nPath(gc.radius(98)() as unknown as GeoPermissibleObjects);
          nctx.fillStyle = 'rgba(0,3,15,0.28)'; nctx.fill();
          nctx.beginPath();
          nPath(gc.radius(90)() as unknown as GeoPermissibleObjects);
          nctx.fillStyle = 'rgba(0,3,15,0.58)'; nctx.fill();

          // "Bake" do blur — roda só aqui, não no frame principal
          const blurPx = Math.max(5, R * 0.055);
          const bctx = ncBlurred.getContext('2d')!;
          bctx.clearRect(0, 0, ncBlurred.width, ncBlurred.height);
          bctx.filter = `blur(${blurPx.toFixed(1)}px)`;
          bctx.drawImage(nc, 0, 0);
          bctx.filter = 'none';
        }

        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
        ctx.drawImage(ncBlurred, 0, 0); // blit barato — sem filter
        ctx.restore();
      }
    }

    // ── Hovered country highlight (vital theme) ──
    highlightAlphaRef.current += ((hoveredCountryRef.current ? 0.7 : 0) - highlightAlphaRef.current) * 0.12;
    if (highlightAlphaRef.current > 0.01 && hoveredCountryRef.current) {
      ctx.beginPath(); path(hoveredCountryRef.current);
      ctx.globalAlpha = highlightAlphaRef.current;
      ctx.fillStyle = 'rgba(239,68,68,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,100,100,0.8)';
      ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Country borders — double stroke: dark shadow + light line ──
    if (bordersRef.current) {
      ctx.lineJoin = 'round';
      ctx.beginPath(); path(bordersRef.current);
      ctx.strokeStyle = 'rgba(0,0,0,0.52)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(210,225,245,0.62)'; ctx.lineWidth = 0.7; ctx.stroke();
    }

    // ── Coastlines — double stroke: prominent dark halo + bright edge ──
    if (coastRef.current) {
      ctx.lineJoin = 'round';
      ctx.beginPath(); path(coastRef.current);
      ctx.strokeStyle = 'rgba(0,0,0,0.62)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(220,238,255,0.88)'; ctx.lineWidth = 1.1; ctx.stroke();
    }

    // ── State / province borders — double stroke, fade in with zoom ──
    if (statesRef.current && z >= 1.0) {
      const alpha = Math.min(1, (z - 1.0) / 0.6);
      ctx.lineJoin = 'round';
      ctx.beginPath(); path(statesRef.current);
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = 'rgba(0,0,0,0.70)';
      ctx.lineWidth = Math.min(1.4, 0.6 + z * 0.1); ctx.stroke();
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = 'rgba(200,220,245,0.70)';
      ctx.lineWidth = Math.min(0.55, 0.25 + z * 0.04); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Cities — pre-sorted, dots always, labels with collision detection ──
    if (sortedCitiesRef.current.length > 0 && z >= 1.0) {
      // How many rank tiers to show — more cities revealed with more zoom
      const maxRank = z < 2 ? 1 : z < 3 ? 3 : z < 5 ? 5 : z < 8 ? 7 : 10;
      // Base font scales with zoom; individual city scales it further by rank
      const baseFontPx = Math.max(8, Math.min(14, 7.5 + z * 0.5));
      // rank→ [fontScale, labelMinZoom] — more important = larger text, appears sooner
      const CITY_TIER: Record<number, [number, number]> = {
        1:  [1.18, 1.0],
        2:  [1.05, 1.4],
        3:  [0.92, 2.0],
        4:  [0.82, 3.0],
        5:  [0.74, 4.2],
        6:  [0.68, 5.5],
        7:  [0.62, 6.5],
        8:  [0.58, 7.5],
        9:  [0.54, 8.5],
        10: [0.50, 9.5],
      };

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const occupied = occupiedBufRef.current;
      occupied.length = 0;
      const PAD = 3;

      const overlaps = (x: number, y: number, w: number, h: number): boolean => {
        for (const [ox, oy, ow, oh] of occupied) {
          if (x - PAD < ox + ow && x + w + PAD > ox && y - PAD < oy + oh && y + h + PAD > oy) return true;
        }
        return false;
      };

      const HALF_PI = Math.PI / 2;

      for (const feature of sortedCitiesRef.current) {
        if (feature.properties.rank > maxRank) continue;
        const { rank, capital: isCapital, name } = feature.properties;
        const [lon, lat] = feature.geometry.coordinates;
        if (!isVis(lon, lat)) continue;

        const dist = d3geo.geoDistance([lon, lat], [antipodeLon, antipodeLat]);
        const edgeFade = Math.max(0, 1 - dist / HALF_PI) ** 1.5;
        if (edgeFade < 0.06) continue;

        const pp = proj([lon, lat]);
        if (!pp) continue;
        const [sx, sy] = pp;

        const dotR = isCapital
          ? Math.max(2.0, Math.min(4.0, 1.8 + (5 - Math.min(rank, 5)) * 0.35))
          : Math.max(1.2, Math.min(3.0, 1.0 + (5 - Math.min(rank, 5)) * 0.25));

        ctx.globalAlpha = edgeFade * 0.92;

        if (isCapital) {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#ffd73c';
          const s = dotR * 0.85;
          ctx.fillRect(-s, -s, s * 2, s * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = '#c8e1ff';
          ctx.beginPath();
          ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }

        const tierKey = Math.min(10, Math.max(1, rank)) as keyof typeof CITY_TIER;
        const [fontScale, labelMinZoom] = CITY_TIER[tierKey];
        if (z < labelMinZoom || edgeFade < 0.15) continue;

        const cityFontPx = Math.max(6, Math.round(baseFontPx * fontScale));
        const weight = isCapital ? '600' : rank <= 3 ? '500' : '400';
        ctx.font = `${weight} ${cityFontPx}px "Fira Sans",system-ui,sans-serif`;

        const labelAlpha = Math.min(1, (z - labelMinZoom) / 0.5) * edgeFade;
        const metrics = ctx.measureText(name);
        const lw = metrics.width;
        const lh = cityFontPx;
        const lx = sx + dotR + 3;
        const ly = sy - lh / 2;

        if (overlaps(lx, ly, lw, lh)) continue;
        occupied.push([lx, ly, lw, lh]);

        ctx.globalAlpha = labelAlpha * 0.85;
        ctx.lineWidth = Math.max(2, cityFontPx * 0.28);
        ctx.strokeStyle = 'rgb(4,10,35)';
        ctx.lineJoin = 'round';
        ctx.strokeText(name, lx, sy);

        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = isCapital ? '#fff082' : rank <= 3 ? '#f0f8ff' : '#b9d7ff';
        ctx.fillText(name, lx, sy);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Globe rim ──
    ctx.beginPath(); path(SPHERE);
    ctx.strokeStyle = 'rgba(70,135,255,0.38)'; ctx.lineWidth = 1.8; ctx.stroke();

    // ── Specular sheen — directional sun highlight across globe face ──
    if (sunVis > 0) {
      const shX1 = cx + lightNX * R * 0.32, shY1 = cy + lightNY * R * 0.32;
      const shX2 = cx + lightNX * R * 0.05, shY2 = cy + lightNY * R * 0.05;
      const sh = ctx.createRadialGradient(shX1, shY1, 0, shX2, shY2, R * 0.92);
      sh.addColorStop(0,   `rgba(160,210,255,${(0.22 * sunVis).toFixed(3)})`);
      sh.addColorStop(0.3, `rgba(100,165,255,${(0.08 * sunVis).toFixed(3)})`);
      sh.addColorStop(0.6, `rgba(50,110,220,${(0.02 * sunVis).toFixed(3)})`);
      sh.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }

    // ── Country names — tier-based font + min-zoom so small countries only appear when zoomed ──
    const TIER_CFG: Record<number, { minZoom: number; fontScale: number }> = {
      1: { minZoom: 0.60, fontScale: 1.15 },
      2: { minZoom: 0.70, fontScale: 0.92 },
      3: { minZoom: 1.10, fontScale: 0.76 },
      4: { minZoom: 1.80, fontScale: 0.62 },
    };
    const baseFontPx = Math.max(7, Math.min(13, 10 * z));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;
    const HALF_PI2 = Math.PI / 2;
    for (const c of COUNTRY_LABELS) {
      const tier = c.tier ?? 2;
      const cfg = TIER_CFG[tier];
      if (z < cfg.minZoom) continue;
      if (!isVis(c.lon, c.lat)) continue;
      const dist = d3geo.geoDistance([c.lon, c.lat], [antipodeLon, antipodeLat]);
      const alpha = Math.max(0, 1 - dist / HALF_PI2) ** 1.5;
      if (alpha < 0.15) continue;
      const pp = proj([c.lon, c.lat]);
      if (!pp) continue;
      const fSize = Math.max(5, Math.round(baseFontPx * cfg.fontScale));
      ctx.font = `400 ${fSize}px "Fira Sans",system-ui,sans-serif`;
      ctx.globalAlpha = alpha * 0.82;
      ctx.lineWidth = Math.max(2, fSize * 0.28);
      ctx.strokeStyle = 'rgba(2,6,20,0.96)';
      ctx.strokeText(c.name, pp[0], pp[1]);
      ctx.fillStyle = '#a0c8ff';
      ctx.fillText(c.name, pp[0], pp[1]);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Arcs between points (hub theme only) ──
    // Pairs precomputed in useEffect — O(MAX_HUB_ARCS) per frame instead of O(n²)
    if (theme === 'hub') {
      for (const { i, j, seed, line } of hubArcsRef.current) {
        if (i >= pts.length || j >= pts.length) continue;
        const viA = isVis(pts[i].lon, pts[i].lat);
        const viB = isVis(pts[j].lon, pts[j].lat);
        if (!viA && !viB) continue;

        ctx.beginPath(); path(line);
        ctx.strokeStyle = 'rgba(180,70,10,0.08)'; ctx.lineWidth = 22; ctx.stroke();
        ctx.strokeStyle = 'rgba(220,110,28,0.2)';  ctx.lineWidth = 8;  ctx.stroke();
        ctx.strokeStyle = 'rgba(255,160,48,0.92)'; ctx.lineWidth = 2.2; ctx.stroke();

        // 3 gradientes fixos (um por tier de partícula) criados 1x e reaproveitados
        // via translate — antes eram até 3 novos gradientes por arco, por frame.
        if (!arcParticleGradsRef.current) {
          arcParticleGradsRef.current = [0, 1, 2].map((p) => {
            const sz = p === 0 ? 13 : p === 1 ? 7 : 4;
            const al = p === 0 ? 1  : p === 1 ? 0.6 : 0.35;
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
            g.addColorStop(0, `rgba(255,242,165,${al})`);
            g.addColorStop(0.35, `rgba(255,145,38,${al * 0.75})`);
            g.addColorStop(1, 'rgba(194,65,12,0)');
            return g;
          });
        }
        const arcGrads = arcParticleGradsRef.current;

        const interp = d3geo.geoInterpolate(
          [pts[i].lon, pts[i].lat],
          [pts[j].lon, pts[j].lat],
        );
        for (let p = 0; p < 3; p++) {
          const spd = 0.22 + p * 0.12 + seed * 0.07;
          const off = p * 0.33 + seed * 0.5;
          const s   = ((t * spd + off) % 1 + 1) % 1;
          const [plon, plat] = interp(s);
          if (!isVis(plon, plat)) continue;
          const pp = proj([plon, plat]);
          if (!pp) continue;
          const [ppx, ppy] = pp;
          const sz = p === 0 ? 13 : p === 1 ? 7 : 4;
          ctx.fillStyle = arcGrads[p];
          ctx.translate(ppx, ppy);
          ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fill();
          ctx.translate(-ppx, -ppy);
        }
      }
    }

    // ── Points / pins — VITAL THEME ──
    if (theme === 'vital' && pts.length > 0) {
      // Groups precomputed in useEffect when points change (was O(n) Map build every frame)
      // Screen positions still computed per-frame since they depend on current rotation/zoom.
      // Buffer reaproveitado entre frames (evita alocar array novo + GC a cada tick).
      const visGroups = visGroupsBufRef.current;
      visGroups.length = 0;
      for (const g of precomputedGroupsRef.current) {
        if (!isVis(g.lon, g.lat)) continue;
        const pp = proj([g.lon, g.lat]);
        if (!pp) continue;
        visGroups.push({ sx: pp[0], sy: pp[1], ids: g.ids, lat: g.lat, lon: g.lon });
      }

      // Store for click hit-testing
      dotGroupsRef.current = visGroups;

      // Foco numa empresa: as demais ficam bem esmaecidas para destacá-la.
      const focusedId = focusedIdRef.current;
      const dim = focusedId != null;
      const bulkAlpha = dim ? 0.1 : 1;

      if (visGroups.length > 0) {
        // Step 3a — 3 anéis de pulso escalonados (sem foco). Desativado em
        // telas ≥ 4K (ex. painel touch 65") — o efeito piscante fica exagerado
        // nessa escala e o custo por ponto some junto.
        if (!dim && !skipPulseRingsRef.current) {
          for (let ring = 0; ring < 3; ring++) {
            const ph  = ((t * 0.85 + ring * 0.33) % 1);
            const rad = ph * 30 + 5;
            const alpha = Math.pow(1 - ph, 1.4) * 0.58;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ring === 0 ? '#ef4444' : ring === 1 ? '#f87171' : '#fca5a5';
            ctx.lineWidth = ring === 0 ? 1.4 : ring === 1 ? 1.0 : 0.7;
            ctx.beginPath();
            for (const { sx, sy } of visGroups) {
              ctx.moveTo(sx + rad, sy);
              ctx.arc(sx, sy, rad, 0, TAU);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // Step 3b — Orbe de glow individual por ponto (até 80 visíveis)
        // Gradiente criado 1x e reaproveitado via translate (antes: 1 novo por ponto/frame).
        if (visGroups.length <= 80) {
          if (!vitalGlowGradRef.current) {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
            g.addColorStop(0,   'rgba(239,68,68,0.60)');
            g.addColorStop(0.45,'rgba(239,68,68,0.20)');
            g.addColorStop(1,   'rgba(239,68,68,0)');
            vitalGlowGradRef.current = g;
          }
          ctx.globalAlpha = bulkAlpha;
          ctx.fillStyle = vitalGlowGradRef.current;
          for (const { sx, sy } of visGroups) {
            ctx.translate(sx, sy);
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
            ctx.translate(-sx, -sy);
          }
          ctx.globalAlpha = 1;
        }

        // Step 3c — Red dots (ONE fill), esmaecidos quando há foco
        ctx.globalAlpha = bulkAlpha;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        for (const { sx, sy } of visGroups) {
          ctx.moveTo(sx + 6, sy);
          ctx.arc(sx, sy, 6, 0, TAU);
        }
        ctx.fill();

        // Step 3d — White highlight (ONE fill)
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        for (const { sx, sy } of visGroups) {
          ctx.moveTo(sx + 2.5, sy);
          ctx.arc(sx, sy, 2.5, 0, TAU);
        }
        ctx.fill();
        ctx.globalAlpha = 1;

        // Step 3e — Count badge for groups with multiple clients
        const hasBadges = visGroups.some(g => g.ids.length > 1);
        if (hasBadges) {
          ctx.save();
          ctx.globalAlpha = bulkAlpha;
          ctx.font = 'bold 8px "Fira Sans",system-ui,sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const { sx, sy, ids } of visGroups) {
            if (ids.length <= 1) continue;
            const bx = sx + 7, by = sy - 7;
            ctx.fillStyle = '#7f1d1d';
            ctx.beginPath();
            ctx.arc(bx, by, 7, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#fef2f2';
            ctx.fillText(ids.length > 99 ? '99+' : String(ids.length), bx, by);
          }
          ctx.restore();
        }

        // Step 3f — Empresa em foco desenhada por cima das esmaecidas
        if (dim) {
          const fg = visGroups.find((g) => g.ids.includes(focusedId!));
          if (fg) {
            ctx.beginPath(); ctx.arc(fg.sx, fg.sy, 7, 0, TAU);
            ctx.fillStyle = '#ef4444'; ctx.fill();
            ctx.beginPath(); ctx.arc(fg.sx, fg.sy, 2.8, 0, TAU);
            ctx.fillStyle = '#ffffff'; ctx.fill();
          }
        }
      }
    }

    // ── Points / pins — HUB THEME ──
    // Os marcadores sempre aparecem; os rótulos usam fade de borda + detecção de
    // colisão, mantendo legível um aglomerado denso (ex.: todas as filiais no
    // Brasil) em vez de empilhar textos sobrepostos.
    if (theme === 'hub' && pts.length > 0) {
      const HALF_PI_HUB = Math.PI / 2;

      // Pré-projeta os pinos visíveis e calcula o fade conforme a distância da borda.
      // Buffer reaproveitado entre frames (evita alocar array novo + GC a cada tick).
      const visHub = visHubBufRef.current;
      visHub.length = 0;
      for (const pt of pts) {
        if (!isVis(pt.lon, pt.lat)) continue;
        const pp = proj([pt.lon, pt.lat]);
        if (!pp) continue;
        const dist = d3geo.geoDistance([pt.lon, pt.lat], [antipodeLon, antipodeLat]);
        const fade = Math.max(0, 1 - dist / HALF_PI_HUB) ** 1.4;
        if (fade < 0.04) continue;
        visHub.push({ pt, sx: pp[0], sy: pp[1], fade });
      }

      // ── Marcadores: anéis pulsantes + brilho + ponto (todos os pinos visíveis) ──
      // Gradiente do glow criado 1x e reaproveitado via translate (antes: 1 novo por
      // pino/frame, sem cap — o pior caso desta seção).
      if (!hubPinGlowGradRef.current) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        g.addColorStop(0, 'rgba(255,125,42,0.92)');
        g.addColorStop(0.28, 'rgba(194,65,12,0.48)');
        g.addColorStop(1, 'rgba(194,65,12,0)');
        hubPinGlowGradRef.current = g;
      }
      for (const { sx, sy, fade } of visHub) {
        // Anéis de pulso — mesmo corte em telas ≥ 4K que o tema "vital" (ver skipPulseRingsRef).
        if (!skipPulseRingsRef.current) {
          for (let r = 0; r < 3; r++) {
            const ph = ((t * 1.25 + r * 0.42) % 1);
            ctx.globalAlpha = (1 - ph) * 0.68 * fade;
            ctx.strokeStyle = 'rgb(194,65,12)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, sy, ph * 34 + 3, 0, TAU); ctx.stroke();
          }
        }
        ctx.globalAlpha = fade;

        ctx.fillStyle = hubPinGlowGradRef.current;
        ctx.translate(sx, sy);
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fill();
        ctx.translate(-sx, -sy);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Rótulos: pinos mais centrais primeiro; pula os que colidem ──
      const occupiedHub = occupiedHubBufRef.current;
      occupiedHub.length = 0;
      const PADH = 4;
      const overlapsHub = (x: number, y: number, w: number, h: number): boolean => {
        for (const [ox, oy, ow, oh] of occupiedHub) {
          if (x - PADH < ox + ow && x + w + PADH > ox && y - PADH < oy + oh && y + h + PADH > oy) return true;
        }
        return false;
      };

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 13px "Fira Sans",system-ui,sans-serif';
      // Ordena por fade decrescente in-place (visHub já é um buffer próprio, não
      // precisa copiar): rótulos centrais têm prioridade na reserva de espaço.
      visHub.sort((a, b) => b.fade - a.fade);
      for (const { pt, sx, sy, fade } of visHub) {
        if (fade < 0.3) continue; // perto da borda → só o marcador
        const lw = ctx.measureText(pt.label).width;
        const lx = sx + 15;
        const ly = sy - 14;
        if (overlapsHub(lx, ly, lw, 20)) continue;
        occupiedHub.push([lx, ly, lw, 20]);

        ctx.globalAlpha = fade;
        ctx.shadowColor = 'rgba(2,6,23,0.98)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(pt.label, lx, sy - 4);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Destaque do "voar até" — anéis pulsantes sobre o ponto escolhido ──
    const hl = highlightRef.current;
    if (hl && timestamp < hl.until && isVis(hl.lon, hl.lat)) {
      const hpp = proj([hl.lon, hl.lat]);
      if (hpp) {
        const [hx, hy] = hpp;
        // Anéis expandindo
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.85 + i / 3) % 1);
          ctx.globalAlpha = (1 - ph) * 0.75;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(hx, hy, 9 + ph * 50, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Marcador central
        ctx.beginPath(); ctx.arc(hx, hy, 11, 0, TAU);
        ctx.fillStyle = 'rgba(253,224,71,0.22)'; ctx.fill();
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
  }, [ready, theme, xShift]);

  // ── Resize canvas buffer to match CSS size × device pixel ratio ──
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width  = Math.round(cv.clientWidth  * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);

      const fullDpr = window.devicePixelRatio || 1;
      const physW = window.screen.width  * fullDpr;
      const physH = window.screen.height * fullDpr;
      const isLargeDisplay = Math.max(physW, physH) >= 3840 && Math.min(physW, physH) >= 2160;
      skipPulseRingsRef.current = isLargeDisplay;
      reduceFxRef.current = isLargeDisplay;
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  // ── Animation loop — delta-time rotation, frame-rate independent ──
  useEffect(() => {
    const loop = (timestamp: number) => {
      // Clamp dt to 100ms max to avoid huge jumps when tab regains focus
      const raw = lastTimeRef.current > 0 ? timestamp - lastTimeRef.current : TARGET_DT;
      const dt  = Math.min(raw, 100);
      lastTimeRef.current = timestamp;

      if (isResettingRef.current && targetLonRef.current !== null && targetLatRef.current !== null) {
        // Smooth lerp toward reset target (shortest arc for longitude)
        const lonDiff  = targetLonRef.current - rotLonRef.current;
        const lonDelta = ((lonDiff + 180) % 360 + 360) % 360 - 180;
        const latDelta = targetLatRef.current - rotLatRef.current;
        if (Math.abs(lonDelta) < 0.3 && Math.abs(latDelta) < 0.3) {
          rotLonRef.current  = targetLonRef.current;
          rotLatRef.current  = targetLatRef.current;
          targetLonRef.current  = null;
          targetLatRef.current  = null;
          isResettingRef.current = false;
        } else {
          rotLonRef.current += lonDelta * 0.07 * (dt / TARGET_DT);
          rotLatRef.current += latDelta * 0.07 * (dt / TARGET_DT);
        }
        dragVelLonRef.current = 0;
        dragVelLatRef.current = 0;
      } else if (!draggingRef.current) {
        // Inertia — decays smoothly after drag release
        const vl = dragVelLonRef.current;
        const vt = dragVelLatRef.current;
        if (Math.abs(vl) > 0.003 || Math.abs(vt) > 0.003) {
          rotLonRef.current += vl * (dt / TARGET_DT);
          rotLatRef.current += vt * (dt / TARGET_DT);
          rotLatRef.current = Math.max(-85, Math.min(85, rotLatRef.current));
          // Frame-rate independent friction — 0.85 per frame at 60fps (era 0.93:
          // decaimento lento demais fazia a inércia coastar por muitos frames).
          const friction = Math.pow(0.85, dt / TARGET_DT);
          dragVelLonRef.current *= friction;
          dragVelLatRef.current *= friction;
        } else if (autoRotateRef.current) {
          // Auto-rotate resumes only after inertia has died down
          dragVelLonRef.current = 0;
          dragVelLatRef.current = 0;
          rotLonRef.current += 0.025 * (dt / TARGET_DT);
        }
      }

      // Lerp suave de zoom (usado pelo "voar até")
      if (targetZoomRef.current !== null) {
        const dz = targetZoomRef.current - zoomRef.current;
        if (Math.abs(dz) < 0.01) {
          zoomRef.current = targetZoomRef.current;
          targetZoomRef.current = null;
        } else {
          zoomRef.current += dz * 0.12 * (dt / TARGET_DT);
        }
      }

      // Sincroniza o state `zoom` (só usado pelo % exibido no painel) de forma
      // throttled — o desenho já lê zoomRef.current ao vivo a cada frame; sem
      // isso, o lerp de zoom e o wheel forçavam um re-render de todo o
      // componente (painel, título, tooltip) a cada frame/evento.
      if (timestamp - lastZoomSyncRef.current > 100) {
        lastZoomSyncRef.current = timestamp;
        if (Math.abs(zoomRef.current - lastSyncedZoomRef.current) > 0.005) {
          lastSyncedZoomRef.current = zoomRef.current;
          setZoom(zoomRef.current);
        }
      }

      draw(timestamp);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [draw]);


  // ── Pointer / touch + zoom events ──
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    // setZoom não é chamado aqui — o loop de animação sincroniza o state a partir
    // de zoomRef de forma throttled (evita um re-render por evento de wheel/pinch).
    const applyZoom = (factor: number) => {
      zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor));
    };

    // ── Vital theme: click detection on dots ──
    const HIT_RADIUS = 18; // px — generous hit area
    const CLICK_THRESHOLD = 6; // px — movement beyond this = drag, not click
    let dragStartX = 0;
    let dragStartY = 0;

    const findHitGroup = (clientX: number, clientY: number): DotGroup | null => {
      const rect = cv.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      let best: DotGroup | null = null;
      let bestDist = Infinity;
      for (const g of dotGroupsRef.current) {
        const d = Math.hypot(mx - g.sx, my - g.sy);
        if (d < HIT_RADIUS && d < bestDist) { bestDist = d; best = g; }
      }
      return best;
    };

    let lastHitKey = '';
    let prevDragT = 0;

    const onMouseHover = (e: MouseEvent) => {
      if (theme === 'vital' && !draggingRef.current) {
        const hit = findHitGroup(e.clientX, e.clientY);
        cv.style.cursor = hit ? 'pointer' : 'grab';
        const hitKey = hit ? `${hit.lat.toFixed(4)},${hit.lon.toFixed(4)}` : '';
        if (hitKey !== lastHitKey) {
          lastHitKey = hitKey;
          if (hit && geoLibsRef.current && countriesRef.current.length > 0) {
            const { d3geo } = geoLibsRef.current;
            let found: GeoPermissibleObjects | null = null;
            for (const feat of countriesRef.current) {
              if (d3geo.geoContains(feat, [hit.lon, hit.lat])) { found = feat; break; }
            }
            hoveredCountryRef.current = found;
            const rect = cv.getBoundingClientRect();
            // Find nearest city for the tooltip label
            let nearestCity = '';
            if (sortedCitiesRef.current.length > 0) {
              let minDist = Infinity;
              for (const c of sortedCitiesRef.current) {
                const [cLon, cLat] = c.geometry.coordinates;
                const d = (cLon - hit.lon) ** 2 + (cLat - hit.lat) ** 2;
                if (d < minDist) { minDist = d; nearestCity = c.properties.name; }
              }
            }
            setTooltip({ x: rect.left + hit.sx, y: rect.top + hit.sy, count: hit.ids.length, city: nearestCity });
          } else {
            hoveredCountryRef.current = null;
            setTooltip(null);
          }
        }
      }
      if (!draggingRef.current || !dragLastRef.current) return;
      const now = performance.now();
      const sens = ROTATE_SENSITIVITY / zoomRef.current;
      const dx = e.clientX - dragLastRef.current.x;
      const dy = e.clientY - dragLastRef.current.y;
      rotLonRef.current += dx * sens;
      rotLatRef.current -= dy * sens;
      rotLatRef.current  = Math.max(-85, Math.min(85, rotLatRef.current));
      // Track velocity per frame for inertia on release
      const elapsed = Math.max(MIN_DRAG_SAMPLE_MS, now - prevDragT);
      dragVelLonRef.current = Math.max(-MAX_DRAG_VEL, Math.min(MAX_DRAG_VEL, dx * sens * (TARGET_DT / elapsed)));
      dragVelLatRef.current = Math.max(-MAX_DRAG_VEL, Math.min(MAX_DRAG_VEL, -dy * sens * (TARGET_DT / elapsed)));
      prevDragT = now;
      dragLastRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMD = (e: MouseEvent) => {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      draggingRef.current = true;
      dragLastRef.current = { x: e.clientX, y: e.clientY };
      dragVelLonRef.current = 0;
      dragVelLatRef.current = 0;
      prevDragT = performance.now();
      hoveredCountryRef.current = null;
      lastHitKey = '';
      setTooltip(null);
      // Cancel any in-progress reset animation
      isResettingRef.current = false;
    };
    const onMM = onMouseHover;
    const onMU = (e: MouseEvent) => {
      draggingRef.current = false;
      dragLastRef.current = null;
      cv.style.cursor = 'grab';
      // Fire click only if mouse didn't travel more than threshold (real drag vs click)
      const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (moved < CLICK_THRESHOLD && theme === 'vital' && onPointClickRef.current) {
        const hit = findHitGroup(e.clientX, e.clientY);
        if (hit) onPointClickRef.current(hit);
      }
    };

    // ── Double-click: center globe on clicked geographic point ──
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      const proj = projRef.current;
      if (!proj || !proj.invert) return;
      const rect2 = cv.getBoundingClientRect();
      const coords = proj.invert([e.clientX - rect2.left, e.clientY - rect2.top]);
      if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return;
      targetLonRef.current  = -coords[0];
      targetLatRef.current  = Math.max(-85, Math.min(85, -coords[1]));
      isResettingRef.current = true;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(e.deltaY < 0 ? 1.1 : 0.9);
    };

    let prevTouchT = 0;
    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        draggingRef.current = true;
        dragLastRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragVelLonRef.current = 0;
        dragVelLatRef.current = 0;
        prevTouchT = performance.now();
        pinchRef.current = null;
        isResettingRef.current = false;
      } else if (e.touches.length === 2) {
        draggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = Math.hypot(dx, dy);
      }
    };
    const onTM = (e: TouchEvent) => {
      if (e.touches.length === 1 && draggingRef.current && dragLastRef.current) {
        const now = performance.now();
        const sens = ROTATE_SENSITIVITY / zoomRef.current;
        const dx = e.touches[0].clientX - dragLastRef.current.x;
        const dy = e.touches[0].clientY - dragLastRef.current.y;
        rotLonRef.current += dx * sens;
        rotLatRef.current -= dy * sens;
        rotLatRef.current  = Math.max(-85, Math.min(85, rotLatRef.current));
        const elapsed = Math.max(MIN_DRAG_SAMPLE_MS, now - prevTouchT);
        dragVelLonRef.current = Math.max(-MAX_DRAG_VEL, Math.min(MAX_DRAG_VEL, dx * sens * (TARGET_DT / elapsed)));
        dragVelLatRef.current = Math.max(-MAX_DRAG_VEL, Math.min(MAX_DRAG_VEL, -dy * sens * (TARGET_DT / elapsed)));
        prevTouchT = now;
        dragLastRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2 && pinchRef.current !== null) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        applyZoom(dist / pinchRef.current);
        pinchRef.current = dist;
      }
    };
    const onTE = () => { draggingRef.current = false; dragLastRef.current = null; pinchRef.current = null; };

    cv.addEventListener('mousedown', onMD);
    cv.addEventListener('dblclick', onDblClick);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('touchstart', onTS, { passive: true });
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);
    window.addEventListener('touchmove', onTM, { passive: true });
    window.addEventListener('touchend', onTE);

    return () => {
      cv.removeEventListener('mousedown', onMD);
      cv.removeEventListener('dblclick', onDblClick);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('touchstart', onTS);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onMU);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', onTE);
    };
  }, []);

  // Use 0 until client-side mount to avoid SSR hydration mismatch
  const displayPoints  = mounted ? points.length : 0;
  const connCount      = mounted && points.length > 1
    ? Math.round(points.length * (points.length - 1) / 2)
    : 0;

  const exportPNG = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `globo-acosvital-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, []);

  const handleZoom = (factor: number) => {
    zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor));
    setZoom(zoomRef.current);
  };

  const toggleAutoRotate = () => {
    autoRotateRef.current = !autoRotateRef.current;
    setAutoRotate(autoRotateRef.current);
  };

  const resetView = useCallback(() => {
    targetLonRef.current   = RESET_LON;
    targetLatRef.current   = RESET_LAT;
    isResettingRef.current = true;
  }, []);


  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        onContextMenu={(e) => e.preventDefault()}
        aria-label={
          theme === 'vital'
            ? `Globo interativo com ${displayPoints} clientes da Aços Vital distribuídos no mapa`
            : `Globo interativo com ${displayPoints} unidades da Aços Vital distribuídas no mapa`
        }
      />

      {/* Tooltip — vital theme dot hover */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.city && <div className={styles.tooltipCity}>{tooltip.city}</div>}
          <div>
            <span className={styles.tooltipCount}>{tooltip.count}</span>
            {' '}cliente{tooltip.count !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {mounted && (
        <>
          {/* Title overlay */}
          {!hideControls && (
            <div className={`${styles.titleOverlay} ${fsMode !== 'none' ? styles.titleOverlayShifted : ''}`}>
              <div className={styles.titleTag}>
                {theme === 'vital' ? 'Aços Vital · Clientes' : 'Aços Hub · Visualização'}
              </div>
              <div className={styles.titleMain}>
                {theme === 'vital' ? 'Mapa de\nClientes' : 'Globo\nInterativo'}
              </div>
              <div className={styles.titleHint}>Arraste · Scroll · Dia/noite em tempo real</div>
            </div>
          )}

          {/* ── Control panel — all actions in one organized strip ── */}
          {!hideControls && <div className={styles.controlPanel}>
            {/* Auto-rotate toggle */}
            <button
              className={`${styles.panelBtn} ${autoRotate ? styles.panelBtnActive : ''}`}
              onClick={toggleAutoRotate}
              title={autoRotate ? 'Pausar rotação automática' : 'Retomar rotação automática'}
            >
              {autoRotate ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1"/>
                  <rect x="9" y="2" width="4" height="12" rx="1"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2.5l10 5.5-10 5.5V2.5z"/>
                </svg>
              )}
            </button>

            {/* Reset view */}
            <button
              className={styles.panelBtn}
              onClick={resetView}
              title="Resetar para posição inicial"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
              </svg>
            </button>

            {/* Export PNG */}
            <button
              className={styles.panelBtn}
              onClick={exportPNG}
              title="Exportar como PNG"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11.5L4.5 8H7V3h2v5h2.5L8 11.5zM2 13.5h12V15H2v-1.5z"/>
              </svg>
            </button>

            <div className={styles.panelDivider} />

            {/* Zoom in */}
            <button
              className={styles.panelBtn}
              onClick={() => handleZoom(1.25)}
              disabled={zoom >= ZOOM_MAX}
              title="Zoom in"
            >+</button>

            {/* Zoom level */}
            <div className={styles.panelZoomPct}>{Math.round(zoom * 100)}%</div>

            {/* Zoom out */}
            <button
              className={styles.panelBtn}
              onClick={() => handleZoom(0.8)}
              disabled={zoom <= ZOOM_MIN}
              title="Zoom out"
            >−</button>
          </div>}

          {/* Side text — left center, hidden when zoomed in or not vital theme */}
          {theme === 'vital' && !hideInfoOverlays && <div className={`${styles.sideText} ${zoom > 1 ? styles.sideTextHidden : ''}`}>
            <div className={styles.sideTextTitle}>ONDE JÁ ESTAMOS</div>
            <div className={styles.sideTextBody}>
              Nosso futuro é crescer com propósito, inovação
              e excelência, construindo caminhos cada vez
              maiores e levando nossa visão mais longe
              a cada conquista.
            </div>
          </div>}

          {/* Stats bar — only on vital/clientes page */}
          {theme === 'vital' && !hideInfoOverlays && (
            <div className={styles.statsBar}>
              <div className={styles.statItem}>
                <div className={`${styles.statValue} ${styles.statValuePoints}`}>{displayPoints}</div>
                <div className={styles.statLabel}>Clientes</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
