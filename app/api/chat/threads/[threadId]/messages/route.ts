import { saveUserMessage, generateReply } from "@/app/lib/chat-store";
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

  const numericThreadId = Number(threadId);

  // Save the user message immediately
  const threadAfterSave = saveUserMessage(numericThreadId, text);
  if (!threadAfterSave) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    // Generate the AI reply (this is the slow part)
    const threadAfterReply = await generateReply(numericThreadId, model);

    if (!threadAfterReply) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    return Response.json({ thread: threadAfterReply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Ollama.";

    return Response.json({ error: message }, { status: 502 });
  }
}
