"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  Circle,
  CircleDot,
  Clipboard,
  Diamond,
  Download,
  Eraser,
  Eye,
  FileCode2,
  FileJson,
  Frame,
  Grid3X3,
  Hand,
  HelpCircle,
  Highlighter,
  Italic,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  MoreHorizontal,
  MousePointer2,
  Move,
  PaintBucket,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Square,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Upload
} from "lucide-react";
import Link from "next/link";
import { ActiveUsers } from "./ActiveUsers";
import { ChatSidebar } from "./ChatSidebar";
import { CommandPalette, SearchModal, ShortcutsModal, type CommandItem } from "./QuickModals";
import { StreamCanvas } from "./StreamCanvas";
import type { ChatMessage, Stroke, User } from "@/types/whiteboard";

type RoomState = {
  snapshot: { image: string; strokeCount: number } | null;
  strokes: Stroke[];
  messages: ChatMessage[];
};

export function WhiteboardRoom({ roomID }: { roomID: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [tool, setTool] = useState({
    type: "pencil",
    color: "#111827",
    width: 4,
    fill: false,
    dashed: false,
    fontSize: 18,
    fontWeight: "normal" as "normal" | "bold",
    fontStyle: "normal" as "normal" | "italic",
    textAlign: "left" as "left" | "center" | "right",
    fontFamily: "sans" as "sans" | "hand" | "mono" | "serif",
    lineHeight: 1.35,
    textBg: false,
    roughness: 1.5,
    noteColor: "#fef08a"
  });
  const [selectedItemKind, setSelectedItemKind] = useState<"stroke" | "text" | "note" | "frame" | null>(null);
  const [copied, setCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [boardItems, setBoardItems] = useState<Stroke[]>([]);
  const user = useMemo(readUser, []);

  // Zoom state lifted from StreamCanvas
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomFns, setZoomFns] = useState<{
    setZoom: (z: number) => void;
    resetView: () => void;
  } | null>(null);

  const handleZoomChange = useCallback(
    (zoom: number, setZoom: (z: number) => void, resetView: () => void) => {
      setZoomPercent(Math.round(zoom * 100));
      setZoomFns({ setZoom, resetView });
    },
    []
  );

  useEffect(() => {
    const nextSocket = io({ transports: ["websocket"] });
    setSocket(nextSocket);

    nextSocket.emit("join-room", { roomID, user });
    nextSocket.on("room-state", (state: RoomState) => {
      setRoomState(state);
      setMessages(state.messages);
    });
    nextSocket.on("users-update", setUsers);
    nextSocket.on("chat-message", (message: ChatMessage) => {
      setMessages((current) => [...current, message].slice(-120));
    });
    nextSocket.on("room-error", (message: string) => alert(message));

    return () => {
      nextSocket.disconnect();
    };
  }, [roomID, user]);

  // Keyboard shortcuts for tools and undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          socket?.emit("undo-request");
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          socket?.emit("redo-request");
        } else if (key === "f") {
          e.preventDefault();
          setSearchOpen((v) => !v);
        } else if (key === "k") {
          e.preventDefault();
          setPaletteOpen((v) => !v);
        }
        return;
      }

      if (e.altKey) return;
      if (e.key === "?") {
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
        return;
      }

      setTool((current) => {
        const next = { ...current };
        if (key === "v") next.type = "pointer";
        else if (key === "h") next.type = "hand";
        else if (key === "p") next.type = "pencil";
        else if (key === "m") next.type = "highlighter";
        else if (key === "e") next.type = "eraser";
        else if (key === "r") next.type = "rectangle";
        else if (key === "d") next.type = "diamond";
        else if (key === "c") next.type = "ellipse";
        else if (key === "a") next.type = "arrow";
        else if (key === "l") next.type = "line";
        else if (key === "t") next.type = "text";
        else if (key === "n") next.type = "note";
        else if (key === "f") next.type = "frame";
        else if (key === "k") next.type = "laser";
        return next.type !== current.type ? next : current;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [socket, zenMode]);

  function sendMessage(body: string) {
    socket?.emit("chat-message", { body });
  }

  function copyCode() {
    navigator.clipboard.writeText(roomID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const colors = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
  const noteColors = ["#fef08a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fed7aa"];
  const fontSizes = [14, 18, 24, 32, 48];
  const isShapeTool = ["rectangle", "diamond", "ellipse", "arrow", "line"].includes(tool.type);
  const isDrawTool = ["pencil", "highlighter"].includes(tool.type);
  const isTextOrNote =
    tool.type === "text" ||
    tool.type === "note" ||
    (tool.type === "pointer" && (selectedItemKind === "text" || selectedItemKind === "note"));
  const showPropsPanel = isShapeTool || isDrawTool || isTextOrNote;

  function updateTextTool(patch: Partial<typeof tool>) {
    setTool((t) => ({ ...t, ...patch }));
    window.dispatchEvent(new CustomEvent("whiteboard-text-style", { detail: patch }));
  }

  function triggerAction(action: string) {
    window.dispatchEvent(new CustomEvent("whiteboard-action", { detail: { action } }));
  }

  function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((raw) => {
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : parsed?.items;
        if (Array.isArray(items)) {
          window.dispatchEvent(new CustomEvent("whiteboard-import-json", { detail: { items } }));
        }
      } catch {
        alert("Invalid JSON whiteboard file");
      }
    });
    e.target.value = "";
  }

  const commands: CommandItem[] = [
    { id: "fit", label: "Zoom to Fit All Content", category: "View", run: () => triggerAction("zoom-fit") },
    { id: "dark", label: darkMode ? "Switch to Light Canvas" : "Switch to Dark Canvas", category: "Theme", run: () => setDarkMode((v) => !v) },
    { id: "grid", label: showGrid ? "Hide Grid" : "Show Grid", category: "View", run: () => setShowGrid((v) => !v) },
    { id: "snap", label: snapEnabled ? "Disable Smart Snapping" : "Enable Smart Snapping", category: "Canvas", run: () => setSnapEnabled((v) => !v) },
    { id: "minimap", label: showMinimap ? "Hide Minimap" : "Show Minimap", category: "View", run: () => setShowMinimap((v) => !v) },
    { id: "zen", label: zenMode ? "Exit Zen Mode" : "Enter Zen Mode", category: "View", run: () => setZenMode((v) => !v) },
    { id: "viewmode", label: viewMode ? "Exit Read-Only View Mode" : "Enter Read-Only View Mode", category: "Mode", run: () => setViewMode((v) => !v) },
    { id: "search", label: "Search Text & Notes", shortcut: "Ctrl+F", category: "Navigate", run: () => setSearchOpen(true) },
    { id: "group", label: "Group Selected", shortcut: "Ctrl+G", category: "Edit", run: () => triggerAction("group") },
    { id: "ungroup", label: "Ungroup Selected", shortcut: "Ctrl+Shift+G", category: "Edit", run: () => triggerAction("ungroup") },
    { id: "lock", label: "Lock / Unlock Selected", shortcut: "Ctrl+Shift+L", category: "Edit", run: () => triggerAction("lock") },
    { id: "png", label: "Export PNG", category: "Export", run: () => window.dispatchEvent(new Event("whiteboard-export-png")) },
    { id: "svg", label: "Export SVG", category: "Export", run: () => window.dispatchEvent(new Event("whiteboard-export-svg")) },
    { id: "json", label: "Save Board as JSON", category: "Export", run: () => window.dispatchEvent(new Event("whiteboard-export-json")) },
    { id: "help", label: "Keyboard Shortcuts", shortcut: "?", category: "Help", run: () => setHelpOpen(true) }
  ];

  return (
    <main className={`flex h-screen min-h-[620px] flex-col overflow-hidden ${darkMode ? "bg-slate-950" : "bg-[#eef2f7]"}`}>
      {/* ── Minimal header ── */}
      {!zenMode && (
        <header className={`flex h-12 shrink-0 items-center justify-between border-b px-3 md:px-5 z-30 backdrop-blur-md ${darkMode ? "border-slate-800 bg-slate-900/95 text-slate-100" : "border-slate-200/60 bg-white/95"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              aria-label="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <div className="min-w-0 pr-1">
              <div className="flex items-center gap-1.5">
                <span className="hidden rounded-md bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-600 sm:inline">
                  Stream-Sync
                </span>
                <h1 className={`truncate text-sm font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>{roomID}</h1>
                <button
                  onClick={copyCode}
                  className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-slate-100/80 text-slate-400 hover:text-teal-600"
                  title="Copy room code"
                >
                  <Clipboard className={`h-3 w-3 transition-colors ${copied ? "text-teal-600" : ""}`} />
                </button>
              </div>
            </div>
            <div className={`hidden h-6 w-px md:block ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />
            <ActiveUsers users={users} />
          </div>

          {/* Utility & Export controls */}
          <div className="flex items-center gap-1">
            <HeaderIconBtn active={false} dark={darkMode} onClick={() => setSearchOpen(true)} title="Search (Ctrl+F)">
              <Search className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={false} dark={darkMode} onClick={() => setPaletteOpen(true)} title="Command Palette (Ctrl+K)">
              <Sparkles className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={showGrid} dark={darkMode} onClick={() => setShowGrid((v) => !v)} title="Toggle Grid">
              <Grid3X3 className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={snapEnabled} dark={darkMode} onClick={() => setSnapEnabled((v) => !v)} title="Toggle Smart Snapping">
              <Magnet className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={showMinimap} dark={darkMode} onClick={() => setShowMinimap((v) => !v)} title="Toggle Minimap">
              <MapIcon className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={viewMode} dark={darkMode} onClick={() => setViewMode((v) => !v)} title="Read-Only View Mode">
              <Eye className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={darkMode} dark={darkMode} onClick={() => setDarkMode((v) => !v)} title="Toggle Dark Mode">
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </HeaderIconBtn>
            <HeaderIconBtn active={false} dark={darkMode} onClick={() => setZenMode(true)} title="Zen Mode">
              <Maximize2 className="h-3.5 w-3.5" />
            </HeaderIconBtn>
            <HeaderIconBtn active={false} dark={darkMode} onClick={() => setHelpOpen(true)} title="Shortcuts (?)">
              <HelpCircle className="h-3.5 w-3.5" />
            </HeaderIconBtn>

            <div className={`mx-1 hidden h-5 w-px sm:block ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />

            <label
              className={`hidden h-8 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition sm:flex ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              title="Import JSON"
            >
              <Upload className="h-3.5 w-3.5" />
              <input type="file" accept=".json,application/json" onChange={handleJsonImport} className="hidden" />
            </label>
            <button
              className={`hidden h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition sm:flex ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              onClick={() => window.dispatchEvent(new Event("whiteboard-export-json"))}
              title="Export JSON"
            >
              <FileJson className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white transition hover:bg-teal-700 shadow-sm"
              onClick={() => window.dispatchEvent(new Event("whiteboard-export-png"))}
              title="Export PNG"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden md:inline">PNG</span>
            </button>
            <button
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${darkMode ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              onClick={() => window.dispatchEvent(new Event("whiteboard-export-svg"))}
              title="Export SVG"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">SVG</span>
            </button>
          </div>
        </header>
      )}

      {/* ── Canvas area (full remaining space) ── */}
      <div className="relative min-h-0 flex-1">
        <StreamCanvas
          socket={socket}
          initialState={roomState}
          tool={tool}
          roomID={roomID}
          darkMode={darkMode}
          showGrid={showGrid}
          snapEnabled={snapEnabled}
          showMinimap={showMinimap && !zenMode}
          viewMode={viewMode}
          onZoomChange={handleZoomChange}
          onSelectedKindChange={setSelectedItemKind}
          onItemsChange={setBoardItems}
        />

        {zenMode && (
          <button
            onClick={() => setZenMode(false)}
            className="absolute right-4 top-4 z-40 flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-md transition hover:bg-white"
          >
            <Minimize2 className="h-3.5 w-3.5 text-teal-600" />
            Exit Zen (Esc)
          </button>
        )}

        {viewMode && !zenMode && (
          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-teal-500/30 bg-teal-50/95 px-4 py-1.5 text-xs font-semibold text-teal-700 shadow-md backdrop-blur-md">
            Read-only View Mode — Pan &amp; Zoom only
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── Stream-Sync top-center tool dock ──            */}
        {/* ═══════════════════════════════════════════════════ */}
        {!zenMode && !viewMode && (
          <div className={`absolute left-1/2 top-3 z-30 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl border p-1 shadow-lg backdrop-blur-md ${darkMode ? "border-slate-700/80 bg-slate-900/95" : "border-slate-200/90 bg-white/95"}`}>
            <ExcalidrawBtn active={tool.type === "hand"} onClick={() => setTool(t => ({ ...t, type: "hand" }))} title="Hand / Pan (H)" shortcut="H">
              <Hand className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "pointer"} onClick={() => setTool(t => ({ ...t, type: "pointer" }))} title="Selection (V)" shortcut="V">
              <MousePointer2 className="h-4 w-4" />
            </ExcalidrawBtn>

            <div className={`mx-1 h-6 w-px shrink-0 ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />

            <ExcalidrawBtn active={tool.type === "rectangle"} onClick={() => setTool(t => ({ ...t, type: "rectangle" }))} title="Rectangle (R)" shortcut="R">
              <Square className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "diamond"} onClick={() => setTool(t => ({ ...t, type: "diamond" }))} title="Diamond (D)" shortcut="D">
              <Diamond className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "ellipse"} onClick={() => setTool(t => ({ ...t, type: "ellipse" }))} title="Ellipse (C)" shortcut="C">
              <Circle className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "arrow"} onClick={() => setTool(t => ({ ...t, type: "arrow" }))} title="Arrow (A)" shortcut="A">
              <ArrowRight className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "line"} onClick={() => setTool(t => ({ ...t, type: "line" }))} title="Line (L)" shortcut="L">
              <Minus className="h-4 w-4" />
            </ExcalidrawBtn>

            <div className={`mx-1 h-6 w-px shrink-0 ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />

            <ExcalidrawBtn active={tool.type === "pencil"} onClick={() => setTool(t => ({ ...t, type: "pencil" }))} title="Draw (P)" shortcut="P">
              <Pencil className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "highlighter"} onClick={() => setTool(t => ({ ...t, type: "highlighter", width: Math.max(t.width, 16) }))} title="Highlighter (M)" shortcut="M">
              <Highlighter className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "text"} onClick={() => setTool(t => ({ ...t, type: "text" }))} title="Text (T)" shortcut="T">
              <Type className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "note"} onClick={() => setTool(t => ({ ...t, type: "note" }))} title="Sticky Note (N)" shortcut="N">
              <StickyNote className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "frame"} onClick={() => setTool(t => ({ ...t, type: "frame" }))} title="Frame (F)" shortcut="F">
              <Frame className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "eraser"} onClick={() => setTool(t => ({ ...t, type: "eraser" }))} title="Eraser (E)" shortcut="E">
              <Eraser className="h-4 w-4" />
            </ExcalidrawBtn>
            <ExcalidrawBtn active={tool.type === "laser"} onClick={() => setTool(t => ({ ...t, type: "laser" }))} title="Laser Pointer (K)" shortcut="K">
              <CircleDot className="h-4 w-4" />
            </ExcalidrawBtn>

            <div className={`mx-1 h-6 w-px shrink-0 ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />

            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
              onClick={() => {
                if (confirm("Clear the entire canvas?")) {
                  socket?.emit("clear-canvas");
                }
              }}
              title="Clear Canvas"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── Excalidraw-style left properties panel ──      */}
        {/* ═══════════════════════════════════════════════════ */}
        {showPropsPanel && !zenMode && !viewMode && (
          <aside
            onMouseDown={(e) => {
              const tag = (e.target as HTMLElement).tagName;
              if (tag !== "SELECT" && tag !== "INPUT") e.preventDefault();
            }}
            className="absolute left-3 top-16 z-30 flex max-h-[calc(100vh-10rem)] w-52 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-md"
          >
            {/* Stroke Color */}
            {tool.type !== "note" && selectedItemKind !== "note" && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">Stroke</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateTextTool({ color: c })}
                      className={`h-5 w-5 rounded-md border transition hover:scale-110 ${
                        tool.color === c ? "border-indigo-600 ring-2 ring-indigo-200 scale-105" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  <label
                    className="relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-bold text-slate-400 transition hover:border-slate-400"
                    title="Custom color"
                  >
                    +
                    <input
                      type="color"
                      value={tool.color}
                      onChange={(e) => updateTextTool({ color: e.target.value })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Background / Sticky Note Color */}
            {(isShapeTool && !["arrow", "line"].includes(tool.type)) && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">Background</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTool((t) => ({ ...t, fill: false }))}
                    className={`flex h-7 w-9 items-center justify-center rounded-md border text-[11px] font-medium transition ${
                      !tool.fill ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                    title="Transparent"
                  >
                    None
                  </button>
                  <button
                    onClick={() => setTool((t) => ({ ...t, fill: true }))}
                    className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition ${
                      tool.fill ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    title="Hachure Fill"
                  >
                    <PaintBucket className="h-3.5 w-3.5" />
                    Fill
                  </button>
                </div>
              </div>
            )}

            {(tool.type === "note" || selectedItemKind === "note") && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">Note Color</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {noteColors.map((nc) => (
                    <button
                      key={nc}
                      onClick={() => updateTextTool({ noteColor: nc })}
                      className={`h-5 w-5 rounded-md border transition hover:scale-110 ${
                        tool.noteColor === nc ? "border-indigo-600 ring-2 ring-indigo-200 scale-105" : "border-slate-300"
                      }`}
                      style={{ backgroundColor: nc }}
                      title={nc}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stroke Width (Draw & Shapes) */}
            {(isDrawTool || isShapeTool) && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">Stroke width</p>
                <div className="grid grid-cols-4 gap-1">
                  {[4, 8, 16, 24].map((w) => (
                    <button
                      key={w}
                      onClick={() => setTool((t) => ({ ...t, width: w }))}
                      className={`flex h-7 items-center justify-center rounded-md border transition ${
                        tool.width === w ? "border-indigo-500 bg-[#e0dfff]" : "border-slate-200 hover:bg-slate-50"
                      }`}
                      title={`${w}px`}
                    >
                      <div
                        className="w-4 rounded-full bg-slate-800"
                        style={{ height: Math.max(2, w / 4) }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stroke Style & Sloppiness (Shapes) */}
            {isShapeTool && (
              <>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">Stroke style</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => setTool((t) => ({ ...t, dashed: false }))}
                      className={`flex h-7 items-center justify-center rounded-md border text-[11px] font-medium transition ${
                        !tool.dashed ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      onClick={() => setTool((t) => ({ ...t, dashed: true }))}
                      className={`flex h-7 items-center justify-center rounded-md border text-[11px] font-medium transition ${
                        tool.dashed ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Dashed
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">Sloppiness</p>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: "Clean", val: 0 },
                      { label: "Artist", val: 1.5 },
                      { label: "Sketch", val: 2.8 }
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setTool((t) => ({ ...t, roughness: opt.val }))}
                        className={`flex h-7 items-center justify-center rounded-md border text-[11px] font-medium transition ${
                          tool.roughness === opt.val
                            ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Text & Note Typography */}
            {isTextOrNote && (
              <>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">Font family</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(["hand", "sans", "mono", "serif"] as const).map((ff) => (
                      <button
                        key={ff}
                        onClick={() => updateTextTool({ fontFamily: ff })}
                        className={`h-7 rounded-md border text-[11px] font-medium capitalize transition ${
                          tool.fontFamily === ff
                            ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {ff}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">Font size</p>
                  <div className="grid grid-cols-5 gap-1">
                    {fontSizes.map((sz) => (
                      <button
                        key={sz}
                        onClick={() => updateTextTool({ fontSize: sz })}
                        className={`h-7 rounded-md border text-[11px] font-medium transition ${
                          tool.fontSize === sz
                            ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">Style & Align</p>
                  <div className="flex items-center gap-1">
                    <ToolBtn
                      active={tool.fontWeight === "bold"}
                      onClick={() => updateTextTool({ fontWeight: tool.fontWeight === "bold" ? "normal" : "bold" })}
                      title="Bold"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn
                      active={tool.fontStyle === "italic"}
                      onClick={() => updateTextTool({ fontStyle: tool.fontStyle === "italic" ? "normal" : "italic" })}
                      title="Italic"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn active={tool.textAlign === "left"} onClick={() => updateTextTool({ textAlign: "left" })} title="Align Left">
                      <AlignLeft className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn active={tool.textAlign === "center"} onClick={() => updateTextTool({ textAlign: "center" })} title="Align Center">
                      <AlignCenter className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn active={tool.textAlign === "right"} onClick={() => updateTextTool({ textAlign: "right" })} title="Align Right">
                      <AlignRight className="h-3.5 w-3.5" />
                    </ToolBtn>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <select
                    value={tool.lineHeight}
                    onChange={(e) => updateTextTool({ lineHeight: Number(e.target.value) })}
                    className="h-7 flex-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-700 outline-none"
                    title="Line height"
                  >
                    <option value={1.15}>1.15× Compact</option>
                    <option value={1.35}>1.35× Normal</option>
                    <option value={1.6}>1.6× Relaxed</option>
                  </select>
                  {tool.type !== "note" && selectedItemKind !== "note" && (
                    <button
                      onClick={() => updateTextTool({ textBg: !tool.textBg })}
                      className={`h-7 rounded-md border px-2 text-[11px] font-medium transition ${
                        tool.textBg
                          ? "border-indigo-500 bg-[#e0dfff] text-[#4f46e5]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      title="Background pill"
                    >
                      Pill
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── Excalidraw-style bottom-left zoom & undo/redo ── */}
        {/* ═══════════════════════════════════════════════════ */}
        <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-lg backdrop-blur-md">
            <button
              onClick={() => zoomFns?.setZoom((zoomPercent / 100) / 1.25)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              title="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => zoomFns?.resetView()}
              className="min-w-[3.25rem] rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              title="Reset zoom to 100%"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={() => zoomFns?.setZoom((zoomPercent / 100) * 1.25)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              title="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-lg backdrop-blur-md">
            <button
              onClick={() => socket?.emit("undo-request")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => socket?.emit("redo-request")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating chat (renders its own toggle button + panel) */}
      {!zenMode && <ChatSidebar messages={messages} onSend={sendMessage} me={user.name} />}

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        items={boardItems}
        onSelect={(stroke) => window.dispatchEvent(new CustomEvent("whiteboard-focus-point", { detail: stroke }))}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}

function HeaderIconBtn({
  active,
  dark,
  onClick,
  title,
  children
}: {
  active: boolean;
  dark: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
        active
          ? "bg-teal-600/15 text-teal-600 ring-1 ring-teal-500/30"
          : dark
            ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Stream-Sync top dock button with shortcut badge ── */
function ExcalidrawBtn({
  active,
  onClick,
  title,
  shortcut,
  children
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  shortcut: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
        active ? "bg-teal-50 text-teal-700 ring-1 ring-teal-500/30" : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-900"
      }`}
    >
      {children}
      <span className="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-semibold opacity-60">
        {shortcut}
      </span>
    </button>
  );
}

/* ── Toolbar button component ── */
function ToolBtn({
  active,
  onClick,
  title,
  children
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
        active
          ? "border-teal-500 bg-teal-50 text-teal-700"
          : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function readUser() {
  if (typeof window === "undefined") return { id: "server", name: "Guest", color: "#2563eb" };

  try {
    const saved = JSON.parse(localStorage.getItem("whiteboard-user") || "{}");
    const user = {
      id: saved.id || crypto.randomUUID(),
      name: saved.name || "",
      color: saved.color || "#2563eb"
    };
    localStorage.setItem("whiteboard-user", JSON.stringify(user));
    return user;
  } catch {
    const user = { id: crypto.randomUUID(), name: "Guest", color: "#2563eb" };
    localStorage.setItem("whiteboard-user", JSON.stringify(user));
    return user;
  }
}
