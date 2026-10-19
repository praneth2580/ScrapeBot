import { saveUserMessage, generateReply } from "@/app/lib/chat-store";
import type { SendMessageRequest } from "@/app/_components/chat/types";

type Context = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  const { threadId } = await params;

  let body: Partial<SendMessageRequest>;
  try {
    body = (await request.json()) as Partial<SendMessageRequest>;
  } catch {
    return Response.json({ error: "Invalid or empty request body" }, { status: 400 });
  }

  const text = body.text?.trim();
  const model = body.model?.trim();

  if (!text) {
    return Response.json({ error: "Message text is required" }, { status: 400 });
  }

  const numericThreadId = Number(threadId);

  const threadAfterSave = saveUserMessage(numericThreadId, text);
  if (!threadAfterSave) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        send({
          type: "status",
          step: 0,
          maxSteps: 3,
          label: "Message saved",
          detail: "Starting assistant…",
        });

        const threadAfterReply = await generateReply(
          numericThreadId,
          model,
          (progress) => {
            send({
              type: "status",
              step: progress.step,
              maxSteps: progress.maxSteps,
              label: progress.label,
              detail: progress.detail,
            });
          }
        );

        if (!threadAfterReply) {
          send({ type: "error", error: "Thread not found" });
          return;
        }

        send({ type: "done", thread: threadAfterReply });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to reach Ollama.";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
