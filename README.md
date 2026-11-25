---
title: Stream-Sync Whiteboard
emoji: 🎨
colorFrom: teal
colorTo: slate
sdk: docker
pinned: false
app_port: 7860
---

# 🎨 Stream-Sync Whiteboard

A high-performance, real-time collaborative whiteboard built for fast brainstorming, architecture diagramming, and team design sessions.

![Project Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Tech Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20Socket.io%20%7C%20MongoDB-blue)

## 🚀 Key Features

### 🌌 Infinite Canvas Engine
* **Pan & Zoom:** Smooth cursor-centered mouse-wheel zoom (`10%–500%`), middle-mouse/hand-tool panning, `Space`-drag panning, and **Zoom to Fit**.
* **Adaptive Grid & Minimap:** 3-tier dynamic grid (minor, medium, major) with toggleable grid visibility and a clickable corner **Minimap**.
* **Dark Mode & Zen Mode:** Toggleable dark canvas with automatic ink/fill contrast adaptation, distraction-free **Zen Mode** (`Esc` to exit), and read-only **View Mode**.

### 🛠 Drawing, Shapes & Diagramming
* **Freehand & Highlighter:** Smooth quadratic-Bezier ink rendering, semi-transparent highlighter, and a live **Color Eye Dropper** to sample colors directly from the canvas.
* **Sketchy & Clean Shapes:** Rectangles, Diamonds, Ellipses, Arrows, and Lines with RoughJS hand-drawn sloppiness presets (`Clean`, `Artist`, `Sketch`), dashed lines, and hachure fills.
* **Smart Arrow Binding:** Arrows snap to and stay connected to shapes when you move them.
* **Mermaid Flowchart Import:** Convert Mermaid flowchart syntax directly into editable shapes, labels, and bound arrows.
* **Text, Sticky Notes & Frames:** Rich typography (`Hand`, `Sans`, `Mono`, `Serif`, sizes `14–48px`, Bold/Italic, alignment, line height, background pill), corner font scaling, side-handle text reflow, auto-lists (`- `, `1. `), bound text inside shapes (double-click any shape), pastel sticky notes, and labeled **Frames**.
* **Images & Hyperlinks:** Paste (`Ctrl+V`) or drag-and-drop images onto the board, and attach clickable URLs to any element (`Ctrl+Click` to open).

### 🧩 Selection & Layout Controls
* **Transform & Organize:** Marquee & `Shift`-click multi-select, corner resize, **Element Rotation** (`Shift` snaps to `15°`), **Grouping (`Ctrl+G`)**, **Locking (`Ctrl+Shift+L`)**, **Z-order (`[` / `]`)**, Flip Horizontal/Vertical, Align, and Distribute spacing.
* **Smart Snapping:** Live alignment guide lines when dragging near other elements' edges or centers.
* **Object Eraser:** Hit-tested object eraser synced across all collaborators.

### 👥 Real-Time Collaboration & Productivity
* **Live Cursors & Spotlight Follow:** Color-coded cursors and click-to-follow collaborator viewports.
* **Ephemeral Laser Pointer:** Temporary fading laser trails for live walkthroughs.
* **Collaborative Chat:** Floating chat drawer with unread badges and persistent room history.
* **Search & Command Palette:** `Ctrl+F` to jump to any text, sticky note, or frame; `Ctrl+K` for quick commands; `?` for keyboard shortcuts.
* **Room Management & Persistence:** 6-digit room codes backed by MongoDB, plus **Delete Room** to permanently remove a room and its data.

### 💾 Export & Sharing
* **PNG, SVG & JSON:** Export high-res PNG, full-board SVG, or save/import portable `.json` board files.

---

## 🎹 Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `V` | **Select / Move** |
| `H` / `Space` | **Hand / Hold to Pan** |
| `R` / `D` / `C` | **Rectangle / Diamond / Ellipse** |
| `A` / `L` | **Arrow / Line** |
| `P` / `M` | **Pencil / Highlighter** |
| `T` / `N` / `F` | **Text / Sticky Note / Frame** |
| `E` / `K` | **Eraser / Laser Pointer** |
| `Ctrl + Z` / `Ctrl + Y` | **Undo / Redo** |
| `Ctrl + D` / `Delete` | **Duplicate / Delete Selected** |
| `Ctrl + G` / `Ctrl + Shift + G` | **Group / Ungroup** |
| `Ctrl + Shift + L` | **Lock / Unlock** |
| `[` / `]` | **Send to Back / Bring to Front** |
| `Ctrl + F` / `Ctrl + K` | **Search / Command Palette** |
| `?` | **Keyboard Shortcuts Modal** |

---

## 🛠 Tech Stack

* **Frontend:** Next.js 14, Tailwind CSS, Lucide React
* **Graphics:** HTML5 Canvas API + RoughJS
* **Real-time:** Socket.io
* **Backend:** Node.js (Custom HTTP + Socket.io Server)
* **Database:** MongoDB (Mongoose)

---

## 🏁 Getting Started

### Prerequisites
* Node.js 18+
* MongoDB connection string (MongoDB Atlas or local MongoDB)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/piyushrav1/whiteboard-main.git
   cd whiteboard-main
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env.local` file in the root directory:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open in Browser:**
   Navigate to `http://localhost:3000`

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
