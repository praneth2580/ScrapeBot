import { getChatShellData } from "@/app/lib/chat-store";

export async function GET() {
  const { config } = getChatShellData();
  return Response.json({ config });
}
