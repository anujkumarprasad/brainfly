import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphEdge, GraphNode } from '@bl/shared';
import { formatPredicate } from '@bl/shared';
import {
  selectEditedFactId,
  selectFlaggedFactIds,
  useStoryStore,
} from '../store';
import { getEntityColor } from './utils';

export interface GraphNodeObject extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export type GraphLinkObject = Omit<GraphEdge, 'source' | 'target'> & {
  source: string | GraphNodeObject;
  target: string | GraphNodeObject;
};

function getNodeId(nodeOrId: string | GraphNodeObject | unknown): string {
  if (typeof nodeOrId === 'string') return nodeOrId;
  if (nodeOrId && typeof nodeOrId === 'object' && 'id' in nodeOrId) {
    return String((nodeOrId as { id: string }).id);
  }
  return String(nodeOrId ?? '');
}

export const GraphPane: React.FC = () => {
  const { graph, sliderChapter, openChat, isDemoActive } = useStoryStore();
  const flaggedFactIds = useStoryStore(selectFlaggedFactIds);
  const editedFactId = useStoryStore(selectEditedFactId);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNodeObject, GraphLinkObject> | undefined>(undefined);
  const positionsRef = useRef<Map<string, { x: number; y: number; vx?: number; vy?: number }>>(new Map());

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isPhysicsPaused, setIsPhysicsPaused] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNodeObject | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLinkObject | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. Observe the inner canvas container for accurate sizing
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Position stability: preserve x, y for existing nodes across slider updates
  const graphData = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNodeObject[], links: [] as GraphLinkObject[] };

    // Compute degree (number of connected edges) for each node
    const degreeMap = new Map<string, number>();
    for (const edge of graph.edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
    }

    const nodes: GraphNodeObject[] = graph.nodes.map((node) => {
      const cached = positionsRef.current.get(node.id);
      const degree = degreeMap.get(node.id) ?? 0;
      // Start disconnected nodes near top-left of cluster rather than bottom-right
      const defaultX = degree === 0 ? -70 : undefined;
      const defaultY = degree === 0 ? -70 : undefined;
      return {
        ...node,
        x: cached?.x ?? defaultX,
        y: cached?.y ?? defaultY,
        vx: 0,
        vy: 0,
        fx: isPhysicsPaused ? (cached?.x ?? undefined) : undefined,
        fy: isPhysicsPaused ? (cached?.y ?? undefined) : undefined,
      };
    });

    const links: GraphLinkObject[] = graph.edges.map((edge) => ({
      ...edge,
      source: edge.source,
      target: edge.target,
    }));

    return { nodes, links };
  }, [graph, isPhysicsPaused]);

  // Record node positions on each simulation tick to maintain cache
  const handleEngineTick = useCallback(() => {
    for (const node of graphData.nodes) {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        positionsRef.current.set(node.id, {
          x: node.x,
          y: node.y,
        });
      }
    }
  }, [graphData.nodes]);

  // Configure simulation forces (repulsion, link distance, and centering gravity)
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // Repulsion between nodes (sufficient distance so labels never overlap, capped so disconnected nodes don't fly off)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge = fg.d3Force('charge') as any;
    if (charge && typeof charge.strength === 'function') {
      charge.strength(-320).distanceMin(25).distanceMax(220);
    }

    // Link spring length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = fg.d3Force('link') as any;
    if (link && typeof link.distance === 'function') {
      link.distance(90).strength(0.8);
    }

    // Compute degree map to locate disconnected nodes
    const degreeMap = new Map<string, number>();
    for (const linkObj of graphData.links) {
      const s = getNodeId(linkObj.source);
      const t = getNodeId(linkObj.target);
      degreeMap.set(s, (degreeMap.get(s) ?? 0) + 1);
      degreeMap.set(t, (degreeMap.get(t) ?? 0) + 1);
    }

    // Smart orbital force: keeps disconnected nodes orbiting neatly at ~110px from the connected cluster
    fg.d3Force('disconnected-orbit', (alpha: number) => {
      let sumX = 0;
      let sumY = 0;
      let connectedCount = 0;

      for (const node of graphData.nodes) {
        if ((degreeMap.get(node.id) ?? 0) > 0 && typeof node.x === 'number' && typeof node.y === 'number') {
          sumX += node.x;
          sumY += node.y;
          connectedCount++;
        }
      }

      const centerX = connectedCount > 0 ? sumX / connectedCount : 0;
      const centerY = connectedCount > 0 ? sumY / connectedCount : 0;
      const k = alpha * 0.12;

      for (const node of graphData.nodes) {
        const degree = degreeMap.get(node.id) ?? 0;
        if (typeof node.x === 'number' && typeof node.y === 'number') {
          if (degree === 0) {
            // Pull towards target orbit radius 105px from the connected cluster center
            const dx = node.x - centerX;
            const dy = node.y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 105;
            const force = (dist - targetDist) * k;
            node.vx = (node.vx ?? 0) - (dx / dist) * force;
            node.vy = (node.vy ?? 0) - (dy / dist) * force;
          } else {
            // Gentle centering force for connected nodes
            node.vx = (node.vx ?? 0) - (node.x ?? 0) * (alpha * 0.02);
            node.vy = (node.vy ?? 0) - (node.y ?? 0) * (alpha * 0.02);
          }
        }
      }
    });

  }, [graphData.nodes, graphData.links, dimensions.width, dimensions.height]);

  // Fit to view once on initial load (or on manual Fit View click)
  const initialFittedRef = useRef(false);
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && graphData.nodes.length > 0) {
      if (!initialFittedRef.current) {
        const timer = setTimeout(() => {
          fgRef.current?.zoomToFit(350, 60);
          initialFittedRef.current = true;
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [dimensions.width, dimensions.height, graphData.nodes.length]);

  // 3. Compute parallel edge curvature so links between the same pair do not overlap
  const curvatureMap = useMemo(() => {
    const map = new Map<string, number>();
    const pairGroups = new Map<string, string[]>();

    for (const link of graphData.links) {
      const s = getNodeId(link.source);
      const t = getNodeId(link.target);
      const pairKey = [s, t].sort().join('___');
      const group = pairGroups.get(pairKey) ?? [];
      group.push(link.id);
      pairGroups.set(pairKey, group);
    }

    for (const link of graphData.links) {
      const s = getNodeId(link.source);
      const t = getNodeId(link.target);
      const pairKey = [s, t].sort().join('___');
      const group = pairGroups.get(pairKey) ?? [];
      const count = group.length;

      if (count <= 1) {
        map.set(link.id, 0);
      } else {
        const idx = group.indexOf(link.id);
        let c = (idx - (count - 1) / 2) * 0.28;
        if (s > t) {
          c = -c;
        }
        map.set(link.id, c);
      }
    }

    return map;
  }, [graphData.links]);

  // Entity lookup for tooltips
  const entityMap = useMemo(() => {
    const map = new Map<string, GraphNodeObject>();
    for (const n of graphData.nodes) {
      map.set(n.id, n);
    }
    return map;
  }, [graphData.nodes]);

  // 4. Custom Node Canvas Rendering (circle, square, diamond, triangle) with crisp pill badges
  const drawNode = useCallback(
    (node: GraphNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const R = 8;
      const color = getEntityColor(node.id, node.type);
      const isHovered = hoveredNode?.id === node.id;
      const isNewInChapter = node.firstChapter === sliderChapter;
      const scale = Math.max(0.6, Math.min(2.5, globalScale || 1));

      // Glow ring for newly introduced entities in current chapter
      if (isNewInChapter) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, R + 3.5, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
        ctx.lineWidth = 1.6 / scale;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      switch (node.type) {
        case 'character':
          // Circle
          ctx.arc(x, y, R, 0, 2 * Math.PI, false);
          break;
        case 'item': {
          // Square
          const S = R * 1.5;
          ctx.rect(x - S / 2, y - S / 2, S, S);
          break;
        }
        case 'location': {
          // Diamond
          const D = R * 1.35;
          ctx.moveTo(x, y - D);
          ctx.lineTo(x + D, y);
          ctx.lineTo(x, y + D);
          ctx.lineTo(x - D, y);
          ctx.closePath();
          break;
        }
        case 'secret': {
          // Triangle
          const T = R * 1.35;
          ctx.moveTo(x, y - T);
          ctx.lineTo(x + T * 0.9, y + T * 0.65);
          ctx.lineTo(x - T * 0.9, y + T * 0.65);
          ctx.closePath();
          break;
        }
      }

      ctx.fillStyle = color;
      ctx.fill();

      // Border outline
      ctx.strokeStyle = isHovered ? '#ffffff' : '#030712';
      ctx.lineWidth = isHovered ? 2.5 / scale : 1.2 / scale;
      ctx.stroke();

      // Draw clean label pill underneath node
      const label = node.name;
      // Adaptive font size so it's always ~10px on screen regardless of zoom
      const fontSize = Math.max(5, Math.min(11, 10 / scale));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textWidth = ctx.measureText(label).width;
      const padX = 4 / scale;
      const padY = 2 / scale;
      const pillW = textWidth + padX * 2;
      const pillH = fontSize + padY * 2;
      const pillX = x - pillW / 2;
      const pillY = y + R + 4 / scale;

      // Dark background pill prevents messy label overlapping
      ctx.beginPath();
      const radius = 2.5 / scale;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillW, pillH, radius);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fillStyle = isHovered ? 'rgba(15, 23, 42, 0.96)' : 'rgba(3, 7, 18, 0.88)';
      ctx.fill();

      // Pill border
      ctx.strokeStyle = isHovered ? '#fbbf24' : 'rgba(71, 85, 105, 0.55)';
      ctx.lineWidth = 0.8 / scale;
      ctx.stroke();

      // Label text
      ctx.fillStyle = isHovered ? '#fbbf24' : '#f1f5f9';
      ctx.fillText(label, x, pillY + pillH / 2);
    },
    [hoveredNode?.id, sliderChapter]
  );

  // 5. Pointer Area Paint for accurate hover / click hit-testing
  const paintPointerArea = useCallback((node: GraphNodeObject, paintColor: string, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const R = 12; // comfortable cursor hit-testing
    ctx.fillStyle = paintColor;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 2 * Math.PI, false);
    ctx.fill();
  }, []);

  // 6. Link Predicate Label rendering on canvas when hovered or inspected
  const drawLinkCanvas = useCallback(
    (linkObj: GraphLinkObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHovered = hoveredLink?.id === linkObj.id;
      const sNode = typeof linkObj.source === 'object' ? linkObj.source : null;
      const tNode = typeof linkObj.target === 'object' ? linkObj.target : null;
      if (!sNode || !tNode || sNode.x === undefined || tNode.x === undefined) return;

      const isConnectedNodeHovered =
        hoveredNode !== null && (hoveredNode.id === sNode.id || hoveredNode.id === tNode.id);
      const isHighlightLink = linkObj.id === editedFactId || flaggedFactIds.has(linkObj.id);

      // Only show predicate label on hover, or when connected node hovered, or flagged/edited
      if (!isHovered && !isConnectedNodeHovered && !isHighlightLink && globalScale < 2.0) return;

      const curvature = curvatureMap.get(linkObj.id) ?? 0;
      let midX = (sNode.x + tNode.x) / 2;
      let midY = ((sNode.y ?? 0) + (tNode.y ?? 0)) / 2;

      if (curvature !== 0) {
        const dx = tNode.x - sNode.x;
        const dy = (tNode.y ?? 0) - (sNode.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          const nx = -dy / dist;
          const ny = dx / dist;
          const offset = curvature * dist * 0.5;
          midX += nx * offset;
          midY += ny * offset;
        }
      }

      const scale = Math.max(0.6, Math.min(2.5, globalScale || 1));
      const text = formatPredicate(linkObj.predicate).toUpperCase();
      const fontSize = Math.max(4, Math.min(8.5, 7.5 / scale));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textWidth = ctx.measureText(text).width;
      const padX = 3 / scale;
      const padY = 1.5 / scale;
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;

      ctx.fillStyle = isHovered ? 'rgba(15, 23, 42, 0.95)' : 'rgba(3, 7, 18, 0.88)';
      ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = isHovered ? '#f59e0b' : isHighlightLink ? '#ef4444' : '#334155';
      ctx.lineWidth = 0.8 / scale;
      ctx.strokeRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

      ctx.fillStyle = isHovered ? '#fbbf24' : isHighlightLink ? '#fca5a5' : '#94a3b8';
      ctx.fillText(text, midX, midY);
    },
    [curvatureMap, editedFactId, flaggedFactIds, hoveredLink?.id, hoveredNode]
  );

  // Link styling getters
  const getLinkColor = useCallback(
    (link: GraphLinkObject) => {
      if (link.id === editedFactId) return '#f59e0b'; // amber
      if (flaggedFactIds.has(link.id)) return '#ef4444'; // red
      return '#475569'; // dim slate blue-gray
    },
    [editedFactId, flaggedFactIds]
  );

  const getLinkWidth = useCallback(
    (link: GraphLinkObject) => {
      if (link.id === editedFactId) return 3;
      if (flaggedFactIds.has(link.id)) return 2;
      return 1.2;
    },
    [editedFactId, flaggedFactIds]
  );

  const getLinkLineDash = useCallback(
    (link: GraphLinkObject) => {
      if (flaggedFactIds.has(link.id)) return [4, 2];
      return null;
    },
    [flaggedFactIds]
  );

  // Controls
  const handleFitView = () => {
    fgRef.current?.zoomToFit(350, 60);
  };

  const handleTogglePause = () => {
    setIsPhysicsPaused((paused) => {
      const next = !paused;
      if (next) {
        for (const node of graphData.nodes) {
          node.fx = node.x;
          node.fy = node.y;
        }
      } else {
        for (const node of graphData.nodes) {
          node.fx = undefined;
          node.fy = undefined;
        }
        fgRef.current?.d3ReheatSimulation();
      }
      return next;
    });
  };

  const handleNodeClick = (node: GraphNodeObject) => {
    if (node.type === 'character') {
      openChat(node.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <section
      ref={sectionRef}
      className="flex-1 lg:w-[45%] flex flex-col bg-gray-950 overflow-hidden relative select-none"
    >
      {/* Top Header & Toolbar */}
      <div className="h-11 border-b border-gray-800 bg-gray-900/90 px-4 flex items-center justify-between shrink-0 z-10 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
            <span className="i-lucide-share-2 w-3.5 h-3.5 text-amber-400" />
            Knowledge Graph
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-[11px] font-mono text-gray-400 border border-gray-700/60">
            upTo = Ch {sliderChapter}
          </span>
          <span className="hidden sm:inline text-xs text-gray-500 font-mono">
            {graphData.nodes.length} entities &middot; {graphData.links.length} facts
          </span>
        </div>

        {/* Graph Controls */}
        <div className="flex items-center gap-2">
          {/* Fit View Button */}
          <button
            type="button"
            onClick={handleFitView}
            className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 hover:text-white"
            title="Fit graph to view (zoom to fit)"
          >
            <span className="i-lucide-maximize-2 w-3 h-3 text-gray-400" />
            <span className="hidden sm:inline">Fit View</span>
          </button>

          {/* Pause / Resume Physics Toggle */}
          <button
            type="button"
            onClick={handleTogglePause}
            className={`btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 transition-colors ${
              isPhysicsPaused
                ? 'border-amber-500/60 text-amber-400 bg-amber-500/10'
                : 'hover:text-white'
            }`}
            title={isPhysicsPaused ? 'Resume physics simulation' : 'Pause physics simulation'}
          >
            <span
              className={
                isPhysicsPaused
                  ? 'i-lucide-play w-3 h-3 text-amber-400'
                  : 'i-lucide-pause w-3 h-3 text-gray-400'
              }
            />
            <span className="hidden sm:inline">{isPhysicsPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </div>

      {/* Shapes Legend Bar */}
      <div className="h-7 border-b border-gray-800/80 bg-gray-900/40 px-4 flex items-center gap-4 text-[10px] text-gray-400 shrink-0 overflow-x-auto">
        <span className="text-gray-500 font-medium">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          <span>Character (Circle)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-amber-400 inline-block" />
          <span>Item (Square)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-blue-400 rotate-45 inline-block scale-80" />
          <span>Location (Diamond)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-rose-500 inline-block" />
          <span>Secret (Triangle)</span>
        </div>
      </div>

      {/* Main ForceGraph Canvas */}
      <div
        ref={canvasContainerRef}
        onMouseMove={handleMouseMove}
        className="flex-1 relative overflow-hidden bg-gray-950"
      >
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={paintPointerArea}
            nodeCanvasObjectMode={() => 'replace'}
            linkCurvature={(link) => curvatureMap.get((link as GraphLinkObject).id) ?? 0}
            linkColor={(link) => getLinkColor(link as GraphLinkObject)}
            linkWidth={(link) => getLinkWidth(link as GraphLinkObject)}
            linkLineDash={(link) => getLinkLineDash(link as GraphLinkObject)}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={0.85}
            linkDirectionalArrowColor={(link) => getLinkColor(link as GraphLinkObject)}
            linkCanvasObject={drawLinkCanvas}
            linkCanvasObjectMode={() => 'after'}
            minZoom={0.4}
            maxZoom={2.0}
            cooldownTicks={60}
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.4}
            onEngineTick={handleEngineTick}
            onNodeClick={(node) => handleNodeClick(node as GraphNodeObject)}
            onNodeHover={(node) => setHoveredNode((node as GraphNodeObject) ?? null)}
            onLinkHover={(link) => setHoveredLink((link as GraphLinkObject) ?? null)}
            enableNodeDrag={!isPhysicsPaused}
          />
        )}

        {/* Hover Tooltip Card (Node) */}
        {hoveredNode && (
          <div
            className="absolute z-30 pointer-events-none bg-gray-900/95 border border-gray-700/80 rounded-lg p-3 shadow-2xl backdrop-blur max-w-xs transition-opacity duration-150"
            style={{
              left: Math.min(mousePos.x + 14, dimensions.width - 240),
              top: Math.min(mousePos.y + 14, dimensions.height - 140),
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getEntityColor(hoveredNode.id, hoveredNode.type) }}
                />
                {hoveredNode.name}
              </span>
              <span className="badge-gray uppercase text-[9px] tracking-wider font-mono">
                {hoveredNode.type}
              </span>
            </div>

            {hoveredNode.description && (
              <p className="text-[11px] text-gray-300 mb-2 leading-relaxed">
                {hoveredNode.description}
              </p>
            )}

            <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono border-t border-gray-800/80 pt-1.5 mt-1">
              <span>First appeared: Ch {hoveredNode.firstChapter}</span>
              {hoveredNode.type === 'character' && (
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  <span className="i-lucide-message-square w-3 h-3" />
                  Click to chat
                </span>
              )}
            </div>
          </div>
        )}

        {/* Hover Tooltip Card (Link / Fact) */}
        {hoveredLink && !hoveredNode && (
          <div
            className="absolute z-30 pointer-events-none bg-gray-900/95 border border-gray-700/80 rounded-lg p-3 shadow-2xl backdrop-blur max-w-sm transition-opacity duration-150"
            style={{
              left: Math.min(mousePos.x + 14, dimensions.width - 270),
              top: Math.min(mousePos.y + 14, dimensions.height - 160),
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-white">
                {entityMap.get(getNodeId(hoveredLink.source))?.name ?? getNodeId(hoveredLink.source)}{' '}
                <span className="text-amber-400 font-normal">
                  {formatPredicate(hoveredLink.predicate)}
                </span>{' '}
                {entityMap.get(getNodeId(hoveredLink.target))?.name ?? getNodeId(hoveredLink.target)}
              </span>
              <span className="badge-gray text-[9px] font-mono">
                Ch {hoveredLink.chapter}
              </span>
            </div>

            {hoveredLink.status && (
              <div className="text-[10px] text-gray-400 font-mono mb-1">
                Status:{' '}
                <span className="text-gray-200 capitalize">{hoveredLink.status}</span>
              </div>
            )}

            {hoveredLink.id === editedFactId && (
              <div className="mt-2 text-[11px] text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded p-1.5 flex items-center gap-1.5">
                <span className="i-lucide-edit-3 w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Source of causality (Edited fact)</span>
              </div>
            )}

            {flaggedFactIds.has(hoveredLink.id) && (
              <div className="mt-2 text-[11px] text-red-300 bg-red-950/80 border border-red-800 rounded p-1.5 flex flex-col gap-0.5">
                <div className="font-semibold text-red-200 flex items-center gap-1">
                  <span className="i-lucide-alert-triangle w-3.5 h-3.5 text-red-400 shrink-0" />
                  Contradiction Flagged
                </div>
                <div className="text-[10px] text-red-300/90 leading-tight">
                  {flaggedFactIds.get(hoveredLink.id)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
