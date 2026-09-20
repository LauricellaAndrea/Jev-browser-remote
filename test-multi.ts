import "dotenv/config";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";

async function test() {
  const client = new TypeSafeClient();
  const testQueries = [
    "cerca ricetta pizza margherita",
    "cerca trailer nuovo batman",
    "quanto costa un macbook su amazon",
    "apri calcolatrice",
    "metti il volume a 30",
    "apri wikipedia"
  ];

  for (const q of testQueries) {
    const res = await client.systemOne({
      state: `User Command: "${q}"`,
      questions: {
        action: choice("Primary action intended by user", {
          web_search: "Search for info, web query, video, or shopping on the web",
          open_website: "Open a known website homepage",
          open_app: "Open a local desktop Windows app",
          system_volume: "Adjust Windows audio volume"
        }),
        platform: choice("Most appropriate platform for web operations", {
          google: "General queries, recipes, news, questions",
          youtube: "Music, videos, trailers",
          amazon: "Shopping, prices, buying products",
          wikipedia: "Encyclopedia, definitions, history",
          none: "Not a web operation"
        })
      }
    });

    console.log(`[Query]: "${q}"`);
    console.log(`  -> Action:   ${res.answers.action.choice} (${(res.answers.action.confidence * 100).toFixed(0)}%)`);
    console.log(`  -> Platform: ${res.answers.platform.choice} (${(res.answers.platform.confidence * 100).toFixed(0)}%)\n`);
  }
}

test();
