import { scrapeUrl } from "./scraper";

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
  scrapePage: async (args: { url: string }) => {
    console.log(`[Agent Tool] Scraping ${args.url}`);

    try {
      const result = await scrapeUrl(args.url);

      // Return the response as structured JSON with batches so the AI can process them independently
      return JSON.stringify({
        title: result.title,
        url: result.url,
        format: "markdown",
        totalBatches: result.batches.length,
        batches: result.batches,
        note: "IMPORTANT: The page content has been converted from HTML to Markdown. All data, including tables, is in Markdown format (e.g. pipe-table syntax like '| col1 | col2 |'), NOT raw HTML. Extract and present the data directly from the Markdown content provided. Content was split into batches to avoid exceeding context limits."
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Agent Tool] Scrape failed:`, message);
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
      description: "Scrape the contents of a website URL and return the page content as clean markdown text. Use this when the user asks to read, extract, or analyze content from a web page.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The fully qualified URL to scrape, e.g. 'https://example.com' or 'https://en.wikipedia.org/wiki/Web_scraping'"
          }
        },
        required: ["url"]
      }
    }
  }
];
