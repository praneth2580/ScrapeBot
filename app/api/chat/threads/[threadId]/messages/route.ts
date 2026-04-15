import { appendMessage } from "@/app/lib/chat-store";
import type { SendMessageRequest } from "@/app/_components/chat/types";

type Context = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  const { threadId } = await params;
  const body = (await request.json()) as Partial<SendMessageRequest>;
  const text = body.text?.trim();
  const model = body.model?.trim();

  if (!text) {
    return Response.json({ error: "Message text is required" }, { status: 400 });
  }

  try {
    const thread = await appendMessage(Number(threadId), text, model);

    if (!thread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    return Response.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Ollama.";

    return Response.json({ error: message }, { status: 502 });
  }
}
