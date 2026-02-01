declare module 'react-force-graph-2d' {
  import { ForwardRefExoticComponent, RefAttributes } from 'react';

  interface GraphData {
    nodes: any[];
    links: any[];
  }

  interface ForceGraph2DProps {
    graphData: GraphData;
    width?: number;
    height?: number;
    backgroundColor?: string;
    nodeRelSize?: number;
    nodeId?: string;
    nodeLabel?: string | ((node: any) => string);
    nodeVal?: number | string | ((node: any) => number);
    nodeColor?: string | ((node: any) => string);
    nodeAutoColorBy?: string | ((node: any) => string | null);
    nodeCanvasObject?: (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    nodeCanvasObjectMode?: string | ((node: any) => string);
    nodePointerAreaPaint?: (node: any, color: string, ctx: CanvasRenderingContext2D) => void;
    linkSource?: string;
    linkTarget?: string;
    linkLabel?: string | ((link: any) => string);
    linkVisibility?: boolean | string | ((link: any) => boolean);
    linkColor?: string | ((link: any) => string);
    linkAutoColorBy?: string | ((link: any) => string | null);
    linkWidth?: number | string | ((link: any) => number);
    linkCurvature?: number | string | ((link: any) => number);
    linkCanvasObject?: (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    linkCanvasObjectMode?: string | ((link: any) => string);
    linkDirectionalArrowLength?: number | string | ((link: any) => number);
    linkDirectionalArrowColor?: string | ((link: any) => string);
    linkDirectionalArrowRelPos?: number | string | ((link: any) => number);
    linkDirectionalParticles?: number | string | ((link: any) => number);
    linkDirectionalParticleSpeed?: number | string | ((link: any) => number);
    linkDirectionalParticleWidth?: number | string | ((link: any) => number);
    linkDirectionalParticleColor?: string | ((link: any) => string);
    dagMode?: string;
    dagLevelDistance?: number;
    d3AlphaDecay?: number;
    d3VelocityDecay?: number;
    warmupTicks?: number;
    cooldownTicks?: number;
    cooldownTime?: number;
    onEngineTick?: () => void;
    onEngineStop?: () => void;
    onNodeClick?: (node: any, event: MouseEvent) => void;
    onNodeRightClick?: (node: any, event: MouseEvent) => void;
    onNodeHover?: (node: any | null, prevNode: any | null) => void;
    onNodeDrag?: (node: any, translate: { x: number; y: number }) => void;
    onNodeDragEnd?: (node: any, translate: { x: number; y: number }) => void;
    onLinkClick?: (link: any, event: MouseEvent) => void;
    onLinkRightClick?: (link: any, event: MouseEvent) => void;
    onLinkHover?: (link: any | null, prevLink: any | null) => void;
    onBackgroundClick?: (event: MouseEvent) => void;
    onBackgroundRightClick?: (event: MouseEvent) => void;
    onZoom?: (transform: { k: number; x: number; y: number }) => void;
    onZoomEnd?: (transform: { k: number; x: number; y: number }) => void;
    enableNodeDrag?: boolean;
    enableZoomInteraction?: boolean;
    enablePanInteraction?: boolean;
    enablePointerInteraction?: boolean;
    ref?: any;
  }

  interface ForceGraph2DMethods {
    d3Force: (forceName: string) => any;
    d3ReheatSimulation: () => void;
    zoomToFit: (duration?: number, padding?: number) => void;
    centerAt: (x?: number, y?: number, duration?: number) => void;
    zoom: (scale?: number, duration?: number) => void;
    pauseAnimation: () => void;
    resumeAnimation: () => void;
    refresh: () => void;
  }

  const ForceGraph2D: ForwardRefExoticComponent<ForceGraph2DProps & RefAttributes<ForceGraph2DMethods>>;
  export default ForceGraph2D;
}
