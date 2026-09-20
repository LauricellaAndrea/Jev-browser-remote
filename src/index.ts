import * as readline from "readline";
import { routeUniversalIntent, selectCandidate } from "./services/typesafe.js";
import { openApp, setVolume } from "./executors/windows.js";
import { 
  performWebSearch, 
  navigateToWebsite, 
  clickElementOnScreen, 
  getVisibleElements, 
  resolveWebsiteUrl 
} from "./executors/browser.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> "
});

console.log("---------------------------------------------------------");
console.log(" 🎙️ Windows Jev Universal Controller (TypeSafe AI)");
console.log("---------------------------------------------------------");
console.log("Esempi comandi universali:");
console.log("  - 'cerca ricetta tiramisù su google'");
console.log("  - 'cerca trailer batman su youtube'");
console.log("  - 'prezzo iphone 15 su amazon'");
console.log("  - 'apri wikipedia'");
console.log("  - 'apri calcolatrice' / 'apri blocco note'");
console.log("  - 'volume al 40%'");
console.log("  - 'exit' per uscire");
console.log("---------------------------------------------------------\n");

rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
    process.exit(0);
  }

  if (!input) {
    rl.prompt();
    return;
  }

  try {
    console.log("\n[Jev] Analisi universale...");
    const routing = await routeUniversalIntent(input);
    console.log(`[Jev] Azione:   ${routing.action}`);
    console.log(`[Jev] Platform: ${routing.platform}`);
    console.log(`[Jev] Confidenza: ${(routing.actionConfidence * 100).toFixed(1)}%`);
    console.log(`[Jev] Latenza:  ${routing.timeMs.toFixed(0)} ms\n`);

    switch (routing.action) {
      case "web_search": {
        await performWebSearch(input, routing.platform, (msg: string) => console.log(`  ${msg}`));
        break;
      }

      case "open_website": {
        const url = resolveWebsiteUrl(input, routing.platform);
        await navigateToWebsite(url, (msg: string) => console.log(`  ${msg}`));
        break;
      }

      case "open_app": {
        const appName = input.replace(/apri\s+/i, "").trim();
        await openApp(appName, (msg: string) => console.log(`  ${msg}`));
        break;
      }

      case "system_volume": {
        const numMatch = input.match(/\d+/);
        const level = numMatch ? parseInt(numMatch[0], 10) : 50;
        await setVolume(level, (msg: string) => console.log(`  ${msg}`));
        break;
      }

      case "browser_click": {
        const candidates = await getVisibleElements((msg: string) => console.log(`  ${msg}`));
        const selection = await selectCandidate(input, candidates);
        const chosen = candidates.find((c) => c.id === selection.id);
        if (selection.id && chosen) {
          console.log(`[Jev] Scelto: ${chosen.label} (Confidenza: ${(selection.confidence * 100).toFixed(1)}%)`);
          await clickElementOnScreen(selection.id, (msg: string) => console.log(`  ${msg}`));
        } else {
          console.log("Nessuna corrispondenza trovata.");
        }
        break;
      }

      case "unknown":
      default:
        console.log("Intento non chiaro.");
        break;
    }
  } catch (error) {
    console.error("[Errore]:", error);
  }

  console.log("");
  rl.prompt();
});
