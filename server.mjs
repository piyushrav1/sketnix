import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { connectMongo } from "./src/server/db.js";
import { Room, Stroke, Message, Snapshot } from "./src/server/models.js";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = Number(process.env.PORT || 3000);

const activeStrokes = new Map();
const activeUsersByRoom = new Map();

function strokeKey(roomID, strokeID) {
  return `${roomID}:${strokeID}`;
}

function roomUsers(roomID) {
  if (!activeUsersByRoom.has(roomID)) activeUsersByRoom.set(roomID, new Map());
  return activeUsersByRoom.get(roomID);
}

function publicUsers(roomID) {
  return [...roomUsers(roomID).values()].map(({ id, name, color }) => ({ id, name, color }));
}

async function getRoomState(roomID) {
  const [snapshot, strokes, messages] = await Promise.all([
    Snapshot.findOne({ roomID }).sort({ createdAt: -1 }).lean(),
    Stroke.find({ roomID, isDeleted: false }).sort({ zIndex: 1 }).lean(),
    Message.find({ roomID }).sort({ createdAt: -1 }).limit(80).lean()
  ]);

  return {
    snapshot: snapshot ? { image: snapshot.image, strokeCount: snapshot.strokeCount } : null,
    strokes: strokes.map((stroke) => ({
      strokeID: stroke.strokeID,
      author: stroke.author,
      points: stroke.points,
      style: stroke.style,
      zIndex: stroke.zIndex,
      ...(stroke.kind ? { kind: stroke.kind } : {}),
      ...(stroke.text !== undefined ? { text: stroke.text } : {}),
      ...(stroke.box ? { box: stroke.box } : {}),
      ...(stroke.groupId ? { groupId: stroke.groupId } : {}),
      ...(stroke.locked ? { locked: stroke.locked } : {})
    })),
    messages: messages.reverse().map((message) => ({
      id: message._id.toString(),
      author: message.author,
      body: message.body,
      createdAt: message.createdAt
    }))
  };
}

await app.prepare();
await connectMongo();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 8e6
});

