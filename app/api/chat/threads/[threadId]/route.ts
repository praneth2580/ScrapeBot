import { deleteThread, getChatShellData, getThread } from "@/app/lib/chat-store";

type Context = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { threadId } = await params;
  const thread = getThread(Number(threadId));

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  return Response.json({ thread });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { threadId } = await params;
  const deleted = deleteThread(Number(threadId));

  if (!deleted) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const { threads } = getChatShellData();
  return Response.json({ threads });
}
