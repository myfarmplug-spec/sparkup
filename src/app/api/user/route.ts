import { NextResponse } from "next/server";

// In-memory user store for demo (replace with DB in production)
let users: Record<string, { coins: number; uploads: number }> = {};

export async function POST(request: Request) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  if (!users[userId]) {
    users[userId] = { coins: 10, uploads: 0 };
  }
  return NextResponse.json(users[userId]);
}

export async function PUT(request: Request) {
  const { userId, uploads, coins } = await request.json();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (!users[userId]) users[userId] = { coins: 10, uploads: 0 };
  if (uploads !== undefined) users[userId].uploads = uploads;
  if (coins !== undefined) users[userId].coins = coins;
  return NextResponse.json(users[userId]);
}
