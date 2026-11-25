"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search, Command, Keyboard, Link2, X, GitBranch } from "lucide-react";
import type { Stroke } from "@/types/whiteboard";

export type CommandItem = {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  run: () => void;
};

export function SearchModal({
  open,
  onClose,
  items,
  onSelect
}: {
  open: boolean;
  onClose: () => void;
  items: Stroke[];
  onSelect: (stroke: Stroke) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searchable = items.filter((s) => (s.kind === "text" || s.kind === "note" || s.kind === "frame") && s.text);
    if (!q) return searchable.slice(0, 25);
    return searchable.filter((s) => s.text?.toLowerCase().includes(q)).slice(0, 25);
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 pt-20 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-teal-600" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "Enter" && matches[0]) {
                onSelect(matches[0]);
                onClose();
              }
            }}
            placeholder="Search text, sticky notes, frames..."
            className="min-w-0 flex-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No matching text or notes found</p>
          ) : (
            matches.map((item) => (
              <button
                key={item.strokeID}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-teal-50"
              >
                <span className="truncate text-sm font-medium text-slate-800">{item.text}</span>
                <span className="ml-3 shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                  {item.kind}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function CommandPalette({
  open,
  onClose,
  commands
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  }, [commands, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 pt-20 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
          <Command className="h-4 w-4 text-teal-600" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "Enter" && filtered[0]) {
                filtered[0].run();
                onClose();
              }
            }}
            placeholder="Type a command or tool..."
            className="min-w-0 flex-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => {
                cmd.run();
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-teal-50"
            >
              <div>
                <span className="text-sm font-medium text-slate-800">{cmd.label}</span>
                <span className="ml-2 text-[11px] text-slate-400">{cmd.category}</span>
              </div>
              {cmd.shortcut ? (
                <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {cmd.shortcut}
                </kbd>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const groups = [
    {
      title: "Tools",
      items: [
        ["H / Space", "Hand / Pan"],
        ["V", "Select & Move"],
        ["R / D / C", "Rectangle / Diamond / Ellipse"],
        ["A / L", "Arrow / Line"],
        ["P / M", "Pencil / Highlighter"],
        ["T / N / F", "Text / Sticky Note / Frame"],
        ["E / K", "Eraser / Laser Pointer"]
      ]
    },
    {
      title: "Editing & Canvas",
      items: [
        ["Ctrl + Z / Y", "Undo / Redo"],
        ["Ctrl + D", "Duplicate selection"],
        ["Ctrl + G / Shift+G", "Group / Ungroup"],
        ["Ctrl + Shift + L", "Lock / Unlock"],
        ["[ / ]", "Send to Back / Bring to Front"],
        ["Ctrl + F / Ctrl + K", "Search / Command Palette"],
        ["Delete", "Delete selected"]
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-teal-700">{g.title}</h3>
              <div className="space-y-2">
                {g.items.map(([k, desc]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{desc}</span>
                    <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                      {k}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MermaidModal({
  open,
  onClose,
  onInsert
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (items: Stroke[]) => void;
}) {
  const [source, setSource] = useState("flowchart LR\n  A[Start] --> B{Valid?}\n  B --> C[Save Board]\n  B --> D(Retry)");

  if (!open) return null;

  function generate() {
    const lines = source
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("flowchart") && !l.startsWith("graph") && !l.startsWith("%%"));

    const nodes = new Map<string, { id: string; label: string; shape: "rect" | "diamond" | "ellipse" }>();
    const edges: { from: string; to: string }[] = [];

    const parseNode = (raw: string) => {
      const mDiamond = raw.match(/^([A-Za-z0-9_]+)\{(.+?)\}$/);
      if (mDiamond) return { id: mDiamond[1], label: mDiamond[2], shape: "diamond" as const };
      const mRound = raw.match(/^([A-Za-z0-9_]+)\((.+?)\)$/);
      if (mRound) return { id: mRound[1], label: mRound[2], shape: "ellipse" as const };
      const mRect = raw.match(/^([A-Za-z0-9_]+)\[(.+?)\]$/);
      if (mRect) return { id: mRect[1], label: mRect[2], shape: "rect" as const };
      const id = raw.replace(/[^A-Za-z0-9_]/g, "") || "Node";
      return { id, label: raw, shape: "rect" as const };
    };

    for (const line of lines) {
      const parts = line.split(/-->|---/).map((p) => p.trim());
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          const a = parseNode(parts[i]);
          const b = parseNode(parts[i + 1]);
          if (!nodes.has(a.id)) nodes.set(a.id, a);
          if (!nodes.has(b.id)) nodes.set(b.id, b);
          edges.push({ from: a.id, to: b.id });
        }
      }
    }

    const items: Stroke[] = [];
    const nodeBoxes = new Map<string, { strokeID: string; cx: number; cy: number; w: number; h: number }>();
    let col = 0;
    let row = 0;
    const baseZ = Date.now();

    nodes.forEach((n) => {
      const w = 150;
      const h = 76;
      const x = 120 + col * 220;
      const y = 140 + row * 140;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const shapeId = crypto.randomUUID();

      const pts =
        n.shape === "diamond"
          ? [
              { x: cx, y },
              { x: x + w, y: cy },
              { x: cx, y: y + h },
              { x, y: cy },
              { x: cx, y }
            ]
          : n.shape === "ellipse"
            ? Array.from({ length: 33 }, (_, i) => {
                const a = (i / 32) * Math.PI * 2;
                return { x: cx + (w / 2) * Math.cos(a), y: cy + (h / 2) * Math.sin(a) };
              })
            : [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h },
                { x, y }
              ];

      items.push({
        strokeID: shapeId,
        author: { id: "me", name: "Me" },
        points: pts,
        style: { color: "#0f766e", width: 2, variant: "shape", fill: "rgba(20, 184, 166, 0.14)", roughness: 1.4, seed: Math.floor(Math.random() * 1e6) },
        zIndex: baseZ + items.length
      });
      items.push({
        strokeID: crypto.randomUUID(),
        author: { id: "me", name: "Me" },
        points: [{ x: x + 10, y: cy - 12 }],
        style: { color: "#0f172a", width: 4, fontSize: 15, fontWeight: "bold", textAlign: "center", fontFamily: "hand" },
        zIndex: baseZ + items.length,
        kind: "text",
        text: n.label,
        box: { width: w - 20, height: 32 }
      });

      nodeBoxes.set(n.id, { strokeID: shapeId, cx, cy, w, h });
      col += 1;
      if (col >= 3) {
        col = 0;
        row += 1;
      }
    });

    for (const e of edges) {
      const a = nodeBoxes.get(e.from);
      const b = nodeBoxes.get(e.to);
      if (!a || !b) continue;
      const angle = Math.atan2(b.cy - a.cy, b.cx - a.cx);
      const start = { x: a.cx + Math.cos(angle) * (a.w / 2), y: a.cy + Math.sin(angle) * (a.h / 2) };
      const end = { x: b.cx - Math.cos(angle) * (b.w / 2), y: b.cy - Math.sin(angle) * (b.h / 2) };
      const headLen = 16;
      items.push({
        strokeID: crypto.randomUUID(),
        author: { id: "me", name: "Me" },
        points: [
          start,
          end,
          { x: end.x - headLen * Math.cos(angle - Math.PI / 6), y: end.y - headLen * Math.sin(angle - Math.PI / 6) },
          end,
          { x: end.x - headLen * Math.cos(angle + Math.PI / 6), y: end.y - headLen * Math.sin(angle + Math.PI / 6) }
        ],
        style: { color: "#334155", width: 2, variant: "shape", roughness: 1.2, seed: Math.floor(Math.random() * 1e6) },
        zIndex: baseZ + items.length,
        startBinding: { elementId: a.strokeID },
        endBinding: { elementId: b.strokeID }
      });
    }

    if (items.length > 0) onInsert(items);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Mermaid Flowchart to Board</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none focus:border-teal-500"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={generate} className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
              Insert Diagram
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel,
  danger = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-600"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {cancelLabel !== "" && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {cancelLabel || "Cancel"}
            </button>
          )}
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LinkModal({
  open,
  initialUrl,
  onSave,
  onClose
}: {
  open: boolean;
  initialUrl: string;
  onSave: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    if (open) setUrl(initialUrl);
  }, [open, initialUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Element Link</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "Enter") {
              onSave(url.trim());
              onClose();
            }
          }}
          placeholder="https://example.com"
          className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          {initialUrl ? (
            <button
              onClick={() => {
                onSave("");
                onClose();
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              Remove link
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(url.trim());
                onClose();
              }}
              className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
