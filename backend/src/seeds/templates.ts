// Tiny element factory that produces valid Excalidraw element JSON
// without depending on @excalidraw/excalidraw at runtime. Mirrors the
// shape of the frontend's src/templates/factory.ts.

let nextSeed = 1;
function seed(): number {
  nextSeed = (nextSeed * 1103515245 + 12345) & 0x7fffffff;
  return nextSeed;
}

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

interface CommonOpts {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: 'solid' | 'hachure' | 'cross-hatch';
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  roughness?: number;
  roundness?: { type: number } | null;
  groupIds?: string[];
}

interface CommonFields {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch';
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: 'text' | 'arrow' }>;
  updated: number;
  link: string | null;
  locked: boolean;
  version: number;
}

function commonFields(o: CommonOpts): CommonFields {
  return {
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    angle: 0,
    strokeColor: o.strokeColor ?? '#1e1e1e',
    backgroundColor: o.backgroundColor ?? 'transparent',
    fillStyle: o.fillStyle ?? 'solid',
    strokeWidth: o.strokeWidth ?? 2,
    strokeStyle: o.strokeStyle ?? 'solid',
    roughness: o.roughness ?? 1,
    opacity: 100,
    groupIds: o.groupIds ?? [],
    frameId: null,
    roundness: o.roundness === undefined ? { type: 3 } : o.roundness,
    seed: seed(),
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    version: 1,
  };
}

export interface RectangleOpts extends CommonOpts {
  id?: string;
}

export interface RectElement extends CommonFields {
  id: string;
  type: 'rectangle';
}

export function rect(opts: RectangleOpts): RectElement {
  return {
    id: opts.id ?? id('rect'),
    type: 'rectangle',
    ...commonFields(opts),
  };
}

export interface TextOpts {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: 1 | 2 | 3 | 4;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  strokeColor?: string;
  width?: number;
  height?: number;
  containerId?: string | null;
  groupIds?: string[];
}

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid';
  strokeWidth: number;
  strokeStyle: 'solid';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: null;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: 'text' | 'arrow' }>;
  updated: number;
  link: string | null;
  locked: boolean;
  version: number;
  fontSize: number;
  fontFamily: 1 | 2 | 3 | 4;
  text: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  baseline: number;
  containerId: string | null;
  originalText: string;
  lineHeight: number;
  autoResize: boolean;
}

function approxTextSize(
  textValue: string,
  fontSize: number
): { width: number; height: number } {
  const lines = textValue.split('\n');
  const longest = lines.reduce(
    (max, l) => (l.length > max ? l.length : max),
    0
  );
  const width = Math.max(8, Math.round(longest * fontSize * 0.55));
  const lineHeight = Math.round(fontSize * 1.25);
  const height = lines.length * lineHeight;
  return { width, height };
}

export function text(opts: TextOpts): TextElement {
  const fontSize = opts.fontSize ?? 20;
  const fontFamily = opts.fontFamily ?? 1;
  const measured = approxTextSize(opts.text, fontSize);
  const width = opts.width ?? measured.width;
  const height = opts.height ?? measured.height;
  return {
    id: id('text'),
    type: 'text',
    x: opts.x,
    y: opts.y,
    width,
    height,
    angle: 0,
    strokeColor: opts.strokeColor ?? '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: null,
    seed: seed(),
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    version: 1,
    fontSize,
    fontFamily,
    text: opts.text,
    textAlign: opts.textAlign ?? 'left',
    verticalAlign: opts.verticalAlign ?? 'top',
    baseline: Math.round(fontSize * 0.85),
    containerId: opts.containerId ?? null,
    originalText: opts.text,
    lineHeight: 1.25,
    autoResize: true,
  };
}

export interface LineOpts {
  x: number;
  y: number;
  points: [number, number][];
  strokeColor?: string;
  strokeWidth?: number;
  groupIds?: string[];
}

export interface LineElement {
  id: string;
  type: 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid';
  strokeWidth: number;
  strokeStyle: 'solid';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: null;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: 'text' | 'arrow' }>;
  updated: number;
  link: string | null;
  locked: boolean;
  version: number;
  points: [number, number][];
  lastCommittedPoint: null;
  startBinding: null;
  endBinding: null;
  startArrowhead: null;
  endArrowhead: null;
}

export function line(opts: LineOpts): LineElement {
  const xs = opts.points.map((p) => p[0]);
  const ys = opts.points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return {
    id: id('line'),
    type: 'line',
    x: opts.x,
    y: opts.y,
    width,
    height,
    angle: 0,
    strokeColor: opts.strokeColor ?? '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: null,
    seed: seed(),
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    version: 1,
    points: opts.points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };
}

export interface ArrowOpts {
  x: number;
  y: number;
  points: [number, number][];
  strokeColor?: string;
  strokeWidth?: number;
  startBindingId?: string | null;
  endBindingId?: string | null;
  groupIds?: string[];
}

export interface ArrowElement {
  id: string;
  type: 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid';
  strokeWidth: number;
  strokeStyle: 'solid';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number };
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: 'text' | 'arrow' }>;
  updated: number;
  link: string | null;
  locked: boolean;
  version: number;
  points: [number, number][];
  lastCommittedPoint: null;
  startBinding: { elementId: string; focus: number; gap: number } | null;
  endBinding: { elementId: string; focus: number; gap: number } | null;
  startArrowhead: null;
  endArrowhead: 'arrow';
}

