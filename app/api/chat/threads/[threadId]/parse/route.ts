import { parsePageForThread } from "@/app/lib/chat-store";

type Context = {
  params: Promise<{
    threadId: string;
  }>;
};

type ParseBody = {
  url?: string;
  focus?: string;
};

export async function POST(request: Request, { params }: Context) {
  const { threadId } = await params;
  const numericThreadId = Number(threadId);

  if (!Number.isFinite(numericThreadId)) {
    return Response.json({ error: "Invalid thread id." }, { status: 400 });
  }

  let body: ParseBody;
  try {
    body = (await request.json()) as ParseBody;
  } catch {
    return Response.json({ error: "Invalid or empty request body." }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return Response.json({ error: "Page URL is required." }, { status: 400 });
  }

  try {
    const thread = await parsePageForThread(
      numericThreadId,
      url,
      body.focus?.trim()
    );

    if (!thread) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }

    return Response.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse the page.";
    const status = /valid|already has messages|Only http/i.test(message)
      ? 400
      : 502;
    return Response.json({ error: message }, { status });
  }
}