io.on("connection", (socket) => {
  socket.on("join-room", async ({ roomID, user }) => {
    if (!/^\d{6}$/.test(roomID || "")) return socket.emit("room-error", "Invalid room code");

    const room = await Room.findOne({ code: roomID });
    if (!room) return socket.emit("room-error", "Room not found");

    const member = {
      id: user?.id || socket.id,
      name: user?.name?.trim()?.slice(0, 32) || "Guest",
      color: user?.color || "#2563eb"
    };

    socket.data.roomID = roomID;
    socket.data.user = member;
    socket.join(roomID);
    roomUsers(roomID).set(socket.id, member);

    socket.emit("room-state", await getRoomState(roomID));
    io.to(roomID).emit("users-update", publicUsers(roomID));
  });

  socket.on("cursor-move", ({ x, y }) => {
    const { roomID, user } = socket.data;
    if (!roomID || !user) return;
    socket.to(roomID).emit("cursor-move", { user, x, y });
  });

  socket.on("cursor-leave", () => {
    const { roomID, user } = socket.data;
    if (!roomID || !user) return;
    socket.to(roomID).emit("cursor-leave", { id: user.id });
  });

  socket.on("start-stroke", ({ strokeID, color, width, opacity, variant, fill, dashed, roughness, seed, initialCoords }) => {
    const { roomID, user } = socket.data;
    if (!roomID || !user || !strokeID || !initialCoords) return;

    const style = {
      color,
      width,
      ...(opacity !== undefined ? { opacity } : {}),
      ...(variant ? { variant } : {}),
      ...(fill ? { fill } : {}),
      ...(dashed ? { dashed } : {}),
      ...(roughness !== undefined ? { roughness } : {}),
      ...(seed !== undefined ? { seed } : {})
    };

    const stroke = {
      strokeID,
      roomID,
      author: { id: user.id, name: user.name },
      points: [initialCoords],
      style,
      startedAt: Date.now()
    };

    activeStrokes.set(strokeKey(roomID, strokeID), stroke);
    socket.to(roomID).emit("start-stroke", {
      strokeID,
      author: stroke.author,
      point: initialCoords,
      style: stroke.style
    });
  });

  socket.on("stream-stroke", ({ strokeID, point }) => {
    const { roomID } = socket.data;
    if (!roomID || !strokeID || !point) return;

    const stroke = activeStrokes.get(strokeKey(roomID, strokeID));
    if (!stroke) return;

    stroke.points.push(point);
    socket.to(roomID).emit("stream-stroke", { strokeID, point });
  });

  socket.on("end-stroke", async ({ strokeID, snapshot }) => {
    const { roomID } = socket.data;
    if (!roomID || !strokeID) return;

    const key = strokeKey(roomID, strokeID);
    const active = activeStrokes.get(key);
    if (!active) return;

    activeStrokes.delete(key);
    const room = await Room.findOneAndUpdate({ code: roomID }, { $inc: { strokeCount: 1 } }, { new: true });
    const zIndex = room?.strokeCount || Date.now();

    await Stroke.create({
      strokeID: active.strokeID,
      roomID,
      author: active.author,
      points: active.points,
      style: active.style,
      zIndex
    });

    if (snapshot && zIndex % 50 === 0) {
      const saved = await Snapshot.create({ roomID, image: snapshot, strokeCount: zIndex });
      await Room.updateOne({ code: roomID }, { latestSnapshot: saved._id });
      io.to(roomID).emit("snapshot-saved", { strokeCount: zIndex });
    }

    socket.to(roomID).emit("end-stroke", { strokeID, zIndex });
  });

  socket.on("undo-request", async () => {
    const { roomID, user } = socket.data;
    if (!roomID || !user) return;

    const stroke = await Stroke.findOneAndUpdate(
      { roomID, "author.id": user.id, isDeleted: false },
      { isDeleted: true },
      { sort: { zIndex: -1 }, new: true }
    );

    if (stroke) io.to(roomID).emit("remove-stroke", { strokeID: stroke.strokeID });
  });

  socket.on("redo-request", async () => {
    const { roomID, user } = socket.data;
    if (!roomID || !user) return;

    const stroke = await Stroke.findOneAndUpdate(
      { roomID, "author.id": user.id, isDeleted: true },
      { isDeleted: false },
      { sort: { zIndex: -1 }, new: true }
    ).lean();

    if (stroke) {
      io.to(roomID).emit("restore-stroke", {
        strokeID: stroke.strokeID,
        author: stroke.author,
        points: stroke.points,
        style: stroke.style,
        zIndex: stroke.zIndex,
        ...(stroke.kind ? { kind: stroke.kind } : {}),
        ...(stroke.text !== undefined ? { text: stroke.text } : {}),
        ...(stroke.box ? { box: stroke.box } : {}),
        ...(stroke.groupId ? { groupId: stroke.groupId } : {}),
        ...(stroke.locked ? { locked: stroke.locked } : {})
      });
    }
  });

  socket.on("remove-stroke", async ({ strokeID }) => {
    const { roomID } = socket.data;
    if (!roomID || !strokeID) return;

    const stroke = await Stroke.findOneAndUpdate(
      { roomID, strokeID, isDeleted: false },
      { isDeleted: true }
    );

    if (stroke) socket.to(roomID).emit("remove-stroke", { strokeID });
  });

  socket.on("move-strokes", async ({ updates }) => {
    const { roomID } = socket.data;
    if (!roomID || !Array.isArray(updates) || updates.length === 0) return;

    const ops = updates
      .filter((u) => u?.strokeID && Array.isArray(u.points) && u.points.length > 0)
      .map((u) => ({
        updateOne: {
          filter: { roomID, strokeID: u.strokeID, isDeleted: false },
          update: {
            $set: {
              points: u.points,
              ...(u.box ? { box: u.box } : {}),
              ...(u.style ? { style: u.style } : {})
            }
          }
        }
      }));

    if (ops.length > 0) {
      await Stroke.bulkWrite(ops);
      socket.to(roomID).emit("strokes-moved", { updates });
    }
  });

  socket.on("reorder-strokes", async ({ strokeIDs, direction }) => {
    const { roomID } = socket.data;
    if (!roomID || !Array.isArray(strokeIDs) || strokeIDs.length === 0) return;

    const all = await Stroke.find({ roomID, isDeleted: false }).sort({ zIndex: 1 }).lean();
    if (all.length === 0) return;

    let nextZ = direction === "front" ? (all[all.length - 1].zIndex || 0) + 1 : (all[0].zIndex || 0) - strokeIDs.length;
    const updates = strokeIDs.map((strokeID) => ({ strokeID, zIndex: nextZ++ }));

    await Stroke.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { roomID, strokeID: u.strokeID },
          update: { $set: { zIndex: u.zIndex } }
        }
      }))
    );

    if (direction === "front") {
      await Room.updateOne({ code: roomID }, { $max: { strokeCount: nextZ } });
    }

    io.to(roomID).emit("strokes-reordered", { updates });
  });

  socket.on("patch-strokes", async ({ patches }) => {
    const { roomID } = socket.data;
    if (!roomID || !Array.isArray(patches) || patches.length === 0) return;

    const ops = patches
      .filter((p) => p?.strokeID)
      .map((p) => {
        const set = {};
        if (p.points) set.points = p.points;
        if (p.box) set.box = p.box;
        if (p.style) set.style = p.style;
        if (p.groupId !== undefined) set.groupId = p.groupId;
        if (p.locked !== undefined) set.locked = p.locked;
        return {
          updateOne: {
            filter: { roomID, strokeID: p.strokeID, isDeleted: false },
            update: { $set: set }
          }
        };
      });

    if (ops.length > 0) {
      await Stroke.bulkWrite(ops);
      socket.to(roomID).emit("strokes-patched", { patches });
    }
  });

  socket.on("import-strokes", async ({ items }) => {
    const { roomID, user } = socket.data;
    if (!roomID || !user || !Array.isArray(items) || items.length === 0) return;

    const room = await Room.findOneAndUpdate(
      { code: roomID },
      { $inc: { strokeCount: items.length } },
      { new: true }
    );
    let z = (room?.strokeCount || items.length) - items.length + 1;

    const docs = items.map((item) => ({
      strokeID: item.strokeID,
      roomID,
      author: item.author || { id: user.id, name: user.name },
      points: item.points || [],
      style: item.style || { color: "#111827", width: 4 },
      zIndex: z++,
      kind: item.kind || "stroke",
      ...(item.text !== undefined ? { text: item.text } : {}),
      ...(item.box ? { box: item.box } : {}),
      ...(item.groupId ? { groupId: item.groupId } : {}),
      ...(item.locked ? { locked: item.locked } : {})
    }));

    await Stroke.insertMany(docs, { ordered: false }).catch(() => {});
    io.to(roomID).emit("strokes-imported", { items: docs });
  });

  socket.on("upsert-item", async ({ strokeID, points, style, kind, text, box }) => {
    const { roomID, user } = socket.data;
    if (!roomID || !user || !strokeID || !Array.isArray(points) || points.length === 0) return;

    const existing = await Stroke.findOne({ roomID, strokeID });
    if (existing) {
      existing.points = points;
      existing.style = style;
      if (kind) existing.kind = kind;
      if (text !== undefined) existing.text = text;
      if (box) existing.box = box;
      existing.isDeleted = false;
      await existing.save();

      io.to(roomID).emit("item-upserted", {
        strokeID: existing.strokeID,
        author: existing.author,
        points: existing.points,
        style: existing.style,
        zIndex: existing.zIndex,
        kind: existing.kind,
        text: existing.text,
        box: existing.box
      });
      return;
    }

    const room = await Room.findOneAndUpdate({ code: roomID }, { $inc: { strokeCount: 1 } }, { new: true });
    const zIndex = room?.strokeCount || Date.now();
    const author = { id: user.id, name: user.name };

    const created = await Stroke.create({
      strokeID,
      roomID,
      author,
      points,
      style,
      zIndex,
      kind: kind || "text",
      text: text || "",
      ...(box ? { box } : {})
    });

    io.to(roomID).emit("item-upserted", {
      strokeID: created.strokeID,
      author: created.author,
      points: created.points,
      style: created.style,
      zIndex: created.zIndex,
      kind: created.kind,
      text: created.text,
      box: created.box
    });
  });

  socket.on("laser-move", ({ x, y, color }) => {
    const { roomID, user } = socket.data;
    if (!roomID || !user) return;
    socket.to(roomID).emit("laser-move", { id: user.id, x, y, color });
  });

  socket.on("clear-canvas", async () => {
    const { roomID } = socket.data;
    if (!roomID) return;

    await Promise.all([
      Stroke.updateMany({ roomID }, { isDeleted: true }),
      Snapshot.deleteMany({ roomID }),
      Room.updateOne({ code: roomID }, { strokeCount: 0, latestSnapshot: null })
    ]);

    io.to(roomID).emit("clear-canvas");
  });

  socket.on("chat-message", async ({ body }) => {
    const { roomID, user } = socket.data;
    const clean = body?.trim();
    if (!roomID || !user || !clean) return;

    const message = await Message.create({
      roomID,
      author: { id: user.id, name: user.name },
      body: clean.slice(0, 1000)
    });

    io.to(roomID).emit("chat-message", {
      id: message._id.toString(),
      author: message.author,
      body: message.body,
      createdAt: message.createdAt
    });
  });

  socket.on("disconnect", () => {
    const { roomID } = socket.data;
    if (!roomID) return;

    for (const [key, stroke] of activeStrokes.entries()) {
      if (stroke.roomID === roomID && stroke.author.id === socket.data.user?.id) activeStrokes.delete(key);
    }

    roomUsers(roomID).delete(socket.id);
    io.to(roomID).emit("users-update", publicUsers(roomID));
    socket.to(roomID).emit("cursor-leave", { id: socket.data.user?.id || socket.id });
  });
});

httpServer.listen(port, () => {
  console.log(`Whiteboard ready on http://localhost:${port}`);
});
