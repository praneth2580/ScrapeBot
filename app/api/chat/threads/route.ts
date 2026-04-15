import { createThread, getChatShellData } from "@/app/lib/chat-store";

export async function GET() {
  const { threads } = getChatShellData();
  return Response.json({ threads });
}

export async function POST() {
  return Response.json(createThread(), { status: 201 });
}
