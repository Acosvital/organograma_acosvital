"use client";

import Link from "next/link";
import CenterCard from "@/components/CenterCard/CenterCard";
import NodeCard from "@/components/NodeCard/NodeCard";
import SectorCard from "@/components/SectorCard/SectorCard";
import { useFsMode } from "@/lib/fsContext";
import { Connection, OrgNode, PositionedNode } from "@/types/orgChart";
import {
  OVERVIEW_NODE_RADIUS,
  SECTOR_NODE_RADIUS,
  SECTOR_RING_RADII,
  calculateConnections,
  calculateEvenSectorLayout,
  getSubtree,
} from "@/utils/radialLayout";
import { colorGradientId, radiusClipId } from "@/utils/svgDefs";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./OrgChart.module.css";
import OrgTreeView from "./OrgTreeView";
import SpaceBackground from "@/components/Globe/SpaceBackground";

// Raios possíveis de node/sector cards (conjunto pequeno e fixo, por nível/BFS-depth)
// — usado para gerar os <clipPath> compartilhados das fotos (ver <defs> do SVG).
const ALL_NODE_RADII = [
  ...Object.values(OVERVIEW_NODE_RADIUS),
  ...Object.values(SECTOR_NODE_RADIUS),
];

interface Props {
  // Pre-computed overview (levels 0-2 only)
  positions: PositionedNode[];
  connections: Connection[];
  // Full raw data for sector drill-down
  allNodes: OrgNode[];
  levelNames: Record<number, string>;
  levelColors: Record<number, string>;
  /** Unidade sendo exibida — usada para filtrar pessoas de outras unidades. */
  unidadeId?: string;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const OVERVIEW_VB: ViewBox = { x: -540, y: -540, w: 1080, h: 1080 };
const SECTOR_VB: ViewBox = { x: -1100, y: -1100, w: 2200, h: 2200 };
const MIN_W_OV = 300;
const MAX_W_OV = 1500;
const MIN_W_SC = 400;
const MAX_W_SC = 6000; // ring 8 radius=1590 → full diameter ~3400; allow zooming out further
const CULL_MARGIN = 120;
const SPINE_R = 430; // Management ring sits on the sector ring (r=430)

// ── Orbital intro animation ──────────────────────────────────────────────────
const ORB_DIR_R = 92; // orbit clearance around director card (card r=78)
const GM_ORB_R = 38; // orbit radius around each GM node
const SEC_ORB_R = 50; // orbit radius around each sector node
const ORB_BLUE = "#5B9DD4"; // medium blue — line color
const ORB_TIP = "#A8D4F0"; // light sky blue — alive flowing tip
const ORB_NAVY = "#081336"; // deep navy — depth layer

export default function OrgChart({
  positions,
  connections,
  allNodes,
  levelNames,
  levelColors,
  unidadeId,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Cache do getBoundingClientRect() do SVG — invalidado só em resize/gesto novo,
  // evita forçar layout do navegador a cada pointermove durante pan/pinch/wheel
  // (crítico em toque contínuo, onde isso disparava a cada frame).
  const svgRectRef = useRef<DOMRect | null>(null);
  const getSvgRect = useCallback(() => {
    if (!svgRectRef.current && svgRef.current) {
      svgRectRef.current = svgRef.current.getBoundingClientRect();
    }
    return svgRectRef.current;
  }, []);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasTiltRef = useRef<HTMLDivElement>(null);
  const lastCullSyncRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [sectorStack, setSectorStack] = useState<string[]>([]);
  const activeSectorId =
    sectorStack.length > 0 ? sectorStack[sectorStack.length - 1] : null;
  const [vb, setVbState] = useState<ViewBox>(OVERVIEW_VB);
  const vbRef = useRef<ViewBox>(OVERVIEW_VB);
  const isPanning = useRef(false);
  const panOrigin = useRef({
    mouseX: 0,
    mouseY: 0,
    vbX: 0,
    vbY: 0,
    vbW: 0,
    vbH: 0,
  });
  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const lastPinchDist = useRef<number | null>(null);
  // cursor managed via DOM ref (no React state to avoid re-renders on every drag)
  // Touch extras
  const didDrag = useRef(false);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const inertiaFrame = useRef<number | null>(null);
  const panVelocity = useRef({ vx: 0, vy: 0 }); // vb units / ms
  const lastPanEvent = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastInteraction = useRef<number>(Date.now());
  const animFrameRef = useRef<number | null>(null);
  const pressedSectorIdRef = useRef<string | null>(null);
  const pendingPointerMoveRef = useRef<number | null>(null);
  const pendingPointerEventRef = useRef<React.PointerEvent<SVGSVGElement> | null>(null);

  // ── Busca, fly-to, highlight e modo de visualização ──────────────────────
  const [viewMode, setViewMode] = useState<"radial" | "tree">("radial");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<string | null>(null);
  const [showOrbitalAnimation, setShowOrbitalAnimation] = useState(true);

  const minW = activeSectorId ? MIN_W_SC : MIN_W_OV;
  const maxW = activeSectorId ? MAX_W_SC : MAX_W_OV;

  // setVb: atualiza a DOM diretamente (sem re-render React) durante pan/zoom.
  // Estado React é sincronizado de forma throttled apenas para recálculo do culling.
  const setVb = useCallback((next: ViewBox) => {
    vbRef.current = next;
    // Atualização direta da DOM — zero reconciliação React
    if (svgRef.current) {
      svgRef.current.setAttribute('viewBox', `${next.x} ${next.y} ${next.w} ${next.h}`);
    }
    // Sincroniza estado a ~7fps (apenas para recalcular visibleDetailOthers)
    const now = performance.now();
    if (now - lastCullSyncRef.current > 140) {
      lastCullSyncRef.current = now;
      setVbState(next);
    }
  }, []);

  const animateTo = useCallback(
    (target: ViewBox, duration = 650) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const from = { ...vbRef.current };
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const e = 1 - Math.pow(1 - t, 3); // cubic ease-out
        setVb({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          w: from.w + (target.w - from.w) * e,
          h: from.h + (target.h - from.h) * e,
        });
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animFrameRef.current = null;
          setVbState(target); // sincronização final para culling correto
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [setVb],
  );

  useEffect(
    () => () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (inertiaFrame.current) cancelAnimationFrame(inertiaFrame.current);
      if (pendingPointerMoveRef.current) cancelAnimationFrame(pendingPointerMoveRef.current);
    },
    [],
  );

  // Pausar animação orbital após 20s para economizar CPU/bateria
  useEffect(() => {
    const timer = setTimeout(() => setShowOrbitalAnimation(false), 20000);
    return () => clearTimeout(timer);
  }, []);

  // Nós completos = allNodes (já vem com a árvore inteira desde o fetch inicial,
  // via SSR ou pelo /api/org?unidade_id=). Filtra pessoas de outra unidade aqui.
  // Só a Diretoria (nível 0) é papel global e sempre aparece — Gerência Geral
  // (nível 1) e demais pessoas são filtradas pela unidade de cada uma.
  const mergedNodes = useMemo(() => {
    if (!unidadeId) return allNodes;
    return allNodes.filter((n) => n.isSector || n.level === 0 || n.unidadeId === unidadeId);
  }, [allNodes, unidadeId]);

  // Cores distintas em uso (níveis fixos + cor custom de cada setor) — usadas para
  // gerar os <radialGradient> compartilhados no <defs> do SVG (ver renderização
  // abaixo). Evita recriar um gradiente por nó (250+ pessoas → só ~1 por cor).
  const usedColors = useMemo(() => {
    const set = new Set<string>(Object.values(levelColors));
    for (const n of allNodes) if (n.isSector && n.sectorColor) set.add(n.sectorColor);
    return [...set];
  }, [allNodes, levelColors]);

  const openSector = useCallback((id: string) => {
    // Supabase importa setores com prefixo 'sec-'; a API externa usa o UUID puro.
    // Normaliza para o UUID canônico para que getSubtree encontre os filhos certos.
    const canonId = id.startsWith("sec-") ? id.slice(4) : id;
    setSectorStack((prev) => [...prev, canonId]);
  }, []);

  const goBack = useCallback(() => {
    setSectorStack((prev) => prev.slice(0, -1));
  }, []);

  // ── Sector detail layout (computed client-side) ────────────────────────
  const sectorDetail = useMemo(() => {
    if (!activeSectorId) return null;
    let subtree = getSubtree(activeSectorId, mergedNodes);

    // Hub-and-spoke: if sector has a manager (lowest-level non-sector direct child)
    // AND direct sub-sectors, place manager at ring 1 and sub-sectors at ring 2.
    // Lines from manager to each sub-sector are replaced in the SVG by a ring circle
    // + a single spoke, matching the GM→sectors overview design.
    const directNonSectors = subtree.filter((n) => n.parentId === activeSectorId && !n.isSector);
    const directSubSectors = subtree.filter((n) => n.parentId === activeSectorId && n.isSector);
    const topManager = directNonSectors.reduce<typeof directNonSectors[0] | null>(
      (best, n) => (!best || n.level < best.level ? n : best),
      null,
    );

    let hubManagerId: string | undefined;
    let subSectorRing: number | undefined;

    const activeSectorNome = mergedNodes.find((n) => n.id === activeSectorId)?.name ?? '';
    const isFabricas = activeSectorNome.toLowerCase().includes('fábrica');

    if (isFabricas && topManager && directSubSectors.length > 0) {
      hubManagerId = topManager.id;
      subSectorRing = 2;
      // Re-parent sub-sectors to the manager so calculateConnections draws
      // manager→sub-sector edges (which we later replace with the ring visual).
      subtree = subtree.map((n) =>
        n.parentId === activeSectorId && n.isSector ? { ...n, parentId: topManager.id } : n,
      );
    }

    const pos = calculateEvenSectorLayout(
      subtree, activeSectorId, SECTOR_RING_RADII, SECTOR_NODE_RADIUS, subSectorRing,
    );
    const conn = calculateConnections(pos);
    return { pos, conn, hubManagerId };
  }, [activeSectorId, mergedNodes]);

  // Animate viewBox when switching views — fit to content for sector detail
  useEffect(() => {
    if (!activeSectorId) {
      animateTo(OVERVIEW_VB, 700);
      return;
    }
    if (!sectorDetail) return;
    // Fit initial view to the outermost ring actually populated
    const maxR = sectorDetail.pos.reduce(
      (m, p) => Math.max(m, Math.sqrt(p.x * p.x + p.y * p.y) + p.radius + 80),
      200,
    );
    // Ajusta ao conteúdo real (+margem). Piso baixo p/ setores compactos não
    // ficarem perdidos numa viewbox grande; teto preserva o caso de setores enormes.
    const size = Math.min(Math.max(maxR * 2 + 200, 1200), 4000);
    animateTo({ x: -size / 2, y: -size / 2, w: size, h: size }, 700);
  }, [activeSectorId, sectorDetail, animateTo]);

  // ── Overview derived data ─────────────────────────────────────────────
  const overviewDirectors = useMemo(
    () => positions.filter((p) => p.level === 0),
    [positions],
  );
  const overviewGMs = useMemo(
    () => positions.filter((p) => p.level === 1),
    [positions],
  );
  const overviewSectors = useMemo(
    () => positions.filter((p) => p.isSector),
    [positions],
  );
  const maxLevel = useMemo(
    () => positions.reduce((m, p) => Math.max(m, p.level), 0),
    [positions],
  );
  const overviewPosMap = useMemo(
    () => new Map(positions.map((p) => [p.id, p])),
    [positions],
  );

  const sectorsByGG = useMemo(() => {
    const map = new Map<string, PositionedNode[]>();
    overviewSectors.forEach((s) => {
      const pid = s.parentId ?? "";
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(s);
    });
    return map;
  }, [overviewSectors]);

  // ── Sector detail derived data ────────────────────────────────────────
  const detailCenter = useMemo(
    () => sectorDetail?.pos.find((p) => p.id === activeSectorId) ?? null,
    [sectorDetail, activeSectorId],
  );
  const detailOthers = useMemo(
    () => sectorDetail?.pos.filter((p) => p.id !== activeSectorId) ?? [],
    [sectorDetail, activeSectorId],
  );

  // Ring guide circles — uma circunferência por NÍVEL hierárquico (supervisor,
  // analista, aprendiz…), no raio interno de cada nível. Antes deduplicávamos por
  // faixa de 120px; com os anéis agora compactos isso fundia níveis vizinhos e
  // apagava círculos. Agrupar por nível garante um guia para cada nível presente.
  const sectorRingGuides = useMemo(() => {
    if (!sectorDetail || !activeSectorId) return [];
    const byLevel = new Map<number, number>(); // nível → menor raio
    sectorDetail.pos.forEach((p) => {
      if (p.id === activeSectorId || p.isSector) return;
      const r = Math.sqrt(p.x * p.x + p.y * p.y);
      if (r < 10) return;
      const cur = byLevel.get(p.level);
      if (cur === undefined || r < cur) byLevel.set(p.level, r);
    });
    return [...byLevel.entries()]
      .map(([level, r]) => ({ r: Math.round(r), level }))
      .sort((a, b) => a.r - b.r);
  }, [activeSectorId, sectorDetail]);

  const visibleDetailOthers = useMemo(() => {
    const { x, y, w, h } = vb;
    return detailOthers.filter((n) => {
      const r = n.radius;
      return (
        n.x + r + CULL_MARGIN > x &&
        n.x - r - CULL_MARGIN < x + w &&
        n.y + r + CULL_MARGIN > y &&
        n.y - r - CULL_MARGIN < y + h
      );
    });
  }, [detailOthers, vb]);

  const visibleDetailIds = useMemo(
    () => new Set(visibleDetailOthers.map((n) => n.id)),
    [visibleDetailOthers],
  );
  const visibleDetailConn = useMemo(
    () => sectorDetail?.conn.filter((c) => visibleDetailIds.has(c.toId)) ?? [],
    [sectorDetail, visibleDetailIds],
  );

  // Hub-and-spoke ring info — derived from positioned nodes when a manager+sub-sectors
  // layout is active. Used to draw the ring circle and single spoke in the SVG.
  const hubInfo = useMemo(() => {
    if (!sectorDetail?.hubManagerId) return null;
    const managerPos = sectorDetail.pos.find((p) => p.id === sectorDetail.hubManagerId);
    const subSectorPos = sectorDetail.pos.find((p) => p.isSector && p.id !== activeSectorId);
    if (!managerPos || !subSectorPos) return null;
    const ringR = Math.sqrt(subSectorPos.x ** 2 + subSectorPos.y ** 2);
    return { managerId: sectorDetail.hubManagerId, managerPos, ringR };
  }, [sectorDetail, activeSectorId]);

  const detailSubSectors = useMemo(
    () => visibleDetailOthers.filter((n) => n.isSector),
    [visibleDetailOthers],
  );
  const detailPeopleNodes = useMemo(
    () => visibleDetailOthers.filter((n) => !n.isSector),
    [visibleDetailOthers],
  );

  // ── Level counts (legend) ─────────────────────────────────────────────
  const levelCounts = useMemo(() => {
    const source = activeSectorId ? (sectorDetail?.pos ?? []) : positions;
    const counts: Record<number, number> = {};
    source.forEach((p) => {
      if (p.isSector) return; // setores e sub-setores nunca são contados como pessoas
      counts[p.level] = (counts[p.level] ?? 0) + 1;
    });
    return counts;
  }, [activeSectorId, positions, sectorDetail]);

  const activeSectorNode = useMemo(
    () => mergedNodes.find((n) => n.id === activeSectorId) ?? null,
    [activeSectorId, mergedNodes],
  );
  const activeSectorName = activeSectorNode?.name ?? "";

  const backLabel = useMemo(() => {
    if (sectorStack.length <= 1) return "← Voltar à visão geral";
    const parentId = sectorStack[sectorStack.length - 2];
    const parentName = mergedNodes.find((n) => n.id === parentId)?.name ?? "";
    return `← Voltar${parentName ? ` a ${parentName}` : ""}`;
  }, [sectorStack, mergedNodes]);

  // ── Busca + navegação "voar até" ────────────────────────────────────────
  const nodeById = useMemo(
    () => new Map(mergedNodes.map((n) => [n.id, n])),
    [mergedNodes],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return mergedNodes
      .filter((n) => `${n.name} ${n.role}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, mergedNodes]);

  /** Sobe pela árvore até o setor que contém o nó (ou null se estiver no panorama). */
  const nearestSectorId = useCallback(
    (node: OrgNode): string | null => {
      let cur: OrgNode | undefined = node;
      while (cur) {
        if (cur.isSector) return cur.id;
        cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
      }
      return null;
    },
    [nodeById],
  );

  const flyTo = useCallback(
    (node: OrgNode) => {
      setViewMode("radial");
      setSearchOpen(false);
      setQuery("");
      if (node.isSector) {
        setSectorStack([node.id]); // setor: abre a equipe
      } else if (node.level <= 2) {
        setSectorStack([]); // diretoria / gerência: panorama
      } else {
        const sid = nearestSectorId(node); // pessoa: abre o setor dela
        setSectorStack(sid ? [sid] : []);
      }
      setFlyTarget(node.id);
    },
    [nearestSectorId],
  );

  // Centraliza e destaca o alvo assim que o layout dele estiver disponível.
  useEffect(() => {
    if (!flyTarget) return;
    const list = activeSectorId ? (sectorDetail?.pos ?? []) : positions;
    const target = list.find((p) => p.id === flyTarget);
    if (!target) return; // setor ainda montando — reavalia no próximo render
    const W = activeSectorId ? 720 : 460;
    animateTo({ x: target.x - W / 2, y: target.y - W / 2, w: W, h: W }, 720);
    setHighlightId(flyTarget);
    setFlyTarget(null);
    const t = setTimeout(() => setHighlightId(null), 2800);
    return () => clearTimeout(t);
  }, [flyTarget, activeSectorId, sectorDetail, positions, animateTo]);

  // Posição do nó destacado no modo atual (panorama ou detalhe de setor).
  const highlightPos = useMemo(() => {
    if (!highlightId) return null;
    if (activeSectorId)
      return sectorDetail?.pos.find((p) => p.id === highlightId) ?? null;
    return overviewPosMap.get(highlightId) ?? null;
  }, [highlightId, activeSectorId, sectorDetail, overviewPosMap]);

  // ── Inércia de pan ────────────────────────────────────────────────────
  const startInertia = useCallback(
    (vx: number, vy: number) => {
      if (inertiaFrame.current) cancelAnimationFrame(inertiaFrame.current);
      const DECAY = 0.88;
      const FRAME_MS = 1000 / 60;
      let cvx = vx * FRAME_MS;
      let cvy = vy * FRAME_MS;
      const tick = () => {
        cvx *= DECAY;
        cvy *= DECAY;
        if (Math.abs(cvx) + Math.abs(cvy) < 0.5) {
          inertiaFrame.current = null;
          return;
        }
        const cur = vbRef.current;
        setVb({ ...cur, x: cur.x + cvx, y: cur.y + cvy });
        inertiaFrame.current = requestAnimationFrame(tick);
      };
      inertiaFrame.current = requestAnimationFrame(tick);
    },
    [setVb],
  );

  // ── Duplo toque → zoom in ─────────────────────────────────────────────
  const handleDoubleTap = useCallback(
    (clientX: number, clientY: number) => {
      const rect = getSvgRect();
      if (!rect) return;
      const cur = vbRef.current;
      const wx = cur.x + ((clientX - rect.left) / rect.width) * cur.w;
      const wy = cur.y + ((clientY - rect.top) / rect.height) * cur.h;
      const newW = Math.max(minW, cur.w * 0.5);
      const newH = (newW / cur.w) * cur.h;
      animateTo(
        {
          x: wx - (wx - cur.x) * (newW / cur.w),
          y: wy - (wy - cur.y) * (newH / cur.h),
          w: newW,
          h: newH,
        },
        350,
      );
    },
    [animateTo, minW, getSvgRect],
  );

  // Invalida o rect cacheado quando o SVG muda de tamanho (resize, rotação,
  // sidebar recolhendo/expandindo) — recomputa na próxima leitura, não aqui.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { svgRectRef.current = null; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-reset: volta ao panorama após 3 min sem interação ────────────
  useEffect(() => {
    const INACTIVITY_MS = 3 * 60 * 1_000;
    const id = setInterval(() => {
      if (Date.now() - lastInteraction.current > INACTIVITY_MS) {
        setSectorStack([]);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Qualquer toque/clique na página renova o timer de inatividade
  useEffect(() => {
    const refresh = () => {
      lastInteraction.current = Date.now();
    };
    window.addEventListener("pointerdown", refresh);
    return () => window.removeEventListener("pointerdown", refresh);
  }, []);

  // ── Wheel zoom ────────────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const rect = getSvgRect();
      if (!rect) return;
      const cur = vbRef.current;
      const mx = cur.x + ((e.clientX - rect.left) / rect.width) * cur.w;
      const my = cur.y + ((e.clientY - rect.top) / rect.height) * cur.h;
      const factor = e.deltaY > 0 ? 1.14 : 0.88;
      const newW = Math.min(maxW, Math.max(minW, cur.w * factor));
      const newH = (newW / cur.w) * cur.h;
      setVb({
        x: mx - (mx - cur.x) * (newW / cur.w),
        y: my - (my - cur.y) * (newH / cur.h),
        w: newW,
        h: newH,
      });
    },
    [setVb, minW, maxW, getSvgRect],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pointer pan & pinch zoom (mouse + touch + pen) ────────────────────
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Início de gesto — garante que o rect cacheado reflita a posição atual
    // (ex.: sidebar recolhida entre um gesto e outro sem disparar resize do SVG).
    svgRectRef.current = null;

    // Cancela inércia ao iniciar novo toque
    if (inertiaFrame.current) {
      cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
    }

    // Captura o pointer para manter eventos mesmo que o dedo saia do SVG
    e.currentTarget.setPointerCapture(e.pointerId);

    didDrag.current = false;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    lastPanEvent.current = null;
    panVelocity.current = { vx: 0, vy: 0 };

    // Registra qual setor (se algum) foi pressionado para abrir no pointerup
    pressedSectorIdRef.current = null;
    {
      let el = e.target as Element | null;
      while (el && el !== e.currentTarget) {
        const sid = el.getAttribute("data-sector-id");
        if (sid) { pressedSectorIdRef.current = sid; break; }
        el = el.parentElement;
      }
    }

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      isPanning.current = true;
      if (svgRef.current) {
        svgRef.current.style.cursor = 'grabbing';
        svgRef.current.classList.add(styles.panning);
      }
      const cur = vbRef.current;
      panOrigin.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        vbX: cur.x,
        vbY: cur.y,
        vbW: cur.w,
        vbH: cur.h,
      };
    } else if (activePointers.current.size >= 2) {
      // Segundo dedo → inicia pinch, cancela pan e qualquer setor pressionado
      isPanning.current = false;
      pressedSectorIdRef.current = null;
      const ptrs = [...activePointers.current.values()];
      lastPinchDist.current = Math.hypot(
        ptrs[1].x - ptrs[0].x,
        ptrs[1].y - ptrs[0].y,
      );
    }
  };

  const processPointerMove = useCallback(() => {
    const e = pendingPointerEventRef.current;
    if (!e || !activePointers.current.has(e.pointerId)) {
      pendingPointerMoveRef.current = null;
      return;
    }

    // Detecta se é arraste (> 8 px de movimento)
    if (!didDrag.current) {
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > 8) {
        didDrag.current = true;
        pressedSectorIdRef.current = null; // arraste cancela abertura de setor
      }
    }

    const ptrs = [...activePointers.current.values()];

    if (ptrs.length >= 2) {
      // Pinch zoom — zoom em direção ao ponto médio dos dois dedos
      const [p1, p2] = ptrs;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const rect = lastPinchDist.current !== null ? getSvgRect() : null;
      if (lastPinchDist.current !== null && rect) {
        const ratio = lastPinchDist.current / dist;
        const cur = vbRef.current;
        const cx =
          cur.x + (((p1.x + p2.x) / 2 - rect.left) / rect.width) * cur.w;
        const cy =
          cur.y + (((p1.y + p2.y) / 2 - rect.top) / rect.height) * cur.h;
        const newW = Math.min(maxW, Math.max(minW, cur.w * ratio));
        const newH = (newW / cur.w) * cur.h;
        setVb({
          x: cx - (cx - cur.x) * (newW / cur.w),
          y: cy - (cy - cur.y) * (newH / cur.h),
          w: newW,
          h: newH,
        });
      }
      lastPinchDist.current = dist;
    } else if (ptrs.length === 1 && isPanning.current) {
      // Pan com um dedo
      const rect = getSvgRect();
      if (!rect) return;
      const po = panOrigin.current;
      const dx = ((e.clientX - po.mouseX) / rect.width) * po.vbW;
      const dy = ((e.clientY - po.mouseY) / rect.height) * po.vbH;

      // Rastreia velocidade para inércia
      const now = performance.now();
      const prev = lastPanEvent.current;
      if (prev) {
        const dt = now - prev.t;
        if (dt > 0 && dt < 80) {
          const sdx = e.clientX - prev.x;
          const sdy = e.clientY - prev.y;
          panVelocity.current = {
            vx: (-(sdx / rect.width) * po.vbW) / dt,
            vy: (-(sdy / rect.height) * po.vbH) / dt,
          };
        }
      }
      lastPanEvent.current = { x: e.clientX, y: e.clientY, t: now };

      setVb({ ...vbRef.current, x: po.vbX - dx, y: po.vbY - dy });
    }

    pendingPointerMoveRef.current = null;
  }, [minW, maxW, setVb, getSvgRect]);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pendingPointerEventRef.current = e;

    if (!pendingPointerMoveRef.current) {
      pendingPointerMoveRef.current = requestAnimationFrame(processPointerMove);
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(e.pointerId);
    const remaining = activePointers.current.size;

    if (remaining < 2) lastPinchDist.current = null;

    // Tap único / duplo toque
    if (remaining === 0 && !didDrag.current) {
      const now = performance.now();
      const last = lastTap.current;
      if (
        last &&
        now - last.t < 320 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 70
      ) {
        // Duplo toque → zoom in (cancela abertura de setor)
        handleDoubleTap(e.clientX, e.clientY);
        lastTap.current = null;
        pressedSectorIdRef.current = null;
      } else {
        lastTap.current = { x: e.clientX, y: e.clientY, t: now };
        // Tap único → abre setor se foi pressionado em um
        if (pressedSectorIdRef.current) {
          openSector(pressedSectorIdRef.current);
        }
      }
    }
    pressedSectorIdRef.current = null;

    // Inércia ao levantar o dedo com velocidade
    if (remaining === 0 && isPanning.current && didDrag.current) {
      const age = performance.now() - (lastPanEvent.current?.t ?? 0);
      if (age < 80) {
        const { vx, vy } = panVelocity.current;
        if (Math.hypot(vx, vy) * (1000 / 60) > 0.5) startInertia(vx, vy);
      }
    }

    if (remaining === 1) {
      // Um dedo ainda pressionado — reinicia pan a partir da posição atual
      const [ptr] = activePointers.current.values();
      isPanning.current = true;
      const cur = vbRef.current;
      panOrigin.current = {
        mouseX: ptr.x,
        mouseY: ptr.y,
        vbX: cur.x,
        vbY: cur.y,
        vbW: cur.w,
        vbH: cur.h,
      };
      lastPanEvent.current = null;
    } else if (remaining === 0) {
      isPanning.current = false;
      if (svgRef.current) {
        svgRef.current.style.cursor = 'grab';
        svgRef.current.classList.remove(styles.panning);
      }
      lastPanEvent.current = null;
    }
  };

  // ── Zoom buttons ──────────────────────────────────────────────────────
  const zoomIn = () => {
    const c = vbRef.current;
    const nW = Math.max(minW, c.w * 0.78);
    const nH = (nW / c.w) * c.h;
    animateTo(
      { x: c.x + (c.w - nW) / 2, y: c.y + (c.h - nH) / 2, w: nW, h: nH },
      300,
    );
  };
  const zoomOut = () => {
    const c = vbRef.current;
    const nW = Math.min(maxW, c.w * 1.28);
    const nH = (nW / c.w) * c.h;
    animateTo(
      { x: c.x - (nW - c.w) / 2, y: c.y - (nH - c.h) / 2, w: nW, h: nH },
      300,
    );
  };
  const resetView = () => {
    if (activeSectorId && sectorDetail) {
      const maxR = sectorDetail.pos.reduce(
        (m, p) => Math.max(m, Math.sqrt(p.x * p.x + p.y * p.y) + p.radius + 80),
        200,
      );
      const size = Math.min(Math.max(maxR * 2 + 200, 1200), 4000);
      animateTo({ x: -size / 2, y: -size / 2, w: size, h: size }, 500);
    } else {
      animateTo(OVERVIEW_VB, 500);
    }
  };

  // viewBox gerenciado diretamente via DOM (não via React state) para máxima fluidez

  // ── Connection renderer ───────────────────────────────────────────────
  const renderConnections = useCallback(
    (conns: Connection[], posMap?: Map<string, PositionedNode>) => {
      return conns.map((c) => {
      const target = posMap?.get(c.toId);
      const color =
        target?.isSector && target.sectorColor
          ? target.sectorColor
          : (levelColors[c.level] ?? "#fff");
      const mx = (c.fromX + c.toX) / 2;
      const my = (c.fromY + c.toY) / 2;
      const dist = Math.sqrt(mx * mx + my * my);
      const nx = dist > 0 ? mx / dist : 0;
      const ny = dist > 0 ? my / dist : 0;
      // Limita o pull ao comprimento real da conexão para evitar curvas que
      // "voltam" quando os nós estão muito distantes da origem (setores grandes).
      const connLen = Math.sqrt(
        (c.toX - c.fromX) ** 2 + (c.toY - c.fromY) ** 2,
      );
      const pull = Math.min(dist * 0.15, connLen * 0.35);
      const d = `M ${c.fromX} ${c.fromY} Q ${nx * (dist - pull)} ${ny * (dist - pull)} ${c.toX} ${c.toY}`;
      return (
        <g key={`${c.fromId}-${c.toId}`}>
          {/* Traço-base estático */}
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeOpacity={0.28}
            strokeWidth={1.3}
          />
          {/* Fluxo animado de partículas (desabilitado em prefers-reduced-motion) */}
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeOpacity={0.85}
            strokeWidth={1.7}
            strokeLinecap="round"
            className={styles.flowLine}
          />
        </g>
      );
    });
    },
    [levelColors],
  );

  // ── Orbital intro + permanent alive animation ─────────────────────────────
  // Path: 360° director → radial to GM ring → 360° GM ring (all GMs) → stem → 360° sector ring
  function renderOrbitalAnimation() {
    if (!overviewGMs.length) return null;

    const f = (n: number) => n.toFixed(2);
    const PI2 = 2 * Math.PI;

    // CW arc on circle radius r (centred at origin), from angle a1 to a2
    function cwArc(r: number, a1: number, a2: number): string {
      const dA = (((a2 - a1) % PI2) + PI2) % PI2;
      const large = dA > Math.PI ? 1 : 0;
      return `A ${r},${r} 0 ${large},1 ${f(r * Math.cos(a2))},${f(r * Math.sin(a2))}`;
    }

    // Full CW 360° on circle of radius r, starting at angle startA (4 quarter-arcs)
    function ring360(r: number, startA: number): string[] {
      const a = startA;
      return [
        cwArc(r, a, a + Math.PI / 2),
        cwArc(r, a + Math.PI / 2, a + Math.PI),
        cwArc(r, a + Math.PI, a + Math.PI * 1.5),
        cwArc(r, a + Math.PI * 1.5, a + Math.PI * 2),
      ];
    }

    // Pick the first GM sorted CW from top (−π/2)
    const topAngle = -Math.PI / 2;
    const normAngle = (n: { x: number; y: number }) =>
      (Math.atan2(n.y, n.x) - topAngle + PI2 * 2) % PI2;
    const firstGM = [...overviewGMs].sort(
      (a, b) => normAngle(a) - normAngle(b),
    )[0];
    const gmAngle = Math.atan2(firstGM.y, firstGM.x);

    const DR = ORB_DIR_R; // orbit radius around director card
    const GM_R = 190; // GM ring radius
    const SEC_R = 430; // sector ring radius

    const parts: string[] = [];

    // ── 1. Full 360° orbit of director card ──
    parts.push(`M 0,${-DR}`);
    parts.push(...ring360(DR, topAngle));

    // ── 2. Arc along director orbit from top to first GM's radial direction ──
    const dToGM = (((gmAngle - topAngle) % PI2) + PI2) % PI2;
    if (dToGM > 0.05) parts.push(cwArc(DR, topAngle, gmAngle));

    // ── 3. Radial line: director orbit → first GM position (connection line) ──
    parts.push(`L ${f(firstGM.x)},${f(firstGM.y)}`);

    // ── 4. Full 360° around GM ring — sweeps through ALL GM nodes ──
    parts.push(...ring360(GM_R, gmAngle));

    // ── 5 & 6. Sector ring — only if there are sectors ──
    const hasSectors = overviewSectors.length > 0;
    if (hasSectors) {
      parts.push(
        `L ${f(SEC_R * Math.cos(gmAngle))},${f(SEC_R * Math.sin(gmAngle))}`,
      );
      parts.push(...ring360(SEC_R, gmAngle));
    }

    const dynPath = parts.join(" ");

    // Path length: dir + arc + connector + GM ring + (stem + sec ring if sectors exist)
    const dirLen = PI2 * DR;
    const arcLen = dToGM * DR;
    const connLen = GM_R - DR;
    const gmLen = PI2 * GM_R;
    const stemLen = hasSectors ? SEC_R - GM_R : 0;
    const secLen = hasSectors ? PI2 * SEC_R : 0;
    const TOTAL = Math.round(
      dirLen + arcLen + connLen + gmLen + stemLen + secLen,
    );

    const DRAW = "15s";

    return (
      <g pointerEvents="none">
        {/* ── DRAW: navy depth layer ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_NAVY}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`0 ${TOTAL}`}
          opacity={0.9}
        >
          {/* @ts-ignore — SMIL */}
          <animate
            attributeName="stroke-dasharray"
            values={`0 ${TOTAL};${TOTAL} 0`}
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </path>

        {/* ── DRAW: outer blue glow ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_BLUE}
          strokeWidth={6}
          filter="url(#orb-glow)"
          strokeLinecap="round"
          strokeDasharray={`0 ${TOTAL}`}
          opacity={0.18}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dasharray"
            values={`0 ${TOTAL};${TOTAL} 0`}
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </path>

        {/* ── DRAW: sharp blue core line ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_BLUE}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`0 ${TOTAL}`}
          opacity={0.92}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dasharray"
            values={`0 ${TOTAL};${TOTAL} 0`}
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </path>

        {/* ── DRAW: leading orange tip ── */}
        <circle r={5} fill={ORB_TIP} filter="url(#orb-tip-glow)">
          {/* @ts-ignore */}
          <animateMotion
            path={dynPath}
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
            calcMode="linear"
          />
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.96;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </circle>

        {/* ── ALIVE: pulsing blue glow (begins after draw) ── */}
        <g opacity={0}>
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0.14;0.32;0.14"
            dur="2.8s"
            repeatCount="indefinite"
            begin={DRAW}
          />
          <path
            d={dynPath}
            fill="none"
            stroke={ORB_BLUE}
            strokeWidth={6}
            filter="url(#orb-glow)"
            strokeLinecap="round"
            strokeDasharray={`${TOTAL} 0`}
          />
        </g>

        {/* ── ALIVE: static navy base ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_NAVY}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${TOTAL} 0`}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.85"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </path>

        {/* ── ALIVE: static blue line ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_BLUE}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeDasharray={`${TOTAL} 0`}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.5"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
        </path>

        {/* ── ALIVE: flowing orange tip segment ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_TIP}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#orb-tip-glow)"
          strokeDasharray={`70 ${TOTAL - 70}`}
          strokeDashoffset={0}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.75"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={`${-TOTAL}`}
            dur="10s"
            repeatCount="indefinite"
          />
        </path>

        {/* ── ALIVE: blue trailing segment (forward) ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_BLUE}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={`35 ${TOTAL - 35}`}
          strokeDashoffset={-50}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.45"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dashoffset"
            from="-50"
            to={`${-TOTAL - 50}`}
            dur="10s"
            repeatCount="indefinite"
          />
        </path>

        {/* ── ALIVE: reverse flowing tip (opposite direction) ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_TIP}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#orb-tip-glow)"
          strokeDasharray={`70 ${TOTAL - 70}`}
          strokeDashoffset={0}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.75"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={`${TOTAL}`}
            dur="10s"
            repeatCount="indefinite"
          />
        </path>

        {/* ── ALIVE: reverse blue trailing segment ── */}
        <path
          d={dynPath}
          fill="none"
          stroke={ORB_BLUE}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={`35 ${TOTAL - 35}`}
          strokeDashoffset={50}
          opacity={0}
        >
          {/* @ts-ignore */}
          <animate
            attributeName="opacity"
            values="0;0;0.45"
            keyTimes="0;0.999;1"
            dur={DRAW}
            fill="freeze"
            repeatCount="1"
          />
          {/* @ts-ignore */}
          <animate
            attributeName="stroke-dashoffset"
            from="50"
            to={`${TOTAL + 50}`}
            dur="10s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    );
  }

  // ── Arc-spine connections (all GGs → sector ring → all sectors) ─────────
  function renderArcSpines() {
    const gmColor = levelColors[1];

    // Stems: each GG → its touch point on the sector ring
    const stems = overviewGMs.map((gg) => {
      const ggAngle = Math.atan2(gg.y, gg.x);
      const sp = {
        x: SPINE_R * Math.cos(ggAngle),
        y: SPINE_R * Math.sin(ggAngle),
      };
      const dx = sp.x - gg.x;
      const dy = sp.y - gg.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ggEdge = {
        x: gg.x + (dx / dist) * gg.radius,
        y: gg.y + (dy / dist) * gg.radius,
      };
      return (
        <line
          key={`${gg.id}-stem`}
          x1={ggEdge.x}
          y1={ggEdge.y}
          x2={sp.x}
          y2={sp.y}
          stroke={gmColor}
          strokeWidth={1.5}
          strokeOpacity={0.55}
        />
      );
    });

    // Arcs along the sector ring: from each GG touch point → each sector node.
    // Each arc visually "traverses" the ring to reach the sector.
    const arcs: React.ReactNode[] = [];
    overviewGMs.forEach((gg) => {
      const ggAngle = Math.atan2(gg.y, gg.x);
      const spX = SPINE_R * Math.cos(ggAngle);
      const spY = SPINE_R * Math.sin(ggAngle);

      overviewSectors.forEach((sector) => {
        const sAngle = Math.atan2(sector.y, sector.x);
        let dA = sAngle - ggAngle;
        // Normalise to [-π, π] so we always take the shorter arc
        while (dA > Math.PI) dA -= 2 * Math.PI;
        while (dA < -Math.PI) dA += 2 * Math.PI;

        const largeArc = Math.abs(dA) > Math.PI ? 1 : 0;
        const sweep = dA > 0 ? 1 : 0;
        const arcD = `M ${spX} ${spY} A ${SPINE_R} ${SPINE_R} 0 ${largeArc} ${sweep} ${sector.x} ${sector.y}`;

        arcs.push(
          <path
            key={`${gg.id}-${sector.id}-arc`}
            d={arcD}
            fill="none"
            stroke={sector.sectorColor ?? gmColor}
            strokeWidth={1.4}
            strokeOpacity={0.3}
          />,
        );
      });
    });

    // Junction dots: where each GM stem meets the ring
    const gmDots = overviewGMs.map((gg) => {
      const ggAngle = Math.atan2(gg.y, gg.x);
      return (
        <circle
          key={`${gg.id}-junc`}
          cx={SPINE_R * Math.cos(ggAngle)}
          cy={SPINE_R * Math.sin(ggAngle)}
          r={3.5}
          fill={gmColor}
          fillOpacity={0.7}
        />
      );
    });

    // Junction dots: where each sector sits on the ring
    const sectorDots = overviewSectors.map((sector) => (
      <circle
        key={`${sector.id}-sdot`}
        cx={sector.x}
        cy={sector.y}
        r={4}
        fill={sector.sectorColor ?? gmColor}
        fillOpacity={0.65}
      />
    ));

    // Base ring at low opacity as a subtle guide
    const ring = (
      <circle
        key="mgmt-ring"
        cx={0}
        cy={0}
        r={SPINE_R}
        fill="none"
        stroke={gmColor}
        strokeWidth={1.2}
        strokeOpacity={0.15}
      />
    );

    return [ring, ...arcs, ...stems, ...gmDots, ...sectorDots];
  }

  // ── Legend entries ─────────────────────────────────────────────────────
  const legendEntries = useMemo(() => {
    if (activeSectorId) {
      return Object.entries(levelNames)
        .map(([lvl, name]) => [Number(lvl), name] as [number, string])
        .filter(
          ([lvl]) => (lvl === 0 || lvl >= 3) && (levelCounts[lvl] ?? 0) > 0,
        );
    }
    // Panorama: mostra apenas níveis de pessoas (0 e 1); setores não são pessoas
    return [
      [0, levelNames[0]],
      [1, levelNames[1]],
    ] as [number, string][];
  }, [activeSectorId, levelNames, levelCounts]);

  const sectorCount = useMemo(
    () => (!activeSectorId ? positions.filter((p) => p.isSector).length : 0),
    [activeSectorId, positions],
  );

  const totalPeople = useMemo(() => {
    if (activeSectorId) {
      return Object.values(levelCounts).reduce((s, c) => s + c, 0);
    }
    return mergedNodes.filter((n) => !n.isSector).length;
  }, [activeSectorId, levelCounts, mergedNodes]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Define o viewBox inicial via DOM assim que o SVG aparece na DOM.
  // O React não gerencia mais este atributo — setVb cuida disso diretamente.
  useLayoutEffect(() => {
    if (!mounted) return;
    const v = vbRef.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }, [mounted]);

  // Nomes/cargos sempre visíveis, em qualquer modo (TV e tela cheia normal).
  const fsMode   = useFsMode();
  const hideText = false;

  // ── Tier 3: tilt 3D sutil seguindo o mouse ────────────────────────────
  // Atualiza o transform diretamente no DOM — sem setState para evitar re-renders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = wrapperRef.current;
    if (!el) return;
    const MAX_DEG = 2.8;
    const onMove = (e: MouseEvent) => {
      const tiltEl = canvasTiltRef.current;
      if (!tiltEl) return;
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const ny = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      tiltEl.style.transform = `perspective(1400px) rotateX(${ny * -MAX_DEG}deg) rotateY(${nx * MAX_DEG}deg)`;
    };
    const onLeave = () => {
      const tiltEl = canvasTiltRef.current;
      if (tiltEl) tiltEl.style.transform = '';
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  if (!mounted) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeleton}>
          <div
            className={styles.skeletonRing}
            style={{ width: 150, height: 150, animationDelay: "0s" }}
          />
          <div
            className={styles.skeletonRing}
            style={{ width: 380, height: 380, animationDelay: "0.3s" }}
          />
          <div
            className={styles.skeletonRing}
            style={{ width: 660, height: 660, animationDelay: "0.6s" }}
          />
          <div className={styles.skeletonCenter} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${styles.wrapperLoaded}`}
    >
      {/* ── Barra: alternância de modo (Mapa/Lista) + busca ─────────── */}
      <div className={`${styles.toolbar} ${fsMode !== 'none' ? styles.shifted : ''}`}>
        {unidadeId && (
          <Link href="/" className={styles.unidadesBackLink} title="Voltar para seleção de unidades">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Unidades
          </Link>
        )}
        <div className={styles.segmented}>
          <button
            type="button"
            data-active={viewMode === "radial"}
            onClick={() => setViewMode("radial")}
          >
            Mapa
          </button>
          <button
            type="button"
            data-active={viewMode === "tree"}
            onClick={() => setViewMode("tree")}
          >
            Lista
          </button>
        </div>

        {viewMode === "radial" && (
          <div className={styles.searchBox}>
            <svg
              className={styles.searchIcon}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Buscar pessoa ou setor…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            />
            {query && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
              >
                ×
              </button>
            )}
            {searchOpen && searchResults.length > 0 && (
              <ul className={styles.searchResults}>
                {searchResults.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        flyTo(n);
                      }}
                    >
                      <span
                        className={styles.resultDot}
                        style={{
                          background: n.isSector
                            ? (n.sectorColor ?? levelColors[2])
                            : (levelColors[n.level] ?? "#94a3b8"),
                        }}
                      />
                      <span className={styles.resultText}>
                        <span className={styles.resultName}>
                          {n.name?.trim() || n.role}
                        </span>
                        <span className={styles.resultSub}>
                          {n.isSector
                            ? n.role || "Setor"
                            : (n.role || levelNames[n.level])}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {viewMode === "tree" && (
        <OrgTreeView
          nodes={mergedNodes}
          levelColors={levelColors}
          levelNames={levelNames}
          onSelect={flyTo}
        />
      )}

      {viewMode === "radial" && (
        <>
          {/* ── Back button (sector view only) ──────────────────────────── */}
          {activeSectorId && (
            <button className={styles.backBtn} onClick={goBack}>
              {backLabel}
            </button>
          )}

          {/* ── Sector title (sector view only) ─────────────────────────── */}
          {activeSectorId && (
            <div className={styles.sectorTitle}>
              <span className={styles.sectorTitleLabel}>
                {activeSectorNode?.role === "Sub-setor" ? "SUB-SETOR" : "SETOR"}
              </span>
              <span className={styles.sectorTitleName}>{activeSectorName}</span>
            </div>
          )}

          {/* ── Legend ──────────────────────────────────────────────────── */}
          <aside className={styles.legend}>
            <div className={styles.legendTitle}>
              {activeSectorId ? activeSectorName : "Hierarquia"}
            </div>
            {legendEntries.map(([lvl, name]) => (
              <div key={lvl} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ background: levelColors[lvl] }}
                />
                <span className={styles.legendLabel}>{name}</span>
                <span className={styles.legendCount}>
                  {levelCounts[lvl] ?? 0}
                </span>
              </div>
            ))}
            <div className={styles.legendTotal}>
              {activeSectorId ? (
                <>
                  Equipe: <strong>{totalPeople}</strong> pessoas
                </>
              ) : (
                <>
                  Total: <strong>{totalPeople}</strong> colaboradores
                </>
              )}
            </div>
            {!activeSectorId && (
              <div className={styles.legendHint}>
                <span>
                  {sectorCount} setor{sectorCount !== 1 ? "es" : ""} · Toque
                  para ver a equipe
                </span>
                <span>Arraste · 2 dedos ou scroll → zoom</span>
              </div>
            )}
            {activeSectorId && (
              <div className={styles.legendHint}>
                <span>Arraste · 2 dedos ou scroll → zoom</span>
              </div>
            )}
          </aside>

          {/* ── Canvas inclinável: starfield + SVG ─────────────────────── */}
          <div
            ref={canvasTiltRef}
            className={styles.canvasTilt}
          >
            <SpaceBackground />
            {/* ── SVG Canvas ──────────────────────────────────────────────── */}
            <svg
              ref={svgRef}
              className={styles.svg}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              style={{ cursor: 'grab' }}
            >
              <defs>
                {/* ── Orbital animation defs ── */}
                <filter
                  id="orb-glow"
                  filterUnits="userSpaceOnUse"
                  x="-480"
                  y="-480"
                  width="960"
                  height="960"
                >
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation="4"
                    result="blur"
                  />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id="orb-tip-glow"
                  filterUnits="userSpaceOnUse"
                  x="-480"
                  y="-480"
                  width="960"
                  height="960"
                >
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation="2.5"
                    result="blur"
                  />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* ── Gradientes/clips compartilhados por NodeCard/SectorCard ── */}
                {usedColors.map((c) => (
                  <radialGradient key={c} id={colorGradientId(c)} cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor={c} stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#142133" stopOpacity={1} />
                  </radialGradient>
                ))}
                {ALL_NODE_RADII.map((r) => (
                  <clipPath key={r} id={radiusClipId(r)}>
                    <circle cx={0} cy={0} r={r - 1} />
                  </clipPath>
                ))}
              </defs>

              {/* Ring guides */}
              {activeSectorId
                ? sectorRingGuides.map(({ r, level }) => (
                    <circle
                      key={r}
                      cx={0}
                      cy={0}
                      r={r}
                      fill="none"
                      stroke={levelColors[level] ?? "#fff"}
                      strokeOpacity={0.25}
                      strokeWidth={1.5}
                      strokeDasharray="6 5"
                    />
                  ))
                : Array.from({ length: maxLevel }, (_, i) => i + 1).map(
                    (lv) => {
                      const r = [190, 430][lv - 1] ?? 0;
                      return r > 0 ? (
                        <circle
                          key={lv}
                          cx={0}
                          cy={0}
                          r={r}
                          fill="none"
                          stroke={levelColors[lv] ?? "#fff"}
                          strokeOpacity={0.28}
                          strokeWidth={1.5}
                          strokeDasharray="7 5"
                        />
                      ) : null;
                    },
                  )}

              {/* ── OVERVIEW MODE ─────────────────────────────────────────── */}
              {!activeSectorId && (
                <g key="overview" className={styles.contentGroup}>
                  {/* Orbital intro + alive animation */}
                  {showOrbitalAnimation && renderOrbitalAnimation()}
                  {/* Dir→GG connections (Bezier) — level < 2 only */}
                  {renderConnections(
                    connections.filter((c) => c.level < 2),
                    overviewPosMap,
                  )}
                  {/* GG→Sector arc-spine connections */}
                  {renderArcSpines()}

                  {/* GMs */}
                  {overviewGMs.map((node) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      color={levelColors[node.level] ?? "#fff"}
                      vbW={vb.w}
                      hideText={hideText}
                    />
                  ))}

                  {/* Sector cards */}
                  {overviewSectors.map((node) => (
                    <SectorCard
                      key={node.id}
                      node={node}
                      color={node.sectorColor ?? levelColors[2]}
                      onClick={() => openSector(node.id)}
                      hideText={hideText}
                    />
                  ))}

                  {/* Directors center — múltiplos level-0 são mesclados num único card pareado */}
                  {overviewDirectors.length === 1 && (
                    <CenterCard node={overviewDirectors[0]} color={levelColors[0]} hideText={hideText} />
                  )}
                  {overviewDirectors.length > 1 && (() => {
                    // Diretor principal (isPrimaryDirector) sempre primeiro: define a
                    // ordem do nome ("Principal & Co-diretor") e a foto padrão do card.
                    const sorted = [...overviewDirectors].sort(
                      (a, b) => (b.isPrimaryDirector ? 1 : 0) - (a.isPrimaryDirector ? 1 : 0),
                    );
                    // Achata nomes que já contenham " & " (dados legados) e remove duplicatas
                    const allNames = [...new Set(
                      sorted.flatMap(d =>
                        d.name.split(/\s+&\s+/).map(n => n.trim()).filter(Boolean)
                      )
                    )];
                    const merged: typeof overviewDirectors[0] = {
                      ...sorted[0],
                      name: allNames.join(' & '),
                      photoUrl: sorted[0].photoUrl ?? sorted.find(d => d.photoUrl)?.photoUrl,
                    };
                    return <CenterCard node={merged} color={levelColors[0]} hideText={hideText} />;
                  })()}
                </g>
              )}

              {/* ── SECTOR DETAIL MODE ────────────────────────────────────── */}
              {activeSectorId && sectorDetail && detailCenter && (
                <g key={activeSectorId} className={styles.contentGroup}>
                  {/* Normal connections — manager→sub-sector edges are suppressed when
                      hub-and-spoke is active (replaced below by ring circle + spoke). */}
                  {renderConnections(
                    hubInfo
                      ? visibleDetailConn.filter((c) => {
                          if (c.fromId !== hubInfo.managerId) return true;
                          return !sectorDetail.pos.find((p) => p.id === c.toId)?.isSector;
                        })
                      : visibleDetailConn,
                  )}

                  {/* Hub-and-spoke: ring circle at sub-sector radius + single spoke
                      from manager outward to the ring, connecting all sub-sectors
                      visually without individual per-sub-sector lines. */}
                  {hubInfo && (() => {
                    const { managerPos, ringR } = hubInfo;
                    const mx = managerPos.x;
                    const my = managerPos.y;
                    const dist = Math.sqrt(mx * mx + my * my);
                    const ux = dist > 0 ? mx / dist : 0;
                    const uy = dist > 0 ? my / dist : -1;
                    const spokeStartX = mx + ux * managerPos.radius;
                    const spokeStartY = my + uy * managerPos.radius;
                    const spokeEndX   = ux * ringR;
                    const spokeEndY   = uy * ringR;
                    const col = detailCenter.sectorColor ?? '#4e9af1';
                    return (
                      <g>
                        {/* Circular ring connecting all sub-sectors */}
                        <circle
                          cx={0}
                          cy={0}
                          r={ringR}
                          fill="none"
                          stroke={col}
                          strokeOpacity={0.45}
                          strokeWidth={1.5}
                          strokeDasharray="6 4"
                        />
                        {/* Single spoke from manager to the ring */}
                        <line
                          x1={spokeStartX}
                          y1={spokeStartY}
                          x2={spokeEndX}
                          y2={spokeEndY}
                          stroke={col}
                          strokeOpacity={0.7}
                          strokeWidth={1.5}
                        />
                      </g>
                    );
                  })()}

                  {/* People nodes */}
                  {detailPeopleNodes.map((node) => {
                    const isSectorDirector = node.level === 4;
                    const color = isSectorDirector
                      ? levelColors[0]
                      : (levelColors[node.level] ?? "#fff");
                    return (
                      <g key={node.id}>
                        {isSectorDirector && (
                          <>
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.radius + 15}
                              fill="none"
                              stroke={levelColors[0]}
                              strokeWidth={1.5}
                              strokeOpacity={0.25}
                              strokeDasharray="5 4"
                            />
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.radius + 8}
                              fill="none"
                              stroke={levelColors[0]}
                              strokeWidth={1}
                              strokeOpacity={0.18}
                            />
                          </>
                        )}
                        <NodeCard node={node} color={color} vbW={vb.w} hideText={hideText} />
                      </g>
                    );
                  })}

                  {/* Sub-sector cards — clickable to drill down */}
                  {detailSubSectors.map((node) => (
                    <SectorCard
                      key={node.id}
                      node={node}
                      color={node.sectorColor ?? levelColors[3]}
                      onClick={() => openSector(node.id)}
                      hideText={hideText}
                    />
                  ))}

                  {/* Current sector at center */}
                  <SectorCard
                    node={detailCenter}
                    color={detailCenter.sectorColor ?? levelColors[2]}
                    onClick={() => {}}
                    hideText={hideText}
                  />
                </g>
              )}

              {/* ── Destaque do "voar até" ──────────────────────────────────── */}
              {highlightPos && (
                <FlyHighlight
                  x={highlightPos.x}
                  y={highlightPos.y}
                  r={highlightPos.radius}
                />
              )}
            </svg>
          </div>
          {/* /canvasTilt */}

          {/* ── Zoom Controls ───────────────────────────────────────────── */}
          <div className={styles.controls}>
            <button className={styles.btn} onClick={zoomIn} title="Aproximar">
              +
            </button>
            <button
              className={styles.btn}
              onClick={resetView}
              title="Resetar visão"
            >
              ⌂
            </button>
            <button className={styles.btn} onClick={zoomOut} title="Afastar">
              −
            </button>
          </div>

          {/* ── Mini-mapa (apenas no panorama) ──────────────────────────── */}
          {!activeSectorId && (
            <MiniMap
              positions={positions}
              vb={vb}
              levelColors={levelColors}
              shifted={fsMode !== 'none'}
              onJump={(wx, wy) => {
                const c = vbRef.current;
                setVb({ x: wx - c.w / 2, y: wy - c.h / 2, w: c.w, h: c.h });
              }}
            />
          )}

          {/* ── Stats ───────────────────────────────────────────────────── */}
          {activeSectorId && (
            <div className={styles.stats}>
              {visibleDetailOthers.length} / {detailOthers.length} nós visíveis
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Anel de destaque animado exibido ao "voar até" um nó. */
function FlyHighlight({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g className={styles.flyHighlight} pointerEvents="none">
      <circle
        cx={x}
        cy={y}
        r={r + 6}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={2.5}
        strokeOpacity={0.95}
      />
      <g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        className={styles.flyPulse}
      >
        <circle
          cx={x}
          cy={y}
          r={r + 6}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
        />
      </g>
    </g>
  );
}

interface MiniMapProps {
  positions: PositionedNode[];
  vb: ViewBox;
  levelColors: Record<number, string>;
  onJump: (worldX: number, worldY: number) => void;
  shifted?: boolean;
}

/** Mini-mapa de orientação: pontos dos nós + retângulo do viewport atual. */
function MiniMap({ positions, vb, levelColors, onJump, shifted = false }: MiniMapProps) {
  const S = 150; // tamanho do mini-mapa em px
  const D = 1000; // domínio do mundo: -500..500
  const k = S / D;
  const mx = (x: number) => (x + 500) * k;
  const my = (y: number) => (y + 500) * k;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * S;
    const py = ((e.clientY - rect.top) / rect.height) * S;
    onJump(px / k - 500, py / k - 500);
  };

  return (
    <div className={`${styles.minimap} ${shifted ? styles.shifted : ''}`}>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className={styles.minimapSvg}
        onClick={handleClick}
      >
        {positions.map((p) => (
          <circle
            key={p.id}
            cx={mx(p.x)}
            cy={my(p.y)}
            r={p.level === 0 ? 3.2 : 2.2}
            fill={
              p.isSector
                ? (p.sectorColor ?? levelColors[2])
                : (levelColors[p.level] ?? "#cbd5e1")
            }
          />
        ))}
        <rect
          x={mx(vb.x)}
          y={my(vb.y)}
          width={vb.w * k}
          height={vb.h * k}
          className={styles.minimapViewport}
        />
      </svg>
    </div>
  );
}
