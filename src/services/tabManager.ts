import { Page, BrowserContext } from "playwright";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import "dotenv/config";
import { 
  getBrowserContext, 
  getAllPages, 
  setActivePage, 
  getCurrentlyActivePage, 
  resolveWebsiteUrl, 
  LogCallback 
} from "../executors/browser.js";

const client = new TypeSafeClient();

export type TabIntentMode = "OPEN_NEW" | "CLOSE_TAB" | "SMART_SWITCH_OR_OPEN";

export interface TabIntent {
  mode: TabIntentMode;
  target: string;
  isGenericClose?: boolean;
}

export interface TabCandidateInfo {
  id: string;
  index: number;
  title: string;
  url: string;
  hostname: string;
  label: string;
  page: Page;
}

export interface TabExecutionResult {
  action: string;
  target: string;
  confidence: number;
  latencyMs: number;
  summary: string;
}

/**
 * DIRECTIVE 1: Fast Heuristic check with strict routing priority.
 * Ensures system/media/volume/click commands (e.g. 'torna indietro', 'volume al 30%', 'pausa')
 * are NEVER intercepted as tab operations.
 */
export function detectTabIntent(transcript: string): TabIntent | null {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();

  // EXCLUSIONS: Media, history navigation, volume, local app launchers, and element clicking
  if (
    lower.includes("torna indietro") ||
    lower.includes("vai avanti") ||
    lower.includes("ricarica") ||
    lower.includes("aggiorna") ||
    lower.includes("pausa") ||
    lower.includes("play") ||
    lower.includes("riprendi") ||
    lower.includes("schermo intero") ||
    lower.includes("fullscreen") ||
    lower.includes("muta") ||
    lower.includes("silenzia") ||
    lower.startsWith("volume") ||
    lower.includes("volume al") ||
    lower.includes("alza il volume") ||
    lower.includes("abbassa il volume") ||
    lower.startsWith("clicca") ||
    lower.startsWith("apri il primo") ||
    lower.startsWith("apri il secondo") ||
    lower.startsWith("apri il terzo") ||
    lower.startsWith("apri calcolatrice") ||
    lower.startsWith("apri blocco note") ||
    lower.startsWith("apri paint")
  ) {
    return null;
  }

  // 1. OPEN_NEW Trigger
  const openNewPattern = /^(?:apri\s+(?:una\s+|un\s+)?)?(?:nuova\s+tab|nuova\s+scheda|un'altra\s+scheda|un\s+altro\s+tab|nuovo\s+tab)(?:\s+(?:e\s+)?(?:cerca|vai\s+su|apri|su)?\s*(.*))?$/i;
  const openNewMatch = lower.match(openNewPattern);
  if (openNewMatch) {
    const rawTarget = openNewMatch[1] || "";
    const cleanTarget = rawTarget
      .replace(/^(?:e\s+)?(?:cerca|vai\s+su|apri|su)\s*/i, "")
      .trim();
    return {
      mode: "OPEN_NEW",
      target: cleanTarget
    };
  }

  // 2. CLOSE_TAB Trigger
  const closeTabPattern = /^chiudi\s+(?:questa\s+scheda|questa\s+tab|la\s+scheda\s+di\s+|il\s+tab\s+di\s+|la\s+scheda\s+|il\s+tab\s+|scheda\s+|tab\s*|scheda$|tab$)(.*)?$/i;
  const closeMatch = lower.match(closeTabPattern);
  if (closeMatch) {
    const rawTarget = (closeMatch[1] || "").trim();
    if (!rawTarget || rawTarget === "questa" || rawTarget === "attiva" || rawTarget === "corrente") {
      return {
        mode: "CLOSE_TAB",
        target: "",
        isGenericClose: true
      };
    }
    return {
      mode: "CLOSE_TAB",
      target: rawTarget,
      isGenericClose: false
    };
  }

  // 3. SMART_SWITCH_OR_OPEN Trigger
  // Triggers like "passa alla scheda...", "vai alla scheda...", "torna alla scheda...", "passa al video", "torna alle ricette", "vai su github"
  const switchPattern = /^(?:passa\s+(?:alla\s+scheda|al\s+tab|alle\s+schede|ai\s+tab|a|al|alla|alle|agli|ai|allo|su|sulla|sulle)?|vai\s+(?:alla\s+scheda|al\s+tab|su|sulla|sulle|a|al|alla|alle)?|torna\s+(?:alla\s+scheda|al\s+tab|a|al|alla|alle|agli|ai|allo|su|sulla|sulle)?|mostra\s+(?:la\s+scheda|il\s+tab|le\s+schede))\s+(.+)$/i;
  const switchMatch = lower.match(switchPattern);
  if (switchMatch) {
    const target = switchMatch[1].trim();
    // Exclude 'indietro' or 'avanti' just in case
    if (target === "indietro" || target === "avanti") return null;

    return {
      mode: "SMART_SWITCH_OR_OPEN",
      target
    };
  }

  return null;
}

/**
 * DIRECTIVE 2: Parallel Tab Metadata Extraction with Promise.all and safety timeout.
 */
export async function extractTabCandidates(pages: Page[]): Promise<TabCandidateInfo[]> {
  const candidatePromises = pages.map(async (p, index) => {
    if (p.isClosed()) return null;

    try {
      // 800ms safety timeout per page metadata extraction to avoid degrading latency
      const timeoutPromise = new Promise<{ title: string; url: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 800)
      );

      const metadataPromise = (async () => {
        const title = (await p.title().catch(() => "")) || "Nuova scheda";
        const url = p.url() || "about:blank";
        return { title, url };
      })();

      const { title, url } = await Promise.race([metadataPromise, timeoutPromise]);

      let hostname = "blank";
      try {
        if (url && url !== "about:blank") {
          hostname = new URL(url).hostname;
        }
      } catch (e) {}

      const id = `tab_${index}`;
      return {
        id,
        index,
        title: title || "Nuova scheda",
        url,
        hostname,
        label: `Scheda [${id}]: ${title || "Senza titolo"} - ${hostname}`,
        page: p
      };
    } catch (err) {
      return null;
    }
  });

  const results = await Promise.all(candidatePromises);
  return results.filter((c): c is TabCandidateInfo => c !== null && !c.page.isClosed());
}

