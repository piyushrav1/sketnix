export type Point = { x: number; y: number };
export type StrokeStyle = {
  color: string;
  width: number;
  opacity?: number;
  variant?: "pen" | "highlighter" | "shape";
  fill?: string;
  dashed?: boolean;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  fontFamily?: "sans" | "hand" | "mono" | "serif";
  lineHeight?: number;
  textBg?: string;
  roughness?: number;
  seed?: number;
};
export type User = { id: string; name: string; color: string };

export type Stroke = {
  strokeID: string;
  author: { id: string; name: string };
  points: Point[];
  style: StrokeStyle;
  zIndex: number;
  kind?: "stroke" | "text" | "note" | "frame" | "image";
  text?: string;
  box?: { width: number; height: number };
  groupId?: string;
  locked?: boolean;
  angle?: number;
  link?: string;
  imageData?: string;
  startBinding?: { elementId: string };
  endBinding?: { elementId: string };
};

export type ChatMessage = {
  id: string;
  author: { id: string; name: string };
  body: string;
  createdAt: string;
};

export type Cursor = {
  user: User;
  x: number;
  y: number;
};
