import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import "dotenv/config";

import { routeUniversalIntent, selectCandidate } from "./services/typesafe.js";
import { openApp, setVolume, executeSystemCommand } from "./executors/windows.js";
import { 
  navigateToWebsite, 
  performWebSearch, 
  getVisibleElements, 
  clickElementOnScreen, 
  controlActiveBrowser, 
  resolveWebsiteUrl 
} from "./executors/browser.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

// Prevent browser from caching public files (always fetch latest index.html)
app.use(express.static(path.resolve(process.cwd(), "public"), {
  etag: false,
  setHeaders: (res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }
}));

function broadcast(payload: object) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

async function handleUserCommand(rawInput: string) {
  const input = rawInput.trim();
  if (!input) return;

  broadcast({
    type: "command_received",
    text: input,
    timestamp: new Date().toLocaleTimeString()
  });

  const sendLog = (msg: string) => {
    broadcast({ type: "execution_log", message: msg, timestamp: new Date().toLocaleTimeString() });
  };

  try {
    broadcast({ type: "status_update", status: "routing", message: "Jev sta analizzando la richiesta..." });
    
    // Fast-path for immediate browser controls (pausa, play, schermo intero, indietro, avanti, ricarica)
    const lower = input.toLowerCase();
    if (lower.includes("pausa") || lower.includes("play") || lower.includes("riprendi") || lower.includes("schermo intero") || lower.includes("muta") || lower.includes("indietro") || lower.includes("avanti") || lower.includes("ricarica") || lower.includes("aggiorna")) {
      broadcast({ type: "status_update", status: "executing", message: "Esecuzione comando browser..." });
      const res = await controlActiveBrowser(input, sendLog);
      broadcast({
        type: "action_complete",
        action: "browser_control",
        summary: res
      });
      return;
    }

    // Step 1: Universal Parallel Jev Routing
    const routing = await routeUniversalIntent(input);
    broadcast({
      type: "jev_intent",
      action: `${routing.action} [${routing.platform}]`,
      confidence: routing.actionConfidence,
      timeMs: routing.timeMs
    });

    switch (routing.action) {
      case "web_search": {
        broadcast({ type: "status_update", status: "executing", message: `Esecuzione ricerca su ${routing.platform.toUpperCase()} in Chrome...` });
        
        // Physically navigates Chrome on screen and displays the search results
        await performWebSearch(input, routing.platform, sendLog);

        broadcast({
          type: "action_complete",
          action: "web_search",
          summary: `Ricerca completata a schermo su ${routing.platform.toUpperCase()}: "${input}"`
        });
        break;
      }

      case "open_website": {
        const url = resolveWebsiteUrl(input, routing.platform);
        broadcast({ type: "status_update", status: "executing", message: `Apertura sito web in Chrome: ${url}...` });

        // Physically navigates Chrome on screen
        await navigateToWebsite(url, sendLog);

        broadcast({
          type: "action_complete",
          action: "open_website",
          summary: `Sito web aperto a schermo: ${url}`
        });
        break;
      }

      case "browser_click": {
        broadcast({ type: "status_update", status: "selecting", message: "Jev sta individuando l'elemento da cliccare..." });
        
        const candidates = await getVisibleElements(sendLog);
        if (candidates.length === 0) {
          sendLog("Nessun elemento cliccabile rilevato sulla pagina attiva.");
          broadcast({
            type: "action_complete",
            action: "browser_click",
            summary: "Nessun elemento trovato da cliccare."
          });
          break;
        }

        const selection = await selectCandidate(input, candidates);
        const chosen = candidates.find(c => c.id === selection.id);

        if (selection.id && chosen) {
          broadcast({
            type: "jev_selection",
            selectedId: selection.id,
            selectedLabel: chosen.label,
            confidence: selection.confidence,
            timeMs: selection.timeMs
          });

          broadcast({ type: "status_update", status: "executing", message: `Apertura di "${chosen.label}" in corso...` });
          
          // Physically clicks on or navigates to the element in Chrome
          await clickElementOnScreen(selection.id, sendLog);

          broadcast({
            type: "action_complete",
            action: "browser_click",
            summary: `Avviato a schermo: ${chosen.label}`
          });
        } else {
          sendLog("Jev non ha trovato una corrispondenza chiara.");
          broadcast({
            type: "action_complete",
            action: "browser_click",
            summary: "Nessuna corrispondenza individuata."
          });
        }
        break;
      }

      case "browser_control": {
        broadcast({ type: "status_update", status: "executing", message: "Esecuzione comando multimediale..." });
        const res = await controlActiveBrowser(input, sendLog);
        broadcast({
          type: "action_complete",
          action: "browser_control",
          summary: res
        });
        break;
      }

      case "open_app": {
        broadcast({ type: "status_update", status: "executing", message: "Avvio applicazione Windows..." });
        
        let appName = input
          .replace(/apri\s+/i, "")
          .replace(/lancia\s+/i, "")
          .replace(/avvia\s+/i, "")
          .trim();

        const res = await openApp(appName, sendLog);
        broadcast({
          type: "action_complete",
          action: "open_app",
          summary: res
        });
        break;
      }

      case "system_volume": {
        broadcast({ type: "status_update", status: "executing", message: "Regolazione volume Windows..." });
        
        let level = 50;
        const numMatch = input.match(/\d+/);
        if (numMatch) {
          level = parseInt(numMatch[0], 10);
        } else if (input.includes("alza") || input.includes("massimo") || input.includes("tanto")) {
          level = 80;
        } else if (input.includes("abbassa") || input.includes("minimo") || input.includes("poco")) {
          level = 20;
        } else if (input.includes("muta") || input.includes("zero") || input.includes("silenzio")) {
          level = 0;
        }

        const res = await setVolume(level, sendLog);
        broadcast({
          type: "action_complete",
          action: "system_volume",
          summary: res,
          volumeLevel: level
        });
        break;
      }

      case "system_command": {
        broadcast({ type: "status_update", status: "executing", message: "Esecuzione comando di sistema..." });
        const res = await executeSystemCommand(input, sendLog);
        broadcast({
          type: "action_complete",
          action: "system_command",
          summary: res
        });
        break;
      }

      case "unknown":
      default: {
        sendLog(`Comando "${input}" non compreso con sufficiente confidenza.`);
        broadcast({
          type: "action_complete",
          action: "unknown",
          summary: "Comando non riconosciuto."
        });
        break;
      }
    }
  } catch (error: any) {
    console.error("[Controller Error]:", error);
    broadcast({
      type: "error",
      message: error.message || "Errore imprevisto."
    });
  } finally {
    broadcast({ type: "status_update", status: "idle", message: "In ascolto del prossimo comando..." });
  }
}

wss.on("connection", (ws) => {
  console.log("[WebSocket] Client dashboard connesso.");

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "voice_command" || msg.type === "text_command") {
        await handleUserCommand(msg.text);
      }
    } catch (e) {
      console.error("[WebSocket error]:", e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Jev Universal OS & Web Controller su http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
