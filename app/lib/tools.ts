import { scrapeUrl } from "./scraper";
import { ollama, resolveAvailableOllamaModel } from "./ollama";
import { getAIService } from "@/lib/ai/service";
import { LOCAL_NUM_CTX } from "./page-context";

const RUNNING_SUMMARY_CHARS = 800;

/**
 * Bounded page extraction. Each batch sees only a short running summary,
 * so a long page does not resend the full previous analysis.
 */
export async function scrapePage(args: { url: string; prompt: string }) {
  console.log(`[Agent Tool] Scraping ${args.url} and analyzing with prompt: ${args.prompt}`);

  try {
    const result = await scrapeUrl(args.url);
    const batches = result.batches;

    if (batches.length === 0) {
      return `Error: No content found at ${args.url}`;
    }

    let previousResult = "";
    const ai = getAIService();
    let useRouter = true;
    try {
      await ai.reload();
    } catch {
      useRouter = false;
    }

    for (let i = 0; i < batches.length; i++) {
      console.log(`[Agent Tool] Processing batch ${i + 1}/${batches.length}`);
      let userContent = `Chunk ${i + 1} of ${batches.length}:\n\n${batches[i]}\n\nUser prompt: ${args.prompt}`;
      if (previousResult) {
        userContent += `\n\nRunning summary so far:\n${previousResult}\n\nUpdate the summary from this chunk. Keep it under ${RUNNING_SUMMARY_CHARS} characters.`;
      } else {
        userContent += `\n\nReply in under ${RUNNING_SUMMARY_CHARS} characters.`;
      }

      if (useRouter) {
        try {
          const routed = await ai.runTask({
            task: "interpret",
            system:
              "You extract or summarize webpage content for the user. Return plain text (not JSON).",
            input: userContent,
            outputSchema: null,
          });
          previousResult = (routed.response.text || "").slice(0, RUNNING_SUMMARY_CHARS);
          continue;
        } catch (routerError) {
          console.warn(
            "[Agent Tool] AI router failed, falling back to Ollama:",
            routerError instanceof Error ? routerError.message : routerError
          );
          useRouter = false;
        }
      }

      const model = await resolveAvailableOllamaModel();
      const response = await ollama.chat({
        model,
        messages: [{ role: "user", content: userContent }],
        options: { num_ctx: LOCAL_NUM_CTX },
        stream: false,
      });

      previousResult = (response.message.content || "").slice(0, RUNNING_SUMMARY_CHARS);
    }

    return `Extraction from ${args.url} completed. Final result:\n\n${previousResult}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Agent Tool] Scrape & Analyze failed:`, message);
    return `Error scraping ${args.url}: ${message}`;
  }
}