export function arrow(opts: ArrowOpts): ArrowElement {
  const xs = opts.points.map((p) => p[0]);
  const ys = opts.points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return {
    id: id('arrow'),
    type: 'arrow',
    x: opts.x,
    y: opts.y,
    width,
    height,
    angle: 0,
    strokeColor: opts.strokeColor ?? '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: opts.strokeWidth ?? 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: { type: 2 },
    seed: seed(),
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    version: 1,
    points: opts.points,
    lastCommittedPoint: null,
    startBinding: opts.startBindingId
      ? { elementId: opts.startBindingId, focus: 0, gap: 4 }
      : null,
    endBinding: opts.endBindingId
      ? { elementId: opts.endBindingId, focus: 0, gap: 4 }
      : null,
    startArrowhead: null,
    endArrowhead: 'arrow',
  };
}

export type AnyElement =
  | RectElement
  | TextElement
  | LineElement
  | ArrowElement;

export interface SeedTemplate {
  name: string;
  description: string;
  elements: AnyElement[];
  appState: Record<string, unknown>;
}

function buildKanban(): SeedTemplate {
  const elements: AnyElement[] = [];
  const columns = [
    { title: 'TO DO', bg: '#fff3bf', x: 100 },
    { title: 'IN PROGRESS', bg: '#d0ebff', x: 460 },
    { title: 'DONE', bg: '#d3f9d8', x: 820 },
  ];
  const colWidth = 320;
  const colHeight = 600;
  const headerHeight = 60;

  for (const col of columns) {
    elements.push(
      rect({
        x: col.x,
        y: 100,
        width: colWidth,
        height: colHeight,
        backgroundColor: '#f8f9fa',
      })
    );
    elements.push(
      rect({
        x: col.x,
        y: 100,
        width: colWidth,
        height: headerHeight,
        backgroundColor: col.bg,
      })
    );
    elements.push(
      text({
        x: col.x + 20,
        y: 118,
        text: col.title,
        fontSize: 24,
        fontFamily: 2,
      })
    );

    // Sample cards.
    const cards = ['Sample card 1', 'Sample card 2'];
    cards.forEach((label, i) => {
      const cardY = 100 + headerHeight + 20 + i * 90;
      elements.push(
        rect({
          x: col.x + 20,
          y: cardY,
          width: colWidth - 40,
          height: 70,
          backgroundColor: '#ffffff',
        })
      );
      elements.push(
        text({
          x: col.x + 36,
          y: cardY + 22,
          text: label,
          fontSize: 18,
          fontFamily: 1,
        })
      );
    });
  }

  return {
    name: 'Kanban Board',
    description: 'Three-column kanban with TO DO, IN PROGRESS, and DONE.',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
  };
}

function buildClassDiagram(): SeedTemplate {
  const elements: AnyElement[] = [];

  const userBoxId = id('rect');
  const userBox = rect({
    id: userBoxId,
    x: 120,
    y: 160,
    width: 240,
    height: 180,
    backgroundColor: '#e7f5ff',
  });
  elements.push(userBox);
  elements.push(
    text({
      x: 140,
      y: 176,
      text: 'User',
      fontSize: 22,
      fontFamily: 2,
    })
  );
  elements.push(
    line({
      x: 120,
      y: 210,
      points: [
        [0, 0],
        [240, 0],
      ],
    })
  );
  elements.push(
    text({
      x: 140,
      y: 220,
      text: '- id: string\n- email: string\n- name: string',
      fontSize: 16,
      fontFamily: 3,
    })
  );
  elements.push(
    line({
      x: 120,
      y: 290,
      points: [
        [0, 0],
        [240, 0],
      ],
    })
  );
  elements.push(
    text({
      x: 140,
      y: 300,
      text: '+ login()\n+ logout()',
      fontSize: 16,
      fontFamily: 3,
    })
  );

  const docBoxId = id('rect');
  const docBox = rect({
    id: docBoxId,
    x: 540,
    y: 160,
    width: 260,
    height: 180,
    backgroundColor: '#fff0f6',
  });
  elements.push(docBox);
  elements.push(
    text({
      x: 560,
      y: 176,
      text: 'Document',
      fontSize: 22,
      fontFamily: 2,
    })
  );
  elements.push(
    line({
      x: 540,
      y: 210,
      points: [
        [0, 0],
        [260, 0],
      ],
    })
  );
  elements.push(
    text({
      x: 560,
      y: 220,
      text: '- id: string\n- title: string\n- ownerId: string',
      fontSize: 16,
      fontFamily: 3,
    })
  );
  elements.push(
    line({
      x: 540,
      y: 290,
      points: [
        [0, 0],
        [260, 0],
      ],
    })
  );
  elements.push(
    text({
      x: 560,
      y: 300,
      text: '+ save()\n+ delete()',
      fontSize: 16,
      fontFamily: 3,
    })
  );

  elements.push(
    arrow({
      x: 360,
      y: 250,
      points: [
        [0, 0],
        [180, 0],
      ],
      startBindingId: userBoxId,
      endBindingId: docBoxId,
    })
  );
  elements.push(
    text({
      x: 410,
      y: 220,
      text: 'owns',
      fontSize: 16,
      fontFamily: 1,
    })
  );

  return {
    name: 'Class Diagram',
    description: 'Simple UML class diagram with User and Document linked by an "owns" relationship.',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
  };
}

export function seedTemplatesData(): SeedTemplate[] {
  return [buildKanban(), buildClassDiagram()];
}
