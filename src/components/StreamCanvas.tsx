"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type React from "react";
import type { Socket } from "socket.io-client";
import rough from "roughjs";
import { Minus, Plus } from "lucide-react";
import type { Cursor, Point, Stroke, StrokeStyle } from "@/types/whiteboard";

type RoomState = {
  snapshot: { image: string; strokeCount: number } | null;
  strokes: Stroke[];
  messages: unknown[];
};

type ActiveStroke = {
  strokeID: string;
  author?: { id: string; name: string };
  points: Point[];
  style: StrokeStyle;
  zIndex?: number;
};

type Camera = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const GRID_SIZE = 32;

export function StreamCanvas({
  socket,
  initialState,
  tool,
  roomID,
  darkMode = false,
  showGrid = true,
  snapEnabled = true,
  showMinimap = false,
  viewMode = false,
  onZoomChange,
  onSelectedKindChange,
  onItemsChange
}: {
  socket: Socket | null;
  initialState: RoomState | null;
  tool: {
    type: string;
    color: string;
    width: number;
    fill?: boolean;
    dashed?: boolean;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    fontStyle?: "normal" | "italic";
    textAlign?: "left" | "center" | "right";
    fontFamily?: "sans" | "hand" | "mono" | "serif";
    lineHeight?: number;
    textBg?: boolean;
    roughness?: number;
    noteColor?: string;
  };
  roomID: string;
  darkMode?: boolean;
  showGrid?: boolean;
  snapEnabled?: boolean;
  showMinimap?: boolean;
  viewMode?: boolean;
  onZoomChange?: (zoom: number, setZoom: (z: number) => void, resetView: () => void) => void;
  onSelectedKindChange?: (kind: "stroke" | "text" | "note" | "frame" | null) => void;
  onItemsChange?: (items: Stroke[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const remoteActiveRef = useRef<Map<string, ActiveStroke>>(new Map());
  const localStrokeRef = useRef<ActiveStroke | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const selectionBoxRef = useRef<{ start: Point; current: Point } | null>(null);
  const dragMoveRef = useRef<{ start: Point; last: Point; moved: boolean } | null>(null);
  const boxCreateRef = useRef<{ start: Point; current: Point; kind: "text" | "note" | "frame" } | null>(null);
  const snapLinesRef = useRef<{ x?: number; y?: number }[]>([]);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const darkModeRef = useRef(darkMode);
  const showGridRef = useRef(showGrid);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const resizeHandleRef = useRef<{
    strokeID: string;
    handle: "nw" | "ne" | "sw" | "se" | "w" | "e";
    origOrigin: Point;
    origBox: { width: number; height: number };
    origFontSize: number;
  } | null>(null);
  const laserTrailsRef = useRef<Map<string, { x: number; y: number; color: string; t: number }[]>>(new Map());
  const laserEmitRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editingOpenedAtRef = useRef(0);

  const [editingItem, setEditingItem] = useState<{
    strokeID: string;
    kind: "text" | "note";
    worldPos: Point;
    text: string;
    color: string;
    fill?: string;
    textBg?: string;
    width: number;
    fontSize: number;
    fontWeight: "normal" | "bold";
    fontStyle: "normal" | "italic";
    textAlign: "left" | "center" | "right";
    fontFamily: "sans" | "hand" | "mono" | "serif";
    lineHeight: number;
    box?: { width: number; height: number };
  } | null>(null);
  const lastEmitRef = useRef(0);
  const queuedPointRef = useRef<Point | null>(null);
  const streamTimerRef = useRef<number | null>(null);
  const cursorEmitRef = useRef(0);

  // Shape drawing state
  const shapeStartRef = useRef<Point | null>(null);
  const shapeCurrentRef = useRef<Point | null>(null);

  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const toolRef = useRef(tool);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; camX: number; camY: number }>({ x: 0, y: 0, camX: 0, camY: 0 });
  const spaceDownRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map());
  const [zoomDisplay, setZoomDisplay] = useState(100);

  // Convert screen coords to world coords
  function screenToWorld(sx: number, sy: number): Point {
    const cam = cameraRef.current;
    return {
      x: (sx - cam.x) / cam.zoom,
      y: (sy - cam.y) / cam.zoom
    };
  }

  // Schedule a redraw on next animation frame (deduped)
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redraw();
    });
  }, []);

  useEffect(() => {
    darkModeRef.current = darkMode;
    showGridRef.current = showGrid;
    scheduleRedraw();
  }, [darkMode, showGrid, showMinimap, scheduleRedraw]);

  useEffect(() => {
    toolRef.current = tool;
    if (tool.type !== "pointer" && selectedIdsRef.current.size > 0) {
      selectedIdsRef.current.clear();
      onSelectedKindChange?.(null);
    }
    scheduleRedraw();
  }, [tool, scheduleRedraw, onSelectedKindChange]);

  // Apply text/note style changes from floating formatting bar
  useEffect(() => {
    const onTextStyle = (event: Event) => {
      const patch = (event as CustomEvent).detail || {};
      const nextTextBg = patch.textBg !== undefined ? (patch.textBg ? "rgba(255, 255, 255, 0.92)" : "") : undefined;
      setEditingItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
          ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
          ...(patch.fontStyle !== undefined ? { fontStyle: patch.fontStyle } : {}),
          ...(patch.textAlign !== undefined ? { textAlign: patch.textAlign } : {}),
          ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
          ...(patch.lineHeight !== undefined ? { lineHeight: patch.lineHeight } : {}),
          ...(nextTextBg !== undefined && prev.kind === "text" ? { textBg: nextTextBg || undefined } : {}),
          ...(patch.color !== undefined && prev.kind === "text" ? { color: patch.color } : {}),
          ...(patch.noteColor !== undefined && prev.kind === "note" ? { fill: patch.noteColor } : {})
        };
      });

      if (selectedIdsRef.current.size > 0) {
        let changed = false;
        strokesRef.current = strokesRef.current.map((s) => {
          if (!selectedIdsRef.current.has(s.strokeID) || (s.kind !== "text" && s.kind !== "note")) return s;
          changed = true;
          const nextStyle: StrokeStyle = {
            ...s.style,
            ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
            ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
            ...(patch.fontStyle !== undefined ? { fontStyle: patch.fontStyle } : {}),
            ...(patch.textAlign !== undefined ? { textAlign: patch.textAlign } : {}),
            ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
            ...(patch.lineHeight !== undefined ? { lineHeight: patch.lineHeight } : {}),
            ...(nextTextBg !== undefined && s.kind === "text" ? { textBg: nextTextBg || undefined } : {}),
            ...(patch.color !== undefined && s.kind === "text" ? { color: patch.color } : {}),
            ...(patch.noteColor !== undefined && s.kind === "note" ? { fill: patch.noteColor } : {})
          };
          const updated = { ...s, style: nextStyle };
          socket?.emit("upsert-item", {
            strokeID: updated.strokeID,
            points: updated.points,
            style: updated.style,
            kind: updated.kind,
            text: updated.text,
            box: updated.box
          });
          return updated;
        });
        if (changed) scheduleRedraw();
      }
    };

    window.addEventListener("whiteboard-text-style", onTextStyle);
    return () => window.removeEventListener("whiteboard-text-style", onTextStyle);
  }, [socket, scheduleRedraw]);

  // Delete, Duplicate (Ctrl+D), and Paste Text (Ctrl+V)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdsRef.current.size > 0) {
        e.preventDefault();
        const ids = Array.from(selectedIdsRef.current);
        strokesRef.current = strokesRef.current.filter((s) => !selectedIdsRef.current.has(s.strokeID));
        selectedIdsRef.current.clear();
        onSelectedKindChange?.(null);
        ids.forEach((strokeID) => socket?.emit("remove-stroke", { strokeID }));
        scheduleRedraw();
        return;
      }

      if ((e.key === "]" || e.key === "[") && selectedIdsRef.current.size > 0 && socket) {
        e.preventDefault();
        socket.emit("reorder-strokes", {
          strokeIDs: Array.from(selectedIdsRef.current),
          direction: e.key === "]" ? "front" : "back"
        });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectedIdsRef.current = new Set(strokesRef.current.map((s) => s.strokeID));
        notifySelectedKind();
        scheduleRedraw();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        runCanvasAction(e.shiftKey ? "ungroup" : "group");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        runCanvasAction("lock");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedIdsRef.current.size > 0) {
        e.preventDefault();
        const clones: Stroke[] = [];
        const newIds = new Set<string>();
        for (const s of strokesRef.current) {
          if (!selectedIdsRef.current.has(s.strokeID)) continue;
          const strokeID = crypto.randomUUID();
          newIds.add(strokeID);
          const cloned: Stroke = {
            ...s,
            strokeID,
            points: s.points.map((p) => ({ x: p.x + 24, y: p.y + 24 })),
            zIndex: Date.now() + clones.length
          };
          clones.push(cloned);
          socket?.emit("upsert-item", {
            strokeID: cloned.strokeID,
            points: cloned.points,
            style: cloned.style,
            kind: cloned.kind || "stroke",
            text: cloned.text,
            box: cloned.box
          });
        }
        if (clones.length > 0) {
          strokesRef.current = [...strokesRef.current, ...clones];
          selectedIdsRef.current = newIds;
          scheduleRedraw();
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      const pasted = e.clipboardData?.getData("text/plain")?.trim();
      if (!pasted || !socket) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const center = screenToWorld((rect?.width || 800) / 2, (rect?.height || 600) / 2);
      const t = toolRef.current;
      const strokeID = crypto.randomUUID();
      const style: StrokeStyle = {
        color: t.color,
        width: t.width,
        fontSize: t.fontSize || 18,
        fontWeight: t.fontWeight || "normal",
        fontStyle: t.fontStyle || "normal",
        textAlign: t.textAlign || "left",
        fontFamily: t.fontFamily || "sans",
        lineHeight: t.lineHeight || 1.35,
        ...(t.textBg ? { textBg: "rgba(255, 255, 255, 0.92)" } : {})
      };
      const item: Stroke = {
        strokeID,
        author: { id: "me", name: "Me" },
        points: [center],
        style,
        zIndex: Date.now(),
        kind: "text",
        text: pasted
      };
      strokesRef.current = [...strokesRef.current, item];
      socket.emit("upsert-item", { strokeID, points: [center], style, kind: "text", text: pasted });
      scheduleRedraw();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [socket, scheduleRedraw, onSelectedKindChange]);

  useEffect(() => {
    strokesRef.current = initialState?.strokes || [];
    onItemsChange?.(strokesRef.current);
    scheduleRedraw();
  }, [initialState, scheduleRedraw, onItemsChange]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      scheduleRedraw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    return () => observer.disconnect();
  }, [scheduleRedraw]);

  // Keyboard listeners for space-to-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceDownRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        isPanningRef.current = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Zoom toward cursor
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));

      const wx = (mx - cam.x) / cam.zoom;
      const wy = (my - cam.y) / cam.zoom;

      cam.zoom = newZoom;
      cam.x = mx - wx * newZoom;
      cam.y = my - wy * newZoom;

      setZoomDisplay(Math.round(newZoom * 100));
      onZoomChange?.(newZoom, setZoom, resetView);
      scheduleRedraw();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [scheduleRedraw]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const start = ({ strokeID, author, point, style }: { strokeID: string; author: Stroke["author"]; point: Point; style: StrokeStyle }) => {
      remoteActiveRef.current.set(strokeID, { strokeID, author, points: [point], style });
      scheduleRedraw();
    };
    const stream = ({ strokeID, point }: { strokeID: string; point: Point }) => {
      const active = remoteActiveRef.current.get(strokeID);
      if (!active) return;
      active.points.push(point);
      scheduleRedraw();
    };
    const end = ({ strokeID, zIndex }: { strokeID: string; zIndex: number }) => {
      const active = remoteActiveRef.current.get(strokeID);
      if (!active) return;
      remoteActiveRef.current.delete(strokeID);
      strokesRef.current = [...strokesRef.current, { ...active, author: active.author || { id: "remote", name: "Remote" }, zIndex }];
      scheduleRedraw();
    };
    const remove = ({ strokeID }: { strokeID: string }) => {
      strokesRef.current = strokesRef.current.filter((stroke) => stroke.strokeID !== strokeID);
      remoteActiveRef.current.delete(strokeID);
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
    };
    const restore = (stroke: Stroke) => {
      strokesRef.current = [...strokesRef.current.filter((item) => item.strokeID !== stroke.strokeID), stroke].sort((a, b) => a.zIndex - b.zIndex);
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
    };
    const clear = () => {
      strokesRef.current = [];
      remoteActiveRef.current.clear();
      selectedIdsRef.current.clear();
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
    };
    const strokesMoved = ({ updates }: { updates: { strokeID: string; points: Point[]; box?: { width: number; height: number } }[] }) => {
      const map = new Map(updates.map((u) => [u.strokeID, u]));
      strokesRef.current = strokesRef.current.map((stroke) => {
        const u = map.get(stroke.strokeID);
        return u ? { ...stroke, points: u.points, ...(u.box ? { box: u.box } : {}) } : stroke;
      });
      scheduleRedraw();
    };
    const strokesReordered = ({ updates }: { updates: { strokeID: string; zIndex: number }[] }) => {
      const map = new Map(updates.map((u) => [u.strokeID, u.zIndex]));
      strokesRef.current = strokesRef.current
        .map((s) => (map.has(s.strokeID) ? { ...s, zIndex: map.get(s.strokeID)! } : s))
        .sort((a, b) => a.zIndex - b.zIndex);
      scheduleRedraw();
    };
    const strokesPatched = ({ patches }: { patches: Partial<Stroke>[] }) => {
      const map = new Map(patches.map((p) => [p.strokeID, p]));
      strokesRef.current = strokesRef.current.map((s) => {
        const p = map.get(s.strokeID);
        return p ? { ...s, ...p } : s;
      });
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
    };
    const strokesImported = ({ items }: { items: Stroke[] }) => {
      const existing = new Set(strokesRef.current.map((s) => s.strokeID));
      const fresh = items.filter((i) => !existing.has(i.strokeID));
      if (fresh.length > 0) {
        strokesRef.current = [...strokesRef.current, ...fresh].sort((a, b) => a.zIndex - b.zIndex);
        onItemsChange?.(strokesRef.current);
        scheduleRedraw();
      }
    };
    const itemUpserted = (item: Stroke) => {
      strokesRef.current = [...strokesRef.current.filter((s) => s.strokeID !== item.strokeID), item].sort(
        (a, b) => a.zIndex - b.zIndex
      );
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
    };
    const laserMove = ({ id, x, y, color }: { id: string; x: number; y: number; color: string }) => {
      const now = performance.now();
      const trail = laserTrailsRef.current.get(id) || [];
      trail.push({ x, y, color, t: now });
      laserTrailsRef.current.set(id, trail.filter((p) => now - p.t < 800));
      scheduleRedraw();
    };
    const cursorMove = (cursor: Cursor) => {
      setCursors((current) => new Map(current).set(cursor.user.id, cursor));
    };
    const cursorLeave = ({ id }: { id: string }) => {
      setCursors((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };

    socket.on("start-stroke", start);
    socket.on("stream-stroke", stream);
    socket.on("end-stroke", end);
    socket.on("remove-stroke", remove);
    socket.on("restore-stroke", restore);
    socket.on("clear-canvas", clear);
    socket.on("strokes-moved", strokesMoved);
    socket.on("strokes-reordered", strokesReordered);
    socket.on("strokes-patched", strokesPatched);
    socket.on("strokes-imported", strokesImported);
    socket.on("item-upserted", itemUpserted);
    socket.on("laser-move", laserMove);
    socket.on("cursor-move", cursorMove);
    socket.on("cursor-leave", cursorLeave);

    return () => {
      socket.off("start-stroke", start);
      socket.off("stream-stroke", stream);
      socket.off("end-stroke", end);
      socket.off("remove-stroke", remove);
      socket.off("restore-stroke", restore);
      socket.off("clear-canvas", clear);
      socket.off("strokes-moved", strokesMoved);
      socket.off("strokes-reordered", strokesReordered);
      socket.off("strokes-patched", strokesPatched);
      socket.off("strokes-imported", strokesImported);
      socket.off("item-upserted", itemUpserted);
      socket.off("laser-move", laserMove);
      socket.off("cursor-move", cursorMove);
      socket.off("cursor-leave", cursorLeave);
    };
  }, [socket, scheduleRedraw]);

  // Export listeners
  useEffect(() => {
    const exportPng = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      download(`${roomID}.png`, canvas.toDataURL("image/png"));
    };
    const exportSvg = () => {
      const svg = strokesToSvg(strokesRef.current, canvasRef.current);
      download(`${roomID}.svg`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    };
    const exportJson = () => {
      const payload = JSON.stringify({ type: "stream-sync-whiteboard", version: 1, items: strokesRef.current }, null, 2);
      download(`${roomID}.json`, `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`);
    };
    const importJson = (event: Event) => {
      const items = (event as CustomEvent).detail?.items;
      if (Array.isArray(items) && items.length > 0 && socket) {
        const remapped = items.map((i: Stroke) => ({ ...i, strokeID: crypto.randomUUID() }));
        socket.emit("import-strokes", { items: remapped });
      }
    };
    const onAction = (event: Event) => {
      const action = (event as CustomEvent).detail?.action;
      if (action) runCanvasAction(action);
    };
    const onFocusPoint = (event: Event) => {
      const stroke = (event as CustomEvent).detail as Stroke | undefined;
      const canvas = canvasRef.current;
      if (!stroke || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const b = getStrokeBounds(stroke);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      cameraRef.current.x = rect.width / 2 - cx * cameraRef.current.zoom;
      cameraRef.current.y = rect.height / 2 - cy * cameraRef.current.zoom;
      selectedIdsRef.current = new Set([stroke.strokeID]);
      notifySelectedKind();
      scheduleRedraw();
    };

    window.addEventListener("whiteboard-export-png", exportPng);
    window.addEventListener("whiteboard-export-svg", exportSvg);
    window.addEventListener("whiteboard-export-json", exportJson);
    window.addEventListener("whiteboard-import-json", importJson);
    window.addEventListener("whiteboard-action", onAction);
    window.addEventListener("whiteboard-focus-point", onFocusPoint);
    return () => {
      window.removeEventListener("whiteboard-export-png", exportPng);
      window.removeEventListener("whiteboard-export-svg", exportSvg);
      window.removeEventListener("whiteboard-export-json", exportJson);
      window.removeEventListener("whiteboard-import-json", importJson);
      window.removeEventListener("whiteboard-action", onAction);
      window.removeEventListener("whiteboard-focus-point", onFocusPoint);
    };
  }, [roomID, socket, scheduleRedraw]);

  /* ── Eraser Helpers ── */
  function eraseAtPoint(pt: Point) {
    const distToSegmentSquared = (p: Point, v: Point, w: Point) => {
      const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
      if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    };

    const ERASER_RADIUS_WORLD = 15 / cameraRef.current.zoom;
    const radiusSq = ERASER_RADIUS_WORLD * ERASER_RADIUS_WORLD;
    
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (stroke.locked) continue;
      let hit = false;
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        if ((p.x - pt.x) ** 2 + (p.y - pt.y) ** 2 <= radiusSq) hit = true;
      } else {
        for (let j = 0; j < stroke.points.length - 1; j++) {
          if (distToSegmentSquared(pt, stroke.points[j], stroke.points[j+1]) <= radiusSq) {
            hit = true;
            break;
          }
        }
      }
      
      if (hit) {
        strokesRef.current.splice(i, 1);
        socket?.emit("remove-stroke", { strokeID: stroke.strokeID });
        scheduleRedraw();
      }
    }
  }

  /* ── Pointer handlers ── */

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    setContextMenu(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    // Middle mouse or space+left or tool=hand or viewMode -> pan
    if (event.button === 1 || (spaceDownRef.current && event.button === 0) || tool.type === "hand" || viewMode) {
      isPanningRef.current = true;
      panStartRef.current = { x: event.clientX, y: event.clientY, camX: cameraRef.current.x, camY: cameraRef.current.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!socket || event.button !== 0) return;

    const point = screenToWorld(sx, sy);

    if (tool.type === "pointer") {
      const tolerance = 10 / cameraRef.current.zoom;

      // Check corner resize handles on single selected text/note
      if (selectedIdsRef.current.size === 1) {
        const onlyId = Array.from(selectedIdsRef.current)[0];
        const sel = strokesRef.current.find((s) => s.strokeID === onlyId);
        if (sel && (sel.kind === "note" || sel.kind === "text")) {
          const handle = hitTestResizeHandle(point, sel, 8 / cameraRef.current.zoom);
          if (handle) {
            const b = getStrokeBounds(sel);
            resizeHandleRef.current = {
              strokeID: sel.strokeID,
              handle,
              origOrigin: { x: b.minX, y: b.minY },
              origBox: { width: Math.max(80, b.maxX - b.minX), height: Math.max(44, b.maxY - b.minY) },
              origFontSize: sel.style.fontSize || (sel.kind === "note" ? 15 : Math.max(16, (sel.style.width || 4) * 3))
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
        }
      }

      const hitSelected = strokesRef.current.some(
        (s) => selectedIdsRef.current.has(s.strokeID) && isPointNearStroke(point, s, tolerance)
      );

      if (hitSelected && !event.shiftKey) {
        const hasUnlocked = strokesRef.current.some(
          (s) => selectedIdsRef.current.has(s.strokeID) && !s.locked
        );
        if (hasUnlocked) {
          dragMoveRef.current = { start: point, last: point, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        return;
      }

      const sorted = [...strokesRef.current].sort((a, b) => a.zIndex - b.zIndex);
      let hitStroke: Stroke | null = null;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (isPointNearStroke(point, sorted[i], tolerance)) {
          hitStroke = sorted[i];
          break;
        }
      }

      if (hitStroke) {
        const groupMatches = hitStroke.groupId
          ? strokesRef.current.filter((s) => s.groupId === hitStroke!.groupId).map((s) => s.strokeID)
          : [hitStroke.strokeID];
        if (event.shiftKey) {
          if (selectedIdsRef.current.has(hitStroke.strokeID)) {
            groupMatches.forEach((id) => selectedIdsRef.current.delete(id));
          } else {
            groupMatches.forEach((id) => selectedIdsRef.current.add(id));
          }
        } else {
          selectedIdsRef.current = new Set(groupMatches);
          if (!hitStroke.locked) {
            dragMoveRef.current = { start: point, last: point, moved: false };
          }
        }
      } else {
        if (!event.shiftKey) selectedIdsRef.current.clear();
        selectionBoxRef.current = { start: point, current: point };
      }

      notifySelectedKind();
      event.currentTarget.setPointerCapture(event.pointerId);
      scheduleRedraw();
      return;
    }

    if (tool.type === "laser") {
      laserTrailsRef.current.set("me", []);
      maybeEmitLaser(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool.type === "text" || tool.type === "note" || tool.type === "frame") {
      event.preventDefault();
      if (editingItem) commitEditingItem(editingItem);
      boxCreateRef.current = { start: point, current: point, kind: tool.type };
      event.currentTarget.setPointerCapture(event.pointerId);
      scheduleRedraw();
      return;
    }

    if (tool.type === "eraser") {
      eraseAtPoint(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const strokeID = crypto.randomUUID();
    const isFreehand = tool.type === "pencil" || tool.type === "highlighter";
    const isClosedShape = tool.type === "rectangle" || tool.type === "diamond" || tool.type === "ellipse";
    const roughness = !isFreehand ? (tool.roughness ?? 1.5) : 0;
    const seed = !isFreehand ? Math.floor(Math.random() * 2 ** 31) : undefined;
    const style: StrokeStyle = {
      color: tool.color,
      width: tool.width,
      opacity: tool.type === "highlighter" ? 0.35 : 1,
      variant: tool.type === "highlighter" ? "highlighter" : isFreehand ? "pen" : "shape",
      ...(tool.fill && isClosedShape ? { fill: hexWithAlpha(tool.color, 0.25) } : {}),
      ...(tool.dashed && !isFreehand ? { dashed: true } : {}),
      ...(roughness > 0 ? { roughness, seed } : {})
    };
    const active = { strokeID, points: [point], style };
    localStrokeRef.current = active;

    if (isFreehand) {
      lastEmitRef.current = performance.now();
      socket.emit("start-stroke", {
        strokeID,
        color: style.color,
        width: style.width,
        opacity: style.opacity,
        variant: style.variant,
        initialCoords: point
      });
    } else {
      shapeStartRef.current = point;
      shapeCurrentRef.current = point;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    scheduleRedraw();
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    // Panning
    if (isPanningRef.current) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      cameraRef.current.x = panStartRef.current.camX + dx;
      cameraRef.current.y = panStartRef.current.camY + dy;
      scheduleRedraw();
      return;
    }

    const point = screenToWorld(sx, sy);
    maybeEmitCursor(point);

    if (tool.type === "laser") {
      if (event.buttons === 1) {
        maybeEmitLaser(point);
      }
      return;
    }

    if (tool.type === "text" || tool.type === "note" || tool.type === "frame") {
      if (boxCreateRef.current) {
        boxCreateRef.current.current = point;
        scheduleRedraw();
      }
      return;
    }

    if (tool.type === "pointer") {
      if (resizeHandleRef.current) {
        const { strokeID, handle, origOrigin, origBox, origFontSize } = resizeHandleRef.current;
        const minW = 80;
        const minH = 44;
        let left = origOrigin.x;
        let top = origOrigin.y;
        let right = origOrigin.x + origBox.width;
        let bottom = origOrigin.y + origBox.height;

        if (handle === "nw" || handle === "sw" || handle === "w") left = Math.min(point.x, right - minW);
        if (handle === "ne" || handle === "se" || handle === "e") right = Math.max(point.x, left + minW);
        if (handle === "nw" || handle === "ne") top = Math.min(point.y, bottom - minH);
        if (handle === "sw" || handle === "se") bottom = Math.max(point.y, top + minH);

        const nextWidth = Math.round(right - left);
        const nextHeight = Math.round(bottom - top);
        const isCorner = handle === "nw" || handle === "ne" || handle === "sw" || handle === "se";

        strokesRef.current = strokesRef.current.map((s) => {
          if (s.strokeID !== strokeID) return s;
          if (s.kind === "text" && isCorner) {
            const scale = Math.max(0.3, Math.min(4, nextWidth / origBox.width));
            const nextFontSize = Math.round(Math.min(120, Math.max(10, origFontSize * scale)));
            return {
              ...s,
              points: [{ x: left, y: top }],
              style: { ...s.style, fontSize: nextFontSize },
              ...(s.box ? { box: { width: nextWidth, height: Math.round(origBox.height * scale) } } : {})
            };
          }
          if (s.kind === "text" && (handle === "w" || handle === "e")) {
            return {
              ...s,
              points: [{ x: left, y: top }],
              box: { width: nextWidth, height: s.box?.height || origBox.height }
            };
          }
          return { ...s, points: [{ x: left, y: top }], box: { width: nextWidth, height: nextHeight } };
        });
        scheduleRedraw();
        return;
      }

      if (dragMoveRef.current) {
        let dx = point.x - dragMoveRef.current.last.x;
        let dy = point.y - dragMoveRef.current.last.y;
        if (dx !== 0 || dy !== 0) {
          dragMoveRef.current.last = point;
          dragMoveRef.current.moved = true;
          let moved = strokesRef.current.map((stroke) =>
            selectedIdsRef.current.has(stroke.strokeID) && !stroke.locked
              ? { ...stroke, points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
              : stroke
          );

          // Smart object snapping
          snapLinesRef.current = [];
          if (snapEnabled) {
            const selStrokes = moved.filter((s) => selectedIdsRef.current.has(s.strokeID) && !s.locked);
            const otherStrokes = moved.filter((s) => !selectedIdsRef.current.has(s.strokeID));
            if (selStrokes.length > 0 && otherStrokes.length > 0) {
              const selBox = mergeBoxes(selStrokes.map(getStrokeBounds));
              const selCx = (selBox.minX + selBox.maxX) / 2;
              const selCy = (selBox.minY + selBox.maxY) / 2;
              const thresh = 6 / cameraRef.current.zoom;
              let bestDx = 0;
              let bestDy = 0;
              let minAbsX = thresh;
              let minAbsY = thresh;
              let snapX: number | undefined;
              let snapY: number | undefined;

              for (const other of otherStrokes) {
                const ob = getStrokeBounds(other);
                const ocx = (ob.minX + ob.maxX) / 2;
                const ocy = (ob.minY + ob.maxY) / 2;
                for (const sx of [selBox.minX, selCx, selBox.maxX]) {
                  for (const ox of [ob.minX, ocx, ob.maxX]) {
                    const diff = ox - sx;
                    if (Math.abs(diff) < minAbsX) {
                      minAbsX = Math.abs(diff);
                      bestDx = diff;
                      snapX = ox;
                    }
                  }
                }
                for (const sy of [selBox.minY, selCy, selBox.maxY]) {
                  for (const oy of [ob.minY, ocy, ob.maxY]) {
                    const diff = oy - sy;
                    if (Math.abs(diff) < minAbsY) {
                      minAbsY = Math.abs(diff);
                      bestDy = diff;
                      snapY = oy;
                    }
                  }
                }
              }

              if (bestDx !== 0 || bestDy !== 0) {
                moved = moved.map((stroke) =>
                  selectedIdsRef.current.has(stroke.strokeID) && !stroke.locked
                    ? { ...stroke, points: stroke.points.map((p) => ({ x: p.x + bestDx, y: p.y + bestDy })) }
                    : stroke
                );
                if (snapX !== undefined) snapLinesRef.current.push({ x: snapX });
                if (snapY !== undefined) snapLinesRef.current.push({ y: snapY });
              }
            }
          }

          strokesRef.current = moved;
          scheduleRedraw();
        }
      } else if (selectionBoxRef.current) {
        selectionBoxRef.current.current = point;
        const box = normalizeBox(selectionBoxRef.current.start, selectionBoxRef.current.current);
        selectedIdsRef.current = new Set(
          strokesRef.current
            .filter((s) => boxesIntersect(box, getStrokeBounds(s)))
            .map((s) => s.strokeID)
        );
        notifySelectedKind();
        scheduleRedraw();
      }
      return;
    }

    if (tool.type === "eraser") {
      if (event.buttons === 1) {
        eraseAtPoint(point);
      }
      return;
    }

    const active = localStrokeRef.current;
    if (!active) return;

    if (tool.type === "pencil" || tool.type === "highlighter") {
      active.points.push(point);
      streamPoint(active.strokeID, point);
    } else {
      shapeCurrentRef.current = point;
    }

    scheduleRedraw();
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (tool.type === "laser") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (tool.type === "text" || tool.type === "note" || tool.type === "frame") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (boxCreateRef.current) {
        const { start, current, kind } = boxCreateRef.current;
        boxCreateRef.current = null;
        const norm = normalizeBox(start, current);
        const draggedW = norm.maxX - norm.minX;
        const draggedH = norm.maxY - norm.minY;
        const isDragged = draggedW > 14 && draggedH > 14;

        if (kind === "frame") {
          const w = isDragged ? Math.round(Math.max(160, draggedW)) : 360;
          const h = isDragged ? Math.round(Math.max(120, draggedH)) : 240;
          const origin = isDragged ? { x: norm.minX, y: norm.minY } : start;
          const frameCount = strokesRef.current.filter((s) => s.kind === "frame").length + 1;
          const strokeID = crypto.randomUUID();
          const frame: Stroke = {
            strokeID,
            author: { id: "me", name: "Me" },
            points: [origin],
            style: { color: "#0d9488", width: 2 },
            zIndex: Date.now(),
            kind: "frame",
            text: `Frame ${frameCount}`,
            box: { width: w, height: h }
          };
          strokesRef.current = [...strokesRef.current, frame];
          onItemsChange?.(strokesRef.current);
          socket?.emit("upsert-item", {
            strokeID,
            points: [origin],
            style: frame.style,
            kind: "frame",
            text: frame.text,
            box: frame.box
          });
          scheduleRedraw();
          return;
        }

        const isNote = kind === "note";
        const box = isDragged
          ? { width: Math.round(Math.max(100, draggedW)), height: Math.round(Math.max(60, draggedH)) }
          : isNote
            ? { width: 200, height: 150 }
            : undefined;
        const worldPos = isDragged ? { x: norm.minX, y: norm.minY } : start;

        editingOpenedAtRef.current = performance.now();
        setEditingItem({
          strokeID: crypto.randomUUID(),
          kind,
          worldPos,
          text: "",
          color: isNote ? "#1e293b" : tool.color,
          ...(isNote ? { fill: tool.noteColor || "#fef08a" } : {}),
          ...(tool.textBg && !isNote ? { textBg: "rgba(255, 255, 255, 0.92)" } : {}),
          width: tool.width,
          fontSize: tool.fontSize || 18,
          fontWeight: tool.fontWeight || "normal",
          fontStyle: tool.fontStyle || "normal",
          textAlign: tool.textAlign || "left",
          fontFamily: tool.fontFamily || "sans",
          lineHeight: tool.lineHeight || 1.35,
          ...(box ? { box } : {})
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
        scheduleRedraw();
      }
      return;
    }

    if (tool.type === "pointer") {
      if (resizeHandleRef.current) {
        const { strokeID } = resizeHandleRef.current;
        resizeHandleRef.current = null;
        const updated = strokesRef.current.find((s) => s.strokeID === strokeID);
        if (updated && socket) {
          socket.emit("move-strokes", {
            updates: [{ strokeID: updated.strokeID, points: updated.points, box: updated.box, style: updated.style }]
          });
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        scheduleRedraw();
        return;
      }

      if (dragMoveRef.current?.moved && socket) {
        const updates = strokesRef.current
          .filter((s) => selectedIdsRef.current.has(s.strokeID))
          .map((s) => ({ strokeID: s.strokeID, points: s.points }));
        if (updates.length > 0) socket.emit("move-strokes", { updates });
      }
      dragMoveRef.current = null;
      selectionBoxRef.current = null;
      snapLinesRef.current = [];
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      scheduleRedraw();
      return;
    }

    if (tool.type === "eraser") {
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    const active = localStrokeRef.current;
    if (!active || !socket) return;

    if (tool.type === "pencil" || tool.type === "highlighter") {
      flushQueuedPoint(active.strokeID);
    } else if (shapeStartRef.current && shapeCurrentRef.current) {
      // Generate shape points
      const points = generateShapePoints(tool.type, shapeStartRef.current, shapeCurrentRef.current);
      if (points.length > 0) {
        active.points = points;
        socket.emit("start-stroke", {
          strokeID: active.strokeID,
          color: active.style.color,
          width: active.style.width,
          opacity: active.style.opacity,
          variant: active.style.variant,
          fill: active.style.fill,
          dashed: active.style.dashed,
          roughness: active.style.roughness,
          seed: active.style.seed,
          initialCoords: points[0]
        });
        points.slice(1).forEach(pt => socket.emit("stream-stroke", { strokeID: active.strokeID, point: pt }));
      }
    }

    localStrokeRef.current = null;
    shapeStartRef.current = null;
    shapeCurrentRef.current = null;
    
    if (active.points.length > 0) {
      strokesRef.current = [...strokesRef.current, { ...active, author: { id: "me", name: "Me" }, zIndex: Date.now() }];
      socket.emit("end-stroke", { strokeID: active.strokeID, snapshot: canvasRef.current?.toDataURL("image/png") });
    }
    
    event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleRedraw();
  }

  function streamPoint(strokeID: string, point: Point) {
    if (!socket) return;
    const now = performance.now();

    if (now - lastEmitRef.current >= 12) {
      socket.emit("stream-stroke", { strokeID, point });
      lastEmitRef.current = now;
      queuedPointRef.current = null;
      return;
    }

    queuedPointRef.current = point;
    if (streamTimerRef.current) return;

    streamTimerRef.current = window.setTimeout(() => {
      streamTimerRef.current = null;
      flushQueuedPoint(strokeID);
    }, 12);
  }

  function flushQueuedPoint(strokeID: string) {
    if (!socket || !queuedPointRef.current) return;
    socket.emit("stream-stroke", { strokeID, point: queuedPointRef.current });
    queuedPointRef.current = null;
    lastEmitRef.current = performance.now();
  }

  function maybeEmitCursor(point: Point) {
    if (!socket) return;
    const now = performance.now();
    if (now - cursorEmitRef.current < 35) return;
    cursorEmitRef.current = now;
    socket.emit("cursor-move", point);
  }

  function emitCursorLeave() {
    if (!socket) return;
    socket.emit("cursor-leave");
  }

  function maybeEmitLaser(point: Point) {
    const now = performance.now();
    const color = tool.color === "#111827" ? "#ef4444" : tool.color;
    const trail = laserTrailsRef.current.get("me") || [];
    trail.push({ x: point.x, y: point.y, color, t: now });
    laserTrailsRef.current.set("me", trail.filter((p) => now - p.t < 800));
    scheduleRedraw();

    if (!socket || now - laserEmitRef.current < 20) return;
    laserEmitRef.current = now;
    socket.emit("laser-move", { x: point.x, y: point.y, color });
  }

  function runCanvasAction(action: string) {
    if (action === "zoom-fit") {
      const canvas = canvasRef.current;
      if (!canvas || strokesRef.current.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const box = mergeBoxes(strokesRef.current.map(getStrokeBounds));
      const bw = Math.max(100, box.maxX - box.minX);
      const bh = Math.max(100, box.maxY - box.minY);
      const pad = 64;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh)));
      cameraRef.current.zoom = newZoom;
      cameraRef.current.x = rect.width / 2 - ((box.minX + box.maxX) / 2) * newZoom;
      cameraRef.current.y = rect.height / 2 - ((box.minY + box.maxY) / 2) * newZoom;
      setZoomDisplay(Math.round(newZoom * 100));
      onZoomChange?.(newZoom, setZoom, resetView);
      scheduleRedraw();
      return;
    }

    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;

    if (action === "delete") {
      strokesRef.current = strokesRef.current.filter((s) => !selectedIdsRef.current.has(s.strokeID) || s.locked);
      ids.forEach((strokeID) => {
        const st = strokesRef.current.find((x) => x.strokeID === strokeID);
        if (!st) socket?.emit("remove-stroke", { strokeID });
      });
      selectedIdsRef.current.clear();
      onSelectedKindChange?.(null);
      onItemsChange?.(strokesRef.current);
      scheduleRedraw();
      return;
    }

    if (action === "bring-front" || action === "send-back") {
      socket?.emit("reorder-strokes", { strokeIDs: ids, direction: action === "bring-front" ? "front" : "back" });
      return;
    }

    if (action === "duplicate") {
      const clones: Stroke[] = [];
      const newIds = new Set<string>();
      for (const s of strokesRef.current) {
        if (!selectedIdsRef.current.has(s.strokeID)) continue;
        const strokeID = crypto.randomUUID();
        newIds.add(strokeID);
        const cloned: Stroke = {
          ...s,
          strokeID,
          locked: false,
          points: s.points.map((p) => ({ x: p.x + 24, y: p.y + 24 })),
          zIndex: Date.now() + clones.length
        };
        clones.push(cloned);
        socket?.emit("upsert-item", {
          strokeID: cloned.strokeID,
          points: cloned.points,
          style: cloned.style,
          kind: cloned.kind || "stroke",
          text: cloned.text,
          box: cloned.box
        });
      }
      if (clones.length > 0) {
        strokesRef.current = [...strokesRef.current, ...clones];
        selectedIdsRef.current = newIds;
        onItemsChange?.(strokesRef.current);
        scheduleRedraw();
      }
      return;
    }

    const patches: Partial<Stroke>[] = [];
    if (action === "group") {
      const groupId = crypto.randomUUID();
      strokesRef.current = strokesRef.current.map((s) => {
        if (!selectedIdsRef.current.has(s.strokeID)) return s;
        patches.push({ strokeID: s.strokeID, groupId });
        return { ...s, groupId };
      });
    } else if (action === "ungroup") {
      strokesRef.current = strokesRef.current.map((s) => {
        if (!selectedIdsRef.current.has(s.strokeID)) return s;
        patches.push({ strokeID: s.strokeID, groupId: "" });
        return { ...s, groupId: undefined };
      });
    } else if (action === "lock") {
      const allLocked = strokesRef.current
        .filter((s) => selectedIdsRef.current.has(s.strokeID))
        .every((s) => s.locked);
      const nextLocked = !allLocked;
      strokesRef.current = strokesRef.current.map((s) => {
        if (!selectedIdsRef.current.has(s.strokeID)) return s;
        patches.push({ strokeID: s.strokeID, locked: nextLocked });
        return { ...s, locked: nextLocked };
      });
    } else if (action === "flip-h" || action === "flip-v") {
      const sel = strokesRef.current.filter((s) => selectedIdsRef.current.has(s.strokeID) && !s.locked);
      if (sel.length === 0) return;
      const box = mergeBoxes(sel.map(getStrokeBounds));
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      strokesRef.current = strokesRef.current.map((s) => {
        if (!selectedIdsRef.current.has(s.strokeID) || s.locked) return s;
        if (s.kind === "note" || s.kind === "text" || s.kind === "frame") {
          const b = getStrokeBounds(s);
          const bw = b.maxX - b.minX;
          const bh = b.maxY - b.minY;
          const nextOrigin =
            action === "flip-h"
              ? { x: 2 * cx - (b.minX + bw), y: b.minY }
              : { x: b.minX, y: 2 * cy - (b.minY + bh) };
          patches.push({ strokeID: s.strokeID, points: [nextOrigin] });
          return { ...s, points: [nextOrigin] };
        }
        const nextPts = s.points.map((p) =>
          action === "flip-h" ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y }
        );
        patches.push({ strokeID: s.strokeID, points: nextPts });
        return { ...s, points: nextPts };
      });
    } else if (action === "align-left" || action === "align-center" || action === "align-right") {
      const sel = strokesRef.current.filter((s) => selectedIdsRef.current.has(s.strokeID) && !s.locked);
      if (sel.length < 2) return;
      const total = mergeBoxes(sel.map(getStrokeBounds));
      const targetCx = (total.minX + total.maxX) / 2;
      strokesRef.current = strokesRef.current.map((s) => {
        if (!selectedIdsRef.current.has(s.strokeID) || s.locked) return s;
        const b = getStrokeBounds(s);
        const dx =
          action === "align-left"
            ? total.minX - b.minX
            : action === "align-right"
              ? total.maxX - b.maxX
              : targetCx - (b.minX + b.maxX) / 2;
        const nextPts = s.points.map((p) => ({ x: p.x + dx, y: p.y }));
        patches.push({ strokeID: s.strokeID, points: nextPts });
        return { ...s, points: nextPts };
      });
    }

    if (patches.length > 0) {
      socket?.emit("patch-strokes", { patches });
      scheduleRedraw();
    }
  }

  function notifySelectedKind() {
    if (!onSelectedKindChange) return;
    if (selectedIdsRef.current.size !== 1) {
      onSelectedKindChange(null);
      return;
    }
    const id = Array.from(selectedIdsRef.current)[0];
    const item = strokesRef.current.find((s) => s.strokeID === id);
    onSelectedKindChange(item?.kind || "stroke");
  }

  function commitEditingItem(item: NonNullable<typeof editingItem>) {
    setEditingItem(null);
    const trimmed = item.text.trim();
    if (!trimmed || !socket) return;

    const style: StrokeStyle = {
      color: item.color,
      width: item.width,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      fontStyle: item.fontStyle,
      textAlign: item.textAlign,
      fontFamily: item.fontFamily,
      lineHeight: item.lineHeight,
      ...(item.textBg ? { textBg: item.textBg } : {}),
      ...(item.fill ? { fill: item.fill } : {})
    };

    const existing = strokesRef.current.find((s) => s.strokeID === item.strokeID);
    const optimistic: Stroke = {
      strokeID: item.strokeID,
      author: existing?.author || { id: "me", name: "Me" },
      points: [item.worldPos],
      style,
      zIndex: existing?.zIndex || Date.now(),
      kind: item.kind,
      text: trimmed,
      ...(item.box ? { box: item.box } : {})
    };

    strokesRef.current = [...strokesRef.current.filter((s) => s.strokeID !== item.strokeID), optimistic];
    onItemsChange?.(strokesRef.current);
    socket.emit("upsert-item", {
      strokeID: item.strokeID,
      points: [item.worldPos],
      style,
      kind: item.kind,
      text: trimmed,
      box: item.box
    });
    scheduleRedraw();
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (tool.type !== "pointer") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const sorted = [...strokesRef.current].sort((a, b) => a.zIndex - b.zIndex);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const s = sorted[i];
      if ((s.kind === "text" || s.kind === "note") && isPointNearStroke(point, s, 8 / cameraRef.current.zoom)) {
        editingOpenedAtRef.current = performance.now();
        setEditingItem({
          strokeID: s.strokeID,
          kind: s.kind,
          worldPos: s.points[0] || point,
          text: s.text || "",
          color: s.style.color,
          fill: s.style.fill,
          textBg: s.style.textBg,
          width: s.style.width,
          fontSize: s.style.fontSize || (s.kind === "note" ? 15 : Math.max(16, (s.style.width || 4) * 3)),
          fontWeight: s.style.fontWeight || "normal",
          fontStyle: s.style.fontStyle || "normal",
          textAlign: s.style.textAlign || "left",
          fontFamily: s.style.fontFamily || "sans",
          lineHeight: s.style.lineHeight || 1.35,
          box: s.box
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      if (s.style.variant === "shape" && s.points.length >= 4 && isPointInsideBounds(point, getStrokeBounds(s))) {
        const b = getStrokeBounds(s);
        const pad = 12;
        const w = Math.max(80, Math.round(b.maxX - b.minX - pad * 2));
        const h = Math.max(40, Math.round(b.maxY - b.minY - pad * 2));
        editingOpenedAtRef.current = performance.now();
        setEditingItem({
          strokeID: crypto.randomUUID(),
          kind: "text",
          worldPos: { x: b.minX + pad, y: b.minY + pad },
          text: "",
          color: s.style.color,
          width: s.style.width,
          fontSize: tool.fontSize || 18,
          fontWeight: tool.fontWeight || "normal",
          fontStyle: tool.fontStyle || "normal",
          textAlign: "center",
          fontFamily: tool.fontFamily || "hand",
          lineHeight: tool.lineHeight || 1.35,
          box: { width: w, height: h }
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
    }
  }

  /* ── Drawing ── */

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const cam = cameraRef.current;

    const isDark = darkModeRef.current;

    // Reset transform and clear
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = isDark ? "#0f172a" : "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);

    // Draw infinite grid BEFORE applying camera transform (grid in screen space)
    if (showGridRef.current) {
      drawInfiniteGrid(context, rect.width, rect.height, cam, toolRef.current.color, isDark);
    }

    // Apply camera transform for strokes
    context.save();
    context.translate(cam.x, cam.y);
    context.scale(cam.zoom, cam.zoom);

    strokesRef.current.sort((a, b) => a.zIndex - b.zIndex).forEach((stroke) => drawItem(context, stroke));
    remoteActiveRef.current.forEach((stroke) => drawStroke(context, stroke.points, stroke.style));
    
    if (localStrokeRef.current) {
      const activeType = toolRef.current.type;
      if (activeType === "pencil" || activeType === "highlighter") {
        drawStroke(context, localStrokeRef.current.points, localStrokeRef.current.style);
      } else if (shapeStartRef.current && shapeCurrentRef.current) {
        const points = generateShapePoints(activeType, shapeStartRef.current, shapeCurrentRef.current);
        drawStroke(context, points, localStrokeRef.current.style);
      }
    }

    // Selection bounding boxes + resize handles for single text/note
    if (selectedIdsRef.current.size > 0) {
      context.save();
      context.strokeStyle = "#0d9488";
      context.fillStyle = "#ffffff";
      context.lineWidth = 1.5 / cam.zoom;
      context.setLineDash([5 / cam.zoom, 4 / cam.zoom]);

      for (const stroke of strokesRef.current) {
        if (!selectedIdsRef.current.has(stroke.strokeID)) continue;
        const b = getStrokeBounds(stroke);
        const pad = 6 / cam.zoom;
        context.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);

        if (selectedIdsRef.current.size === 1 && (stroke.kind === "note" || stroke.kind === "text")) {
          context.setLineDash([]);
          const hs = 8 / cam.zoom;
          const midY = (b.minY + b.maxY) / 2;
          const handles = [
            { x: b.minX - pad, y: b.minY - pad },
            { x: b.maxX + pad, y: b.minY - pad },
            { x: b.minX - pad, y: b.maxY + pad },
            { x: b.maxX + pad, y: b.maxY + pad },
            { x: b.minX - pad, y: midY },
            { x: b.maxX + pad, y: midY }
          ];
          for (const c of handles) {
            context.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
            context.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
          }
        }
      }
      context.restore();
    }

    // Box creation preview (text / note)
    if (boxCreateRef.current) {
      const box = normalizeBox(boxCreateRef.current.start, boxCreateRef.current.current);
      context.save();
      context.fillStyle = boxCreateRef.current.kind === "note" ? "rgba(254, 240, 138, 0.45)" : "rgba(13, 148, 136, 0.06)";
      context.strokeStyle = "#0d9488";
      context.lineWidth = 1.5 / cam.zoom;
      context.setLineDash([5 / cam.zoom, 4 / cam.zoom]);
      context.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      context.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      context.restore();
    }

    // Marquee selection rectangle
    if (selectionBoxRef.current) {
      const box = normalizeBox(selectionBoxRef.current.start, selectionBoxRef.current.current);
      context.save();
      context.fillStyle = "rgba(13, 148, 136, 0.08)";
      context.strokeStyle = "#0d9488";
      context.lineWidth = 1 / cam.zoom;
      context.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      context.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      context.restore();
    }

    // Smart snapping alignment guide lines
    if (snapLinesRef.current.length > 0) {
      context.save();
      context.strokeStyle = "#14b8a6";
      context.lineWidth = 1 / cam.zoom;
      context.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
      context.beginPath();
      for (const line of snapLinesRef.current) {
        if (line.x !== undefined) {
          context.moveTo(line.x, -10000);
          context.lineTo(line.x, 10000);
        }
        if (line.y !== undefined) {
          context.moveTo(-10000, line.y);
          context.lineTo(10000, line.y);
        }
      }
      context.stroke();
      context.restore();
    }

    // Laser pointer trails (ephemeral)
    const now = performance.now();
    let hasActiveLaser = false;
    laserTrailsRef.current.forEach((trail, id) => {
      const fresh = trail.filter((p) => now - p.t < 800);
      if (fresh.length === 0) {
        laserTrailsRef.current.delete(id);
        return;
      }
      laserTrailsRef.current.set(id, fresh);
      hasActiveLaser = true;
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      for (let i = 1; i < fresh.length; i++) {
        if (fresh[i].t - fresh[i - 1].t > 120) continue;
        const age = (now - fresh[i].t) / 800;
        context.strokeStyle = fresh[i].color;
        context.globalAlpha = Math.max(0, 1 - age) * 0.85;
        context.lineWidth = (4 * (1 - age * 0.5)) / cam.zoom;
        context.beginPath();
        context.moveTo(fresh[i - 1].x, fresh[i - 1].y);
        context.lineTo(fresh[i].x, fresh[i].y);
        context.stroke();
      }
      const tip = fresh[fresh.length - 1];
      const tipAge = (now - tip.t) / 800;
      context.globalAlpha = Math.max(0, 1 - tipAge) * 0.35;
      context.fillStyle = tip.color;
      context.beginPath();
      context.arc(tip.x, tip.y, 10 / cam.zoom, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = Math.max(0, 1 - tipAge);
      context.beginPath();
      context.arc(tip.x, tip.y, 4.5 / cam.zoom, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });

    context.restore();
    drawMinimap();
    if (hasActiveLaser) {
      scheduleRedraw();
    }
  }

  function drawMinimap() {
    const mm = minimapRef.current;
    const canvas = canvasRef.current;
    if (!mm || !canvas) return;
    const ctx = mm.getContext("2d");
    if (!ctx) return;
    const w = mm.width;
    const h = mm.height;
    const isDark = darkModeRef.current;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(0, 0, w, h);

    if (strokesRef.current.length === 0) return;
    const allBox = mergeBoxes(strokesRef.current.map(getStrokeBounds));
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const viewBox: Box = {
      minX: -cam.x / cam.zoom,
      minY: -cam.y / cam.zoom,
      maxX: (rect.width - cam.x) / cam.zoom,
      maxY: (rect.height - cam.y) / cam.zoom
    };
    const worldBox = mergeBoxes([allBox, viewBox]);
    const ww = Math.max(200, worldBox.maxX - worldBox.minX);
    const wh = Math.max(200, worldBox.maxY - worldBox.minY);
    const scale = Math.min((w - 16) / ww, (h - 16) / wh);
    const ox = (w - ww * scale) / 2 - worldBox.minX * scale;
    const oy = (h - wh * scale) / 2 - worldBox.minY * scale;

    ctx.save();
    for (const s of strokesRef.current) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.style.color === "#111827" && isDark ? "#f8fafc" : s.style.color;
      ctx.lineWidth = Math.max(1, s.style.width * scale);
      ctx.beginPath();
      if (s.kind === "note" || s.kind === "frame") {
        const b = getStrokeBounds(s);
        ctx.strokeRect(b.minX * scale + ox, b.minY * scale + oy, (b.maxX - b.minX) * scale, (b.maxY - b.minY) * scale);
      } else {
        ctx.moveTo(s.points[0].x * scale + ox, s.points[0].y * scale + oy);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x * scale + ox, s.points[i].y * scale + oy);
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#0d9488";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(13, 148, 136, 0.12)";
    const vx = viewBox.minX * scale + ox;
    const vy = viewBox.minY * scale + oy;
    const vw = (viewBox.maxX - viewBox.minX) * scale;
    const vh = (viewBox.maxY - viewBox.minY) * scale;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.restore();
  }

  function drawItem(context: CanvasRenderingContext2D, item: Stroke) {
    if (item.kind === "frame") {
      const origin = item.points[0];
      if (!origin) return;
      const w = item.box?.width || 360;
      const h = item.box?.height || 240;
      const isDark = darkModeRef.current;
      context.save();
      context.fillStyle = isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 0.55)";
      context.strokeStyle = "#0d9488";
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.beginPath();
      context.roundRect(origin.x, origin.y, w, h, 12);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      if (item.text) {
        context.fillStyle = "#0d9488";
        context.font = "600 12px system-ui, -apple-system, sans-serif";
        context.textBaseline = "bottom";
        context.fillText(item.text, origin.x + 8, origin.y - 6);
      }
      context.restore();
      return;
    }

    if (item.kind === "note") {
      const origin = item.points[0];
      if (!origin) return;
      const w = item.box?.width || 200;
      const h = item.box?.height || 150;
      const fontSize = item.style.fontSize || 15;
      const fontWeight = item.style.fontWeight || "normal";
      const fontStyle = item.style.fontStyle || "normal";
      const textAlign = item.style.textAlign || "left";
      const fontCss = fontFamilyCss(item.style.fontFamily);
      const lh = item.style.lineHeight || 1.35;
      context.save();
      context.shadowColor = "rgba(15, 23, 42, 0.12)";
      context.shadowBlur = 12;
      context.shadowOffsetY = 4;
      context.fillStyle = item.style.fill || "#fef08a";
      context.beginPath();
      context.roundRect(origin.x, origin.y, w, h, 10);
      context.fill();
      context.shadowColor = "transparent";
      context.strokeStyle = "rgba(15, 23, 42, 0.12)";
      context.lineWidth = 1;
      context.stroke();

      if (item.text) {
        context.fillStyle = item.style.color || "#1e293b";
        context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontCss}`;
        context.textBaseline = "top";
        context.textAlign = textAlign;
        const textX = textAlign === "center" ? origin.x + w / 2 : textAlign === "right" ? origin.x + w - 12 : origin.x + 12;
        drawWrappedText(context, item.text, textX, origin.y + 12, w - 24, fontSize * lh);
      }
      context.restore();
      return;
    }

    if (item.kind === "text") {
      const origin = item.points[0];
      if (!origin || !item.text) return;
      const fontSize = item.style.fontSize || Math.max(16, (item.style.width || 4) * 3);
      const fontWeight = item.style.fontWeight || "normal";
      const fontStyle = item.style.fontStyle || "normal";
      const textAlign = item.style.textAlign || "left";
      const fontCss = fontFamilyCss(item.style.fontFamily);
      const lh = item.style.lineHeight || 1.35;
      context.save();
      context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontCss}`;

      if (item.style.textBg) {
        const b = getStrokeBounds(item);
        const pad = 6;
        context.fillStyle = item.style.textBg;
        context.beginPath();
        context.roundRect(b.minX - pad, b.minY - pad / 2, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad, 6);
        context.fill();
      }

      context.fillStyle = item.style.color;
      context.textBaseline = "top";
      context.textAlign = textAlign;
      if (item.box?.width) {
        const textX = textAlign === "center" ? origin.x + item.box.width / 2 : textAlign === "right" ? origin.x + item.box.width : origin.x;
        drawWrappedText(context, item.text, textX, origin.y, item.box.width, fontSize * lh);
      } else {
        const lines = item.text.split("\n");
        lines.forEach((line, idx) => {
          context.fillText(line, origin.x, origin.y + idx * fontSize * lh);
        });
      }
      context.restore();
      return;
    }

    drawStroke(context, item.points, item.style);
  }

  function drawStroke(context: CanvasRenderingContext2D, points: Point[], style: StrokeStyle) {
    if (points.length === 0) return;

    const resolvedColor = style.color === "#111827" && darkModeRef.current ? "#f8fafc" : style.color;

    if (style.variant === "shape" && (style.roughness ?? 0) > 0 && points.length >= 2 && canvasRef.current) {
      context.save();
      context.globalAlpha = style.opacity ?? 1;
      const rc = rough.canvas(canvasRef.current);
      const tuplePts = points.map((p): [number, number] => [p.x, p.y]);
      const isClosed = points.length >= 4 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 2;
      const opts = {
        stroke: resolvedColor,
        strokeWidth: style.width,
        roughness: style.roughness ?? 1.5,
        seed: style.seed ?? 1,
        ...(style.dashed ? { strokeLineDash: [8, 6] } : {}),
        ...(style.fill && isClosed ? { fill: style.fill, fillStyle: "hachure", hachureGap: Math.max(6, style.width * 2) } : {})
      };
      if (isClosed) {
        rc.polygon(tuplePts, opts);
      } else {
        rc.linearPath(tuplePts, opts);
      }
      context.restore();
      return;
    }

    context.save();
    context.strokeStyle = resolvedColor;
    context.lineWidth = style.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = style.opacity ?? 1;
    if (style.dashed) {
      context.setLineDash([8, 6]);
    }

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    if (style.variant !== "shape" && points.length > 2) {
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        context.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const last = points[points.length - 1];
      context.lineTo(last.x, last.y);
    } else {
      for (let i = 1; i < points.length; i++) {
        context.lineTo(points[i].x, points[i].y);
      }
    }

    if (style.fill && points.length >= 3) {
      context.closePath();
      context.fillStyle = style.fill;
      context.fill();
    }

    context.stroke();
    context.restore();
  }

  /* ── Zoom controls ── */

  const setZoom = useCallback((newZoom: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

    // Zoom toward center
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const wx = (cx - cam.x) / cam.zoom;
    const wy = (cy - cam.y) / cam.zoom;

    cam.zoom = clamped;
    cam.x = cx - wx * clamped;
    cam.y = cy - wy * clamped;

    setZoomDisplay(Math.round(clamped * 100));
    onZoomChange?.(clamped, setZoom, resetView);
    scheduleRedraw();
  }, [onZoomChange, scheduleRedraw]);

  const resetView = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
    setZoomDisplay(100);
    onZoomChange?.(1, setZoom, resetView);
    scheduleRedraw();
  }, [onZoomChange, scheduleRedraw]);

  useEffect(() => {
    onZoomChange?.(cameraRef.current.zoom, setZoom, resetView);
  }, [onZoomChange, setZoom, resetView]);

  const cursorColor = tool.type === "eraser" ? "#64748b" : tool.color;
  const cursorStyle =
    tool.type === "hand" || isPanningRef.current || spaceDownRef.current
      ? "grab"
      : tool.type === "pointer"
        ? "default"
        : buildCrosshairCursor(cursorColor);

  return (
    <section ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor: cursorStyle }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={emitCursorLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      />

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-40 w-48 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md"
          style={{ left: Math.min(contextMenu.x, (wrapRef.current?.clientWidth || 600) - 200), top: Math.min(contextMenu.y, (wrapRef.current?.clientHeight || 500) - 260) }}
          onClick={() => setContextMenu(null)}
        >
          {[
            { label: "Duplicate", shortcut: "Ctrl+D", action: "duplicate" },
            { label: "Group", shortcut: "Ctrl+G", action: "group" },
            { label: "Ungroup", shortcut: "Ctrl+⇧+G", action: "ungroup" },
            { label: "Lock / Unlock", shortcut: "Ctrl+⇧+L", action: "lock" },
            { label: "Bring to Front", shortcut: "]", action: "bring-front" },
            { label: "Send to Back", shortcut: "[", action: "send-back" },
            { label: "Flip Horizontal", action: "flip-h" },
            { label: "Flip Vertical", action: "flip-v" },
            { label: "Align Left", action: "align-left" },
            { label: "Align Center", action: "align-center" },
            { label: "Zoom to Fit", action: "zoom-fit" },
            { label: "Delete", shortcut: "Del", action: "delete", danger: true }
          ].map((item) => (
            <button
              key={item.action}
              onClick={() => runCanvasAction(item.action)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
                item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-teal-50 hover:text-teal-800"
              }`}
            >
              <span>{item.label}</span>
              {item.shortcut ? <span className="text-[10px] text-slate-400">{item.shortcut}</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Minimap */}
      {showMinimap && (
        <div className="absolute bottom-24 right-6 z-30 overflow-hidden rounded-xl border border-slate-200/80 shadow-lg">
          <canvas
            ref={minimapRef}
            width={168}
            height={112}
            className="block cursor-pointer"
            title="Click to jump"
            onClick={(e) => {
              const mm = minimapRef.current;
              const canvas = canvasRef.current;
              if (!mm || !canvas || strokesRef.current.length === 0) return;
              const mmRect = mm.getBoundingClientRect();
              const mx = e.clientX - mmRect.left;
              const my = e.clientY - mmRect.top;
              const rect = canvas.getBoundingClientRect();
              const cam = cameraRef.current;
              const allBox = mergeBoxes(strokesRef.current.map(getStrokeBounds));
              const viewBox: Box = {
                minX: -cam.x / cam.zoom,
                minY: -cam.y / cam.zoom,
                maxX: (rect.width - cam.x) / cam.zoom,
                maxY: (rect.height - cam.y) / cam.zoom
              };
              const worldBox = mergeBoxes([allBox, viewBox]);
              const ww = Math.max(200, worldBox.maxX - worldBox.minX);
              const wh = Math.max(200, worldBox.maxY - worldBox.minY);
              const scale = Math.min((mm.width - 16) / ww, (mm.height - 16) / wh);
              const ox = (mm.width - ww * scale) / 2 - worldBox.minX * scale;
              const oy = (mm.height - wh * scale) / 2 - worldBox.minY * scale;
              const wx = (mx - ox) / scale;
              const wy = (my - oy) / scale;
              cam.x = rect.width / 2 - wx * cam.zoom;
              cam.y = rect.height / 2 - wy * cam.zoom;
              scheduleRedraw();
            }}
          />
        </div>
      )}

      {editingItem ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={editingItem.text}
          onChange={(e) => setEditingItem((prev) => (prev ? { ...prev, text: e.target.value } : null))}
          onBlur={() => {
            if (performance.now() - editingOpenedAtRef.current < 150) {
              requestAnimationFrame(() => textareaRef.current?.focus());
              return;
            }
            commitEditingItem(editingItem);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditingItem(null);
            } else if (e.key === "Enter" && e.shiftKey) {
              const target = e.currentTarget;
              const start = target.selectionStart ?? editingItem.text.length;
              const before = editingItem.text.slice(0, start);
              const currentLine = before.split("\n").pop() || "";
              const bulletMatch = currentLine.match(/^(\s*(?:- |• |\d+\. ))/);
              if (bulletMatch) {
                e.preventDefault();
                const prefix = bulletMatch[1];
                const numMatch = prefix.match(/^(\s*)(\d+)\. $/);
                const nextPrefix = numMatch ? `${numMatch[1]}${Number(numMatch[2]) + 1}. ` : prefix;
                const after = editingItem.text.slice(start);
                const nextText = `${before}\n${nextPrefix}${after}`;
                setEditingItem((prev) => (prev ? { ...prev, text: nextText } : null));
                requestAnimationFrame(() => {
                  const pos = start + 1 + nextPrefix.length;
                  target.setSelectionRange(pos, pos);
                });
              }
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEditingItem(editingItem);
            }
          }}
          placeholder={editingItem.kind === "note" ? "Write a note..." : "Type text..."}
          className={
            editingItem.kind === "note"
              ? "absolute z-20 resize rounded-lg border border-slate-300/80 p-3 shadow-lg outline-none focus:ring-2 focus:ring-teal-500"
              : "absolute z-20 min-w-[140px] resize rounded border border-teal-500 bg-white/80 px-1.5 py-0.5 outline-none"
          }
          style={{
            left: editingItem.worldPos.x * cameraRef.current.zoom + cameraRef.current.x,
            top: editingItem.worldPos.y * cameraRef.current.zoom + cameraRef.current.y,
            width: editingItem.box?.width ? editingItem.box.width * cameraRef.current.zoom : undefined,
            height: editingItem.box?.height ? editingItem.box.height * cameraRef.current.zoom : undefined,
            backgroundColor: editingItem.kind === "note" ? editingItem.fill || "#fef08a" : editingItem.textBg || undefined,
            color: editingItem.color,
            fontSize: editingItem.fontSize * cameraRef.current.zoom,
            fontWeight: editingItem.fontWeight,
            fontStyle: editingItem.fontStyle,
            textAlign: editingItem.textAlign,
            fontFamily: fontFamilyCss(editingItem.fontFamily),
            lineHeight: editingItem.lineHeight
          }}
        />
      ) : null}

      {/* Remote cursors – transformed to screen space */}
      {Array.from(cursors.values()).map((cursor) => {
        const cam = cameraRef.current;
        const sx = cursor.x * cam.zoom + cam.x;
        const sy = cursor.y * cam.zoom + cam.y;
        return (
          <div
            key={cursor.user.id}
            className="pointer-events-none absolute left-0 top-0 rounded-md px-2 py-1 text-xs font-semibold text-white shadow"
            style={{ transform: `translate(${sx}px, ${sy}px)`, backgroundColor: cursor.user.color }}
          >
            {cursor.user.name}
          </div>
        );
      })}


    </section>
  );
}

/* ── Helpers ── */

function generateShapePoints(type: string, start: Point, end: Point): Point[] {
  const points: Point[] = [];
  
  if (type === "line") {
    points.push(start, end);
  } else if (type === "rectangle") {
    points.push(
      start,
      { x: end.x, y: start.y },
      end,
      { x: start.x, y: end.y },
      start
    );
  } else if (type === "diamond") {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    points.push(
      { x: cx, y: start.y },
      { x: end.x, y: cy },
      { x: cx, y: end.y },
      { x: start.x, y: cy },
      { x: cx, y: start.y }
    );
  } else if (type === "ellipse") {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle)
      });
    }
  } else if (type === "arrow") {
    points.push(start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = 20;
    // Draw back one side of the arrowhead, then to tip, then other side
    points.push(
      {
        x: end.x - headLen * Math.cos(angle - Math.PI / 6),
        y: end.y - headLen * Math.sin(angle - Math.PI / 6)
      },
      end,
      {
        x: end.x - headLen * Math.cos(angle + Math.PI / 6),
        y: end.y - headLen * Math.sin(angle + Math.PI / 6)
      }
    );
  }
  
  return points;
}

function drawInfiniteGrid(ctx: CanvasRenderingContext2D, width: number, height: number, cam: Camera, crosshairColor: string, isDark = false) {
  // 3-tier adaptive grid: minor (32px), medium (160px), major (800px) in world-space
  const levels = isDark
    ? [
        { worldSize: 32,  color: [51, 65, 85],  maxOpacity: 0.45 },
        { worldSize: 160, color: [71, 85, 105], maxOpacity: 0.55 },
        { worldSize: 800, color: [100, 116, 139], maxOpacity: 0.40 },
      ]
    : [
        { worldSize: 32,  color: [226, 232, 240], maxOpacity: 0.45 },
        { worldSize: 160, color: [203, 213, 225], maxOpacity: 0.55 },
        { worldSize: 800, color: [148, 163, 184], maxOpacity: 0.40 },
      ];

  for (const level of levels) {
    const screenStep = level.worldSize * cam.zoom;

    // Skip if lines would be too dense (< 6px apart) or too sparse (> 4000px)
    if (screenStep < 6 || screenStep > 4000) continue;

    // Fade in when lines are 6–24px apart, full opacity above 24px
    const fadeT = Math.min(1, Math.max(0, (screenStep - 6) / 18));
    const opacity = fadeT * level.maxOpacity;
    if (opacity < 0.02) continue;

    const offsetX = cam.x % screenStep;
    const offsetY = cam.y % screenStep;

    ctx.strokeStyle = `rgba(${level.color[0]}, ${level.color[1]}, ${level.color[2]}, ${opacity})`;
    ctx.lineWidth = screenStep > 100 ? 1 : 0.5;

    ctx.beginPath();
    for (let x = offsetX; x < width; x += screenStep) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = offsetY; y < height; y += screenStep) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  // Origin crosshair — draw a subtle axis marker at (0,0) for orientation
  const ox = cam.x;
  const oy = cam.y;
  if (ox > -2 && ox < width + 2 && oy > -2 && oy < height + 2) {
    ctx.save();
    ctx.strokeStyle = crosshairColor;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox, Math.max(0, oy - 20));
    ctx.lineTo(ox, Math.min(height, oy + 20));
    ctx.moveTo(Math.max(0, ox - 20), oy);
    ctx.lineTo(Math.min(width, ox + 20), oy);
    ctx.stroke();
    ctx.restore();
  }
}

function strokesToSvg(strokes: Stroke[], canvas: HTMLCanvasElement | null) {
  const rect = canvas?.getBoundingClientRect();
  const fallbackWidth = Math.max(1, Math.round(rect?.width || 1200));
  const fallbackHeight = Math.max(1, Math.round(rect?.height || 800));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const b = getStrokeBounds(stroke);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  const padding = 24;
  const hasStrokes = Number.isFinite(minX) && Number.isFinite(minY);
  const vbX = hasStrokes ? Math.floor(minX - padding) : 0;
  const vbY = hasStrokes ? Math.floor(minY - padding) : 0;
  const vbWidth = hasStrokes ? Math.max(1, Math.ceil(maxX - minX + padding * 2)) : fallbackWidth;
  const vbHeight = hasStrokes ? Math.max(1, Math.ceil(maxY - minY + padding * 2)) : fallbackHeight;

  const paths = [...strokes]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((stroke) => {
      if (stroke.kind === "frame") {
        const origin = stroke.points[0] || { x: 0, y: 0 };
        const w = stroke.box?.width || 360;
        const h = stroke.box?.height || 240;
        const label = escapeXml(stroke.text || "");
        return `<g><rect x="${origin.x}" y="${origin.y}" width="${w}" height="${h}" rx="12" fill="rgba(241,245,249,0.55)" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="6 4"/>${label ? `<text x="${origin.x + 8}" y="${origin.y - 6}" fill="#0d9488" font-size="12" font-weight="600" font-family="system-ui, sans-serif">${label}</text>` : ""}</g>`;
      }
      if (stroke.kind === "note") {
        const origin = stroke.points[0] || { x: 0, y: 0 };
        const w = stroke.box?.width || 200;
        const h = stroke.box?.height || 150;
        const fontSize = stroke.style.fontSize || 15;
        const fontWeight = stroke.style.fontWeight || "normal";
        const fontStyle = stroke.style.fontStyle || "normal";
        const noteFill = stroke.style.fill || "#fef08a";
        const text = escapeXml(stroke.text || "");
        return `<g><rect x="${origin.x}" y="${origin.y}" width="${w}" height="${h}" rx="10" fill="${noteFill}" stroke="rgba(15,23,42,0.12)"/><text x="${origin.x + 12}" y="${origin.y + 12 + fontSize}" fill="${stroke.style.color || "#1e293b"}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-family="system-ui, sans-serif">${text}</text></g>`;
      }
      if (stroke.kind === "text") {
        const origin = stroke.points[0] || { x: 0, y: 0 };
        const fontSize = stroke.style.fontSize || Math.max(16, (stroke.style.width || 4) * 3);
        const fontWeight = stroke.style.fontWeight || "normal";
        const fontStyle = stroke.style.fontStyle || "normal";
        const text = escapeXml(stroke.text || "");
        return `<text x="${origin.x}" y="${origin.y + fontSize}" fill="${stroke.style.color}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-family="system-ui, sans-serif">${text}</text>`;
      }
      const points = stroke.points.map((point) => `${point.x},${point.y}`).join(" ");
      const fill = stroke.style.fill || "none";
      const opacity = stroke.style.opacity ?? 1;
      const dash = stroke.style.dashed ? ` stroke-dasharray="8 6"` : "";
      return `<polyline points="${points}" fill="${fill}" stroke="${stroke.style.color}" stroke-width="${stroke.style.width}" stroke-opacity="${opacity}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vbWidth}" height="${vbHeight}" viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}"><rect x="${vbX}" y="${vbY}" width="${vbWidth}" height="${vbHeight}" fill="#ffffff"/>${paths}</svg>`;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function normalizeBox(a: Point, b: Point): Box {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
}

function boxesIntersect(a: Box, b: Box) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function isPointInsideBounds(pt: Point, b: Box) {
  return pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY;
}

function hitTestResizeHandle(
  pt: Point,
  stroke: Stroke,
  tolerance: number
): "nw" | "ne" | "sw" | "se" | "w" | "e" | null {
  const b = getStrokeBounds(stroke);
  const midY = (b.minY + b.maxY) / 2;
  const handles: { name: "nw" | "ne" | "sw" | "se" | "w" | "e"; x: number; y: number }[] = [
    { name: "nw", x: b.minX, y: b.minY },
    { name: "ne", x: b.maxX, y: b.minY },
    { name: "sw", x: b.minX, y: b.maxY },
    { name: "se", x: b.maxX, y: b.maxY },
    { name: "w", x: b.minX, y: midY },
    { name: "e", x: b.maxX, y: midY }
  ];
  const rSq = (tolerance * 1.4) ** 2;
  for (const h of handles) {
    if ((pt.x - h.x) ** 2 + (pt.y - h.y) ** 2 <= rSq) return h.name;
  }
  return null;
}

function fontFamilyCss(family?: "sans" | "hand" | "mono" | "serif") {
  if (family === "hand") return '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
  if (family === "mono") return 'ui-monospace, "Cascadia Code", "Fira Code", monospace';
  if (family === "serif") return 'Georgia, Cambria, "Times New Roman", serif';
  return "system-ui, -apple-system, sans-serif";
}

function mergeBoxes(boxes: Box[]): Box {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY))
  };
}

function getStrokeBounds(stroke: Stroke): Box {
  if (stroke.kind === "frame") {
    const origin = stroke.points[0] || { x: 0, y: 0 };
    return {
      minX: origin.x,
      minY: origin.y,
      maxX: origin.x + (stroke.box?.width || 360),
      maxY: origin.y + (stroke.box?.height || 240)
    };
  }
  if (stroke.kind === "note") {
    const origin = stroke.points[0] || { x: 0, y: 0 };
    return {
      minX: origin.x,
      minY: origin.y,
      maxX: origin.x + (stroke.box?.width || 200),
      maxY: origin.y + (stroke.box?.height || 150)
    };
  }
  if (stroke.kind === "text") {
    const origin = stroke.points[0] || { x: 0, y: 0 };
    const fontSize = stroke.style.fontSize || Math.max(16, (stroke.style.width || 4) * 3);
    const lines = (stroke.text || "").split("\n");
    const maxChars = Math.max(1, ...lines.map((l) => l.length));
    return {
      minX: origin.x,
      minY: origin.y,
      maxX: origin.x + (stroke.box?.width || maxChars * fontSize * 0.6),
      maxY: origin.y + (stroke.box?.height || lines.length * fontSize * 1.3)
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pad = (stroke.style.width || 4) / 2;
  for (const p of stroke.points) {
    if (p.x - pad < minX) minX = p.x - pad;
    if (p.y - pad < minY) minY = p.y - pad;
    if (p.x + pad > maxX) maxX = p.x + pad;
    if (p.y + pad > maxY) maxY = p.y + pad;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function isPointNearStroke(pt: Point, stroke: Stroke, tolerance: number) {
  if (stroke.kind === "note" || stroke.kind === "text" || stroke.kind === "frame") {
    const b = getStrokeBounds(stroke);
    return pt.x >= b.minX - tolerance && pt.x <= b.maxX + tolerance && pt.y >= b.minY - tolerance && pt.y <= b.maxY + tolerance;
  }
  const r = tolerance + (stroke.style.width || 4) / 2;
  const rSq = r * r;
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    return (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2 <= rSq;
  }
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const v = stroke.points[i];
    const w = stroke.points[i + 1];
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    let distSq: number;
    if (l2 === 0) {
      distSq = (pt.x - v.x) ** 2 + (pt.y - v.y) ** 2;
    } else {
      const t = Math.max(0, Math.min(1, ((pt.x - v.x) * (w.x - v.x) + (pt.y - v.y) * (w.y - v.y)) / l2));
      distSq = (pt.x - (v.x + t * (w.x - v.x))) ** 2 + (pt.y - (v.y + t * (w.y - v.y))) ** 2;
    }
    if (distSq <= rSq) return true;
  }
  return false;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  let cursorY = y;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        context.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = test;
      }
    }
    context.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hexWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isLightHex(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.82;
}

function buildCrosshairCursor(color: string) {
  const halo = isLightHex(color) ? "#0f172a" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round"><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="${halo}" stroke-width="3.5"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="${color}" stroke-width="1.75"/><circle cx="12" cy="12" r="1.5" fill="${color}" stroke="${halo}" stroke-width="0.75"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}

function download(filename: string, href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}
