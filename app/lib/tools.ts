import { scrapeUrl } from "./scraper";
import { ollama, resolveAvailableOllamaModel } from "./ollama";

// Define the local JavaScript functions that the AI can call
export const agentFunctions = {
  getWeather: async (args: { location: string }) => {
    console.log(`[Agent Tool] Getting weather for ${args.location}`);
    // In a real app, you would call a weather API here
    return `The current weather in ${args.location} is sunny and 72°F.`;
  },
  getCurrentTime: async (args: { timezone?: string }) => {
    console.log(`[Agent Tool] Getting current time`);
    return `The current time is ${new Date().toLocaleTimeString('en-US', { timeZone: args.timezone || 'UTC' })}`;
  },
  scrapePage: async (args: { url: string; prompt: string }) => {
    console.log(`[Agent Tool] Scraping ${args.url} and analyzing with prompt: ${args.prompt}`);

    try {
      const result = await scrapeUrl(args.url);
      const batches = result.batches;

      if (batches.length === 0) {
        return `Error: No content found at ${args.url}`;
      }

      let previousResult = "";
      const model = await resolveAvailableOllamaModel();

      for (let i = 0; i < batches.length; i++) {
        console.log(`[Agent Tool] Processing batch ${i + 1}/${batches.length}`);
        let userContent = `You are analyzing data chunk by chunk. Here is chunk ${i + 1} of ${batches.length}:\n\n${batches[i]}\n\nUser Prompt: ${args.prompt}`;
        if (previousResult) {
          userContent += `\n\nPrevious analysis result:\n${previousResult}\n\nPlease incorporate or update the previous result based on this new chunk. Provide only the updated result.`;
        }

        const response = await ollama.chat({
          model,
          messages: [{ role: "user", content: userContent }],
          stream: false,
        });

        previousResult = response.message.content || "";
      }

      return `Extraction from ${args.url} completed. Final result:\n\n${previousResult}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Agent Tool] Scrape & Analyze failed:`, message);
      return `Error scraping ${args.url}: ${message}`;
    }
  },
};

// Define the JSON schema for Ollama to understand what tools are available
export const ollamaTools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get the current weather for a specific location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state/country, e.g. 'San Francisco, CA' or 'London, UK'"
          }
        },
        required: ["location"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description: "Get the current time, optionally for a specific timezone.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "The IANA timezone string, e.g. 'America/Los_Angeles' or 'Europe/London'. Defaults to UTC."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scrapePage",
      description: "Scrapes a web page and extracts specific information from it based on your prompt. Use this whenever the user asks you to read, scrape, or extract data from a URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The fully qualified URL to scrape, e.g. 'https://example.com'"
          },
          prompt: {
            type: "string",
            description: "The specific instructions on what data to extract or summarize from the page. E.g., 'Extract the users table' or 'Summarize the article'."
          }
        },
        required: ["url", "prompt"]
      }
    }
  }
];
