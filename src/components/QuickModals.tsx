"use client";

import { useMemo, useState } from "react";
import { Search, Command, Keyboard, X } from "lucide-react";
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

