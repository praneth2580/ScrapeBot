import { getChatShellData } from "@/app/lib/chat-store";

export async function GET() {
  return Response.json(getChatShellData());
}
