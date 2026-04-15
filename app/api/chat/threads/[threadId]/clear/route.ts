import { clearThread } from "@/app/lib/chat-store";

type Context = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { threadId } = await params;
  const thread = clearThread(Number(threadId));

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  return Response.json({ thread });
}