/**
 * Resolves a target string into an actionable URL (direct domain, search, or home).
 */
export function resolveTargetDestination(target: string): { url: string; display: string } {
  const clean = target.trim();
  if (!clean) {
    return { url: "https://www.google.com", display: "Google" };
  }

  const lower = clean.toLowerCase();

  // Known websites
  const knownUrl = resolveWebsiteUrl(lower);
  if (!knownUrl.includes("google.com/search?q=")) {
    return { url: knownUrl, display: clean };
  }

  // Check if it's explicitly a direct URL or domain format
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return { url: lower, display: lower };
  }
  if (lower.includes(".") && !lower.includes(" ")) {
    return { url: `https://${lower}`, display: lower };
  }

  // Search contextual routing (YouTube if music/video, Amazon if shopping, Google general)
  if (lower.includes("youtube") || lower.includes("video") || lower.includes("canzone") || lower.includes("brano")) {
    const q = clean
      .replace(/su\s+youtube/i, "")
      .replace(/video\s+(di\s+)?/i, "")
      .replace(/canzone\s+(di\s+)?/i, "")
      .replace(/cerca\s+/i, "")
      .trim();
    return {
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q || clean)}`,
      display: `Ricerca YouTube: "${q || clean}"`
    };
  }

  if (lower.includes("amazon") || lower.includes("compra") || lower.includes("prezzo")) {
    const q = clean
      .replace(/su\s+amazon/i, "")
      .replace(/prezzo\s+(di\s+)?/i, "")
      .replace(/compra\s+/i, "")
      .replace(/cerca\s+/i, "")
      .trim();
    return {
      url: `https://www.amazon.it/s?k=${encodeURIComponent(q || clean)}`,
      display: `Ricerca Amazon: "${q || clean}"`
    };
  }

  // Default to Google search
  const query = clean.replace(/^cerca\s+/i, "").trim();
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    display: `Ricerca Google: "${query}"`
  };
}

