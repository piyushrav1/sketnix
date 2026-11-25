import { NextResponse } from "next/server";
import { connectMongo } from "@/server/db";
import { Message, Room, Snapshot, Stroke } from "@/server/models";
import { createRoom } from "@/server/rooms";

export async function POST() {
  await connectMongo();
  const room = await createRoom();
  return NextResponse.json({ code: room.code });
}

export async function GET(request: Request) {
  await connectMongo();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ exists: false }, { status: 400 });
  }

  const room = await Room.exists({ code });
  return NextResponse.json({ exists: Boolean(room) });
}

export async function DELETE(request: Request) {
  await connectMongo();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ deleted: false, error: "Invalid room code" }, { status: 400 });
  }

  const res = await Room.deleteOne({ code });
  if (res.deletedCount === 0) {
    return NextResponse.json({ deleted: false, error: "Room not found" }, { status: 404 });
  }

  await Promise.all([
    Stroke.deleteMany({ roomID: code }),
    Message.deleteMany({ roomID: code }),
    Snapshot.deleteMany({ roomID: code })
  ]);

  return NextResponse.json({ deleted: true });
}
