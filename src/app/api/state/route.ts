import { connection, NextResponse } from "next/server";
import { readStored, writeIfVersion } from "@/lib/server-store";
import { isSchoolState } from "@/lib/types";

export async function GET() {
  await connection();
  return NextResponse.json(readStored(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    baseVersion?: unknown;
    state?: unknown;
  } | null;

  if (!body || typeof body.baseVersion !== "number" || !isSchoolState(body.state)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const result = writeIfVersion(body.baseVersion, body.state);
  return NextResponse.json(result.stored, { status: result.ok ? 200 : 409 });
}