/**
 * Handles OPEN_NEW: Creates a new browser page, navigates to target, and brings it to front.
 */
export async function handleOpenNewTab(
  target: string,
  onLog?: LogCallback,
  initialStartTime?: number
): Promise<TabExecutionResult> {
  const startTime = initialStartTime ?? performance.now();
  const context = await getBrowserContext(onLog);

  onLog?.("Apertura nuova scheda in Google Chrome...");
  const newPage = await context.newPage();
  setActivePage(newPage);

  const destination = resolveTargetDestination(target);
  onLog?.(`Navigazione verso: ${destination.url}...`);

  try {
    await newPage.goto(destination.url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (err: any) {
    onLog?.(`Caricamento pagina completato.`);
  }

  await newPage.bringToFront();
  const pageTitle = (await newPage.title().catch(() => "")) || destination.display;

  return {
    action: "Apertura Nuova Scheda",
    target: pageTitle,
    confidence: 1.0,
    latencyMs: performance.now() - startTime,
    summary: `Aperta nuova scheda: "${pageTitle}".`
  };
}

/**
 * Handles SMART_SWITCH_OR_OPEN (Candidate Pattern + Fallback):
 * Analyzes open tabs with TypeSafe Jev. If a tab matches with confidence >= 0.70, switches to it.
 * Otherwise, falls back to opening a new tab.
 */
export async function handleSmartSwitchOrOpen(
  transcript: string,
  onLog?: LogCallback
): Promise<TabExecutionResult> {
  const startTime = performance.now();
  const context = await getBrowserContext(onLog);
  const rawPages = (await getAllPages(onLog)).filter(p => !p.isClosed());

  // DIRECTIVE 2: Extract tab candidates in parallel
  const candidates = await extractTabCandidates(rawPages);

  if (candidates.length > 0) {
    const criteria: Record<string, string> = {};
    for (const c of candidates) {
      criteria[c.id] = c.label;
    }
    criteria["none"] = "Scheda [NONE]: Nessuna scheda aperta corrisponde alla richiesta";

    onLog?.(`Valutazione semantica schede aperte (${candidates.length} schede)...`);
    const jevRes = await client.systemOne({
      state: `User Spoken Intent: "${transcript}"`,
      questions: {
        selectedTab: choice(
          `Determina quale scheda del browser corrisponde all'intenzione dell'utente: '${transcript}'. Se nessuna scheda aperta è attinente, scegli l'opzione [NONE].`,
          criteria
        )
      }
    });

    const choiceId = jevRes.answers.selectedTab.choice;
    const confidence = jevRes.answers.selectedTab.confidence;
    const latency = performance.now() - startTime;

    // Confidence threshold >= 0.70 on a valid tab choice
    if (choiceId && choiceId !== "none" && confidence >= 0.70) {
      const match = candidates.find(c => c.id === choiceId);
      if (match && !match.page.isClosed()) {
        await match.page.bringToFront();
        setActivePage(match.page);
        onLog?.(`Passaggio alla scheda: "${match.title}" (Confidenza: ${(confidence * 100).toFixed(1)}%)`);

        return {
          action: "Cambio Scheda Intelligente",
          target: match.title,
          confidence,
          latencyMs: latency,
          summary: `Portata in primo piano scheda: "${match.title}".`
        };
      }
    }

    onLog?.(`Nessuna scheda aperta corrisponde con certezza (${(confidence * 100).toFixed(1)}%). Apertura nuova scheda...`);
  }

  // Fallback: Open new tab
  return await handleOpenNewTab(transcript, onLog, startTime);
}

/**
 * Handles CLOSE_TAB:
 * Closes the active tab or uses TypeSafe Jev to select the targeted tab to close.
 * DIRECTIVE 3: Immediately updates activePage reference to the last remaining page and brings it to front.
 */
export async function handleCloseTab(
  intent: TabIntent,
  onLog?: LogCallback
): Promise<TabExecutionResult> {
  const startTime = performance.now();
  const context = await getBrowserContext(onLog);
  const pages = (await getAllPages(onLog)).filter(p => !p.isClosed());

  if (pages.length === 0) {
    return {
      action: "Chiusura Scheda",
      target: "Nessuna scheda aperta",
      confidence: 1.0,
      latencyMs: performance.now() - startTime,
      summary: "Nessuna scheda aperta nel browser da chiudere."
    };
  }

  let targetPage: Page | null = null;
  let closedTitle = "";
  let confidence = 1.0;

  if (intent.isGenericClose || !intent.target) {
    // Close the currently active page (or the last page if active is unset)
    targetPage = getCurrentlyActivePage() || pages[pages.length - 1];
    closedTitle = (await targetPage.title().catch(() => "")) || targetPage.url() || "Scheda attiva";
    onLog?.(`Chiusura della scheda attiva ("${closedTitle}")...`);
  } else {
    // Specific target requested: invoke Jev candidate choice
    const candidates = await extractTabCandidates(pages);
    const criteria: Record<string, string> = {};
    for (const c of candidates) {
      criteria[c.id] = c.label;
    }
    criteria["none"] = "Nessuna delle schede corrisponde alla richiesta di chiusura";

    onLog?.(`Selezione con Jev della scheda da chiudere: "${intent.target}"...`);
    const jevRes = await client.systemOne({
      state: `User Request to Close Tab: "${intent.target}"`,
      questions: {
        targetTab: choice(
          `Determina quale scheda del browser l'utente vuole chiudere in base alla richiesta: '${intent.target}'. Se nessuna scheda corrisponde, scegli 'none'.`,
          criteria
        )
      }
    });

    const selectedId = jevRes.answers.targetTab.choice;
    confidence = jevRes.answers.targetTab.confidence;

    if (selectedId && selectedId !== "none" && confidence >= 0.70) {
      const match = candidates.find(c => c.id === selectedId);
      if (match && !match.page.isClosed()) {
        targetPage = match.page;
        closedTitle = match.title;
        onLog?.(`Jev ha individuato la scheda da chiudere: "${match.title}" (Confidenza: ${(confidence * 100).toFixed(1)}%)`);
      }
    } else {
      return {
        action: "Chiusura Scheda Fallita",
        target: intent.target,
        confidence,
        latencyMs: performance.now() - startTime,
        summary: `Nessuna scheda trovata corrispondente a "${intent.target}".`
      };
    }
  }

  if (targetPage) {
    try {
      await targetPage.close();
      onLog?.(`Scheda "${closedTitle}" chiusa.`);
    } catch (e: any) {
      onLog?.(`Avviso chiusura: ${e.message}`);
    }

    // DIRECTIVE 3: Update activePage immediately to the last remaining page and bring it to front
    const remainingPages = (await getAllPages(onLog)).filter(p => !p.isClosed());
    if (remainingPages.length > 0) {
      const nextActive = remainingPages[remainingPages.length - 1];
      setActivePage(nextActive);
      try {
        await nextActive.bringToFront();
        const nextTitle = (await nextActive.title().catch(() => "")) || nextActive.url();
        onLog?.(`Scheda attiva aggiornata: "${nextTitle}" portata in primo piano.`);
      } catch (err) {}
    } else {
      setActivePage(null);
      onLog?.("Nessun'altra scheda aperta in Google Chrome.");
    }

    return {
      action: "Chiusura Scheda",
      target: closedTitle,
      confidence,
      latencyMs: performance.now() - startTime,
      summary: `Chiusa scheda "${closedTitle}".`
    };
  }

  return {
    action: "Chiusura Scheda",
    target: intent.target,
    confidence: 0,
    latencyMs: performance.now() - startTime,
    summary: "Impossibile identificare la scheda da chiudere."
  };
}

/**
 * Master dispatcher for Smart Voice Tab Manager.
 */
export async function executeTabCommand(
  intent: TabIntent,
  transcript: string,
  onLog?: LogCallback
): Promise<TabExecutionResult> {
  switch (intent.mode) {
    case "OPEN_NEW":
      return await handleOpenNewTab(intent.target, onLog);

    case "CLOSE_TAB":
      return await handleCloseTab(intent, onLog);

    case "SMART_SWITCH_OR_OPEN":
      return await handleSmartSwitchOrOpen(intent.target || transcript, onLog);
  }
}
