import { chromium, Browser, BrowserContext, Page } from "playwright";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { SearchPlatform } from "../services/typesafe.js";

const execFileAsync = promisify(execFile);

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export type LogCallback = (msg: string) => void;

export interface InteractiveElement {
  id: string;
  label: string;
  href?: string;
}

let activeCandidates: InteractiveElement[] = [];
let candidatesPageUrl: string = "";

// Automatic cleanup on process shutdown
process.on("exit", () => {
  if (browser) {
    try { browser.close(); } catch (e) {}
  }
});
process.on("SIGINT", () => {
  if (browser) {
    try { browser.close(); } catch (e) {}
  }
  process.exit(0);
});

/**
 * Ensures Google Chrome is visibly open on the user's interactive desktop and connected via CDP.
 * Always targets the actively focused / most recent page.
 */
export async function getActivePage(onLog?: LogCallback): Promise<Page> {
  if (page && !page.isClosed()) {
    try {
      await page.bringToFront();
      return page;
    } catch (e) {}
  }

  // Try connecting to existing CDP instance first
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    context = browser.contexts()[0] || null;
    const pages = (context?.pages() || []).filter(p => !p.isClosed());
    page = pages[pages.length - 1] || (await context?.newPage()) || null;
    if (page) {
      await page.bringToFront();
      return page;
    }
  } catch (e) {
    // Not running yet, launch it on the user desktop!
  }

  onLog?.("Avvio Google Chrome visibile sul tuo desktop...");
  const psScript = path.resolve(process.cwd(), "scripts", "launch-desktop.ps1");
  const chromeExe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const profileDir = path.resolve(process.env.LOCALAPPDATA || "C:\\Users\\andre\\AppData\\Local", "Google", "Chrome", "JevDevProfile");
  const cmd = `"${chromeExe}" --remote-debugging-port=9222 --user-data-dir="${profileDir}" --no-first-run --no-default-browser-check --start-maximized about:blank`;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript, "-CommandLine", cmd]);
  } catch (e) {}

  // Wait up to 6 seconds for Chrome to launch and open the CDP port
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      context = browser.contexts()[0] || null;
      const pages = (context?.pages() || []).filter(p => !p.isClosed());
      page = pages[pages.length - 1] || (await context?.newPage()) || null;
      if (page) {
        break;
      }
    } catch (err) {}
  }

  if (!page) {
    throw new Error("Impossibile connettersi a Google Chrome sul desktop.");
  }

  page.on("close", () => {
    // If the closed page was the active reference, clear it
    if (page === null || page.isClosed()) {
      page = null;
    }
  });

  try {
    await page.bringToFront();
  } catch (e) {}

  return page;
}

/**
 * Returns the active BrowserContext connected to the desktop Chrome instance.
 */
export async function getBrowserContext(onLog?: LogCallback): Promise<BrowserContext> {
  if (context && browser && browser.isConnected()) {
    return context;
  }
  await getActivePage(onLog);
  if (!context) {
    throw new Error("Impossibile connettersi al contesto del browser Chrome.");
  }
  return context;
}

/**
 * Returns all active, unclosed pages in the current browser context.
 */
export async function getAllPages(onLog?: LogCallback): Promise<Page[]> {
  const ctx = await getBrowserContext(onLog);
  return ctx.pages().filter(p => !p.isClosed());
}

/**
 * Updates the actively tracked page reference.
 */
export function setActivePage(newPage: Page | null): void {
  page = newPage;
  if (!newPage || candidatesPageUrl !== newPage.url()) {
    activeCandidates = [];
    candidatesPageUrl = "";
  }
}

/**
 * Returns the currently active page reference, if valid and not closed.
 */
export function getCurrentlyActivePage(): Page | null {
  if (page && !page.isClosed()) {
    return page;
  }
  return null;
}

/**
 * Auto-dismisses common cookie consent dialogs (YouTube, Google, Amazon).
 */
async function handleCookieBanners(p: Page): Promise<void> {
  try {
    const consentBtn = p.locator('button:has-text("Rifiuta tutto"), button:has-text("Accetta tutto"), button:has-text("Rifiuta"), button:has-text("Accetta"), button[aria-label*="Accetta"], button[aria-label*="Rifiuta"]').first();
    if (await consentBtn.isVisible({ timeout: 1500 })) {
      await consentBtn.click({ timeout: 1500 });
      await p.waitForTimeout(400);
    }
  } catch (e) {}

  try {
    const amzConsent = p.locator('#sp-cc-accept, input#sp-cc-accept').first();
    if (await amzConsent.isVisible({ timeout: 800 })) {
      await amzConsent.click({ timeout: 800 });
      await p.waitForTimeout(300);
    }
  } catch (e) {}
}

/**
 * Navigates the controlled browser directly to any website on the user desktop.
 */
export async function navigateToWebsite(url: string, onLog?: LogCallback): Promise<void> {
  const p = await getActivePage(onLog);
  onLog?.(`Navigazione autonoma a schermo: ${url}...`);
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await handleCookieBanners(p);
  onLog?.(`Sito web aperto visibilmente sul tuo schermo!`);
}

/**
 * Executes a search on the chosen platform and displays the results in Chrome.
 */
export async function performWebSearch(query: string, platform: SearchPlatform, onLog?: LogCallback): Promise<InteractiveElement[]> {
  const p = await getActivePage(onLog);
  const cleanQuery = query
    .replace(/cercami\s+/i, "")
    .replace(/cerca\s+/i, "")
    .replace(/trova\s+/i, "")
    .replace(/su\s+(youtube|google|amazon|wikipedia)/i, "")
    .replace(/il\s+video\s+(di\s+)?/i, "")
    .replace(/la\s+canzone\s+(di\s+)?/i, "")
    .trim();

  let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
  if (platform === "youtube") {
    searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
  } else if (platform === "amazon") {
    searchUrl = `https://www.amazon.it/s?k=${encodeURIComponent(cleanQuery)}`;
  } else if (platform === "wikipedia") {
    searchUrl = `https://it.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(cleanQuery)}`;
  }

  onLog?.(`Ricerca visibile su ${platform.toUpperCase()}: "${cleanQuery}"...`);
  await p.goto(searchUrl, { waitUntil: "domcontentloaded" });
  await handleCookieBanners(p);

  // Platform-specific candidate extraction
  const ordinals = ["primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo", "ottavo"];

  if (platform === "youtube") {
    try {
      await p.waitForSelector('ytd-video-renderer a#video-title, #video-title', { timeout: 5000 });
    } catch (e) {}

    const candidates = await p.$$eval('#video-title', (nodes, ords) => {
      return nodes.slice(0, 8).map((node, index) => {
        const syntheticId = `yt_vid_${index}`;
        node.setAttribute("data-jev-id", syntheticId);
        const title = (node.getAttribute("title") || node.textContent || "").trim();
        const rawHref = node.getAttribute("href") || node.closest("a")?.getAttribute("href") || "";
        const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.youtube.com${rawHref}` : "");
        return {
          id: syntheticId,
          label: `${index + 1}. [${ords[index] || index + 1} video] ${title}`,
          href
        };
      }).filter(item => item.label.length > 5 && item.href);
    }, ordinals);

    activeCandidates = candidates;
    candidatesPageUrl = p.url();
    onLog?.(`Risultati mostrati a schermo (${candidates.length} video pronti).`);
    return candidates;
  }

  if (platform === "google") {
    try {
      await p.waitForSelector('h3', { timeout: 4000 });
    } catch (e) {}

    const candidates = await p.$$eval('h3', (nodes, ords) => {
      return nodes.slice(0, 8).map((node, index) => {
        const syntheticId = `g_res_${index}`;
        const parentA = node.closest('a') || node.parentElement?.closest('a') || node.querySelector('a');
        if (parentA) parentA.setAttribute("data-jev-id", syntheticId);
        node.setAttribute("data-jev-id", syntheticId);
        const title = (node.textContent || "").trim();
        const rawHref = parentA ? parentA.getAttribute("href") || "" : "";
        const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.google.com${rawHref}` : "");
        return {
          id: syntheticId,
          label: `${index + 1}. [${ords[index] || index + 1} risultato] ${title}`,
          href
        };
      }).filter(item => item.label.length > 5);
    }, ordinals);

    activeCandidates = candidates;
    candidatesPageUrl = p.url();
    onLog?.(`Risultati mostrati a schermo (${candidates.length} risultati pronti).`);
    return candidates;
  }

  if (platform === "amazon") {
    try {
      await p.waitForSelector('div[data-component-type="s-search-result"] h2, h2.a-size-mini', { timeout: 4000 });
    } catch (e) {}

    const candidates = await p.$$eval('div[data-component-type="s-search-result"] h2 a, h2.a-size-mini a', (nodes, ords) => {
      return nodes.slice(0, 8).map((node, index) => {
        const syntheticId = `amz_${index}`;
        node.setAttribute("data-jev-id", syntheticId);
        const title = (node.textContent || "").trim();
        const rawHref = node.getAttribute("href") || "";
        const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.amazon.it${rawHref}` : "");
        return {
          id: syntheticId,
          label: `${index + 1}. [${ords[index] || index + 1} prodotto] ${title}`,
          href
        };
      }).filter(item => item.label.length > 5 && item.href);
    }, ordinals);

    activeCandidates = candidates;
    candidatesPageUrl = p.url();
    onLog?.(`Risultati mostrati a schermo (${candidates.length} prodotti pronti).`);
    return candidates;
  }

  onLog?.(`Risultati mostrati a schermo.`);
  return [];
}

/**
 * Returns available candidates on the active page.
 * Always extracts candidates fresh from the CURRENTLY ACTIVE tab.
 */
export async function getVisibleElements(onLog?: LogCallback): Promise<InteractiveElement[]> {
  const p = await getActivePage(onLog);
  const currentUrl = p.url();

  // If already cached for the exact same page URL on this active tab, reuse
  if (activeCandidates.length > 0 && candidatesPageUrl === currentUrl) {
    return activeCandidates;
  }

  activeCandidates = [];
  candidatesPageUrl = currentUrl;

  const ordinals = ["primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo", "ottavo"];

  // 1. YouTube candidates
  if (currentUrl.includes("youtube.com")) {
    try {
      await p.waitForSelector('#video-title, ytd-video-renderer a#video-title', { timeout: 3000 });
      const candidates = await p.$$eval('#video-title, ytd-video-renderer a#video-title', (nodes, ords) => {
        return nodes.slice(0, 8).map((node, index) => {
          const syntheticId = `yt_vid_${index}`;
          node.setAttribute("data-jev-id", syntheticId);
          const title = (node.getAttribute("title") || node.textContent || "").trim();
          const rawHref = node.getAttribute("href") || node.closest("a")?.getAttribute("href") || "";
          const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.youtube.com${rawHref}` : "");
          return {
            id: syntheticId,
            label: `${index + 1}. [${ords[index] || index + 1} video] ${title}`,
            href
          };
        }).filter(item => item.label.length > 5 && item.href);
      }, ordinals);

      if (candidates.length > 0) {
        activeCandidates = candidates;
        return candidates;
      }
    } catch (e) {}
  }

  // 2. Google Search candidates
  if (currentUrl.includes("google.")) {
    try {
      await p.waitForSelector('h3', { timeout: 3000 });
      const candidates = await p.$$eval('h3', (nodes, ords) => {
        return nodes.slice(0, 8).map((node, index) => {
          const syntheticId = `g_res_${index}`;
          const parentA = node.closest('a') || node.parentElement?.closest('a') || node.querySelector('a');
          if (parentA) parentA.setAttribute("data-jev-id", syntheticId);
          node.setAttribute("data-jev-id", syntheticId);
          const title = (node.textContent || "").trim();
          const rawHref = parentA ? parentA.getAttribute("href") || "" : "";
          const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.google.com${rawHref}` : "");
          return {
            id: syntheticId,
            label: `${index + 1}. [${ords[index] || index + 1} risultato] ${title}`,
            href
          };
        }).filter(item => item.label.length > 5);
      }, ordinals);

      if (candidates.length > 0) {
        activeCandidates = candidates;
        return candidates;
      }
    } catch (e) {}
  }

  // 3. Amazon candidates
  if (currentUrl.includes("amazon.")) {
    try {
      await p.waitForSelector('div[data-component-type="s-search-result"] h2 a, h2.a-size-mini a', { timeout: 3000 });
      const candidates = await p.$$eval('div[data-component-type="s-search-result"] h2 a, h2.a-size-mini a', (nodes, ords) => {
        return nodes.slice(0, 8).map((node, index) => {
          const syntheticId = `amz_${index}`;
          node.setAttribute("data-jev-id", syntheticId);
          const title = (node.textContent || "").trim();
          const rawHref = node.getAttribute("href") || "";
          const href = rawHref.startsWith("http") ? rawHref : (rawHref ? `https://www.amazon.it${rawHref}` : "");
          return {
            id: syntheticId,
            label: `${index + 1}. [${ords[index] || index + 1} prodotto] ${title}`,
            href
          };
        }).filter(item => item.label.length > 5 && item.href);
      }, ordinals);

      if (candidates.length > 0) {
        activeCandidates = candidates;
        return candidates;
      }
    } catch (e) {}
  }

  // 4. Generic Webpage fallback (links/headings on the active tab)
  try {
    const candidates = await p.$$eval('main a, article a, h2 a, h3 a, #content a', (nodes, ords) => {
      const seen = new Set<string>();
      const list: any[] = [];
      for (const node of nodes) {
        if (list.length >= 8) break;
        const title = (node.textContent || "").trim();
        const rawHref = node.getAttribute("href") || "";
        if (title.length > 3 && rawHref && !rawHref.startsWith("#") && !seen.has(title.toLowerCase())) {
          seen.add(title.toLowerCase());
          const syntheticId = `elem_${list.length}`;
          node.setAttribute("data-jev-id", syntheticId);
          list.push({
            id: syntheticId,
            label: `${list.length + 1}. [${ords[list.length] || list.length + 1} elemento] ${title}`,
            href: rawHref.startsWith("http") ? rawHref : ""
          });
        }
      }
      return list;
    }, ordinals);

    if (candidates.length > 0) {
      activeCandidates = candidates;
      return candidates;
    }
  } catch (e) {}

  return [];
}

/**
 * Clicks or navigates directly to the chosen element on the desktop.
 * Operates strictly on the currently active tab.
 */
export async function clickElementOnScreen(targetId: string, onLog?: LogCallback): Promise<void> {
  const p = await getActivePage(onLog);
  const matchedCandidate = activeCandidates.find(c => c.id === targetId);

  // If candidate has direct href, navigate immediately on the active page
  if (matchedCandidate && matchedCandidate.href) {
    onLog?.(`Apertura sulla scheda attiva: ${matchedCandidate.label}...`);
    try {
      await p.goto(matchedCandidate.href, { waitUntil: "domcontentloaded" });
      await handleCookieBanners(p);
      onLog?.(`Aperto visibilmente sulla scheda attiva!`);
      activeCandidates = [];
      candidatesPageUrl = "";
      return;
    } catch (err: any) {
      onLog?.(`Navigazione diretta non riuscita, ripiego su click...`);
    }
  }

  // Fallback: physical click on element on the active page
  const selector = `[data-jev-id="${targetId}"]`;
  onLog?.(`Click su [${targetId}] nella scheda corrente...`);
  try {
    const locator = p.locator(selector).first();
    await locator.click({ force: true, timeout: 3000 });
    await handleCookieBanners(p);
    onLog?.(`Click eseguito con successo sulla scheda attiva!`);
    activeCandidates = [];
    candidatesPageUrl = "";
  } catch (err) {
    try {
      await p.$eval(selector, (el: any) => el.click());
      onLog?.(`Click DOM completato sulla scheda attiva!`);
      activeCandidates = [];
      candidatesPageUrl = "";
    } catch (fallbackErr: any) {
      onLog?.(`Errore click: ${fallbackErr.message}`);
    }
  }
}

/**
 * Controls media playback (play, pause, fullscreen, mute, scroll).
 */
export async function controlActiveBrowser(action: string, onLog?: LogCallback): Promise<string> {
  const p = await getActivePage(onLog);
  const lower = action.toLowerCase();

  if (lower.includes("pausa") || lower.includes("play") || lower.includes("riprendi") || lower.includes("blocca") || lower.includes("stop")) {
    onLog?.("Invio comando Play/Pausa (tasto K)...");
    await p.keyboard.press("k");
    return "Play/Pausa commutato";
  }

  if (lower.includes("schermo intero") || lower.includes("fullscreen") || lower.includes("ingrandisci") || lower.includes("tutto schermo")) {
    onLog?.("Passaggio a Schermo Intero (tasto F)...");
    await p.keyboard.press("f");
    return "Schermo intero commutato";
  }

  if (lower.includes("muta") || lower.includes("silenzia") || lower.includes("togli audio")) {
    onLog?.("Mute commutato (tasto M)...");
    await p.keyboard.press("m");
    return "Mute commutato";
  }

  if (lower.includes("indietro") || lower.includes("precedente") || lower.includes("torna indietro")) {
    onLog?.("Torno alla pagina precedente (freccia indietro)...");
    try {
      await p.goBack({ timeout: 5000, waitUntil: "domcontentloaded" });
      activeCandidates = [];
      candidatesPageUrl = "";
      return "Tornato alla pagina precedente";
    } catch (e: any) {
      return "Impossibile tornare indietro (inizio cronologia)";
    }
  }

  if (lower.includes("avanti") || lower.includes("successiva") || lower.includes("vai avanti")) {
    onLog?.("Vado alla pagina successiva (freccia avanti)...");
    try {
      await p.goForward({ timeout: 5000, waitUntil: "domcontentloaded" });
      activeCandidates = [];
      candidatesPageUrl = "";
      return "Avanzato alla pagina successiva";
    } catch (e: any) {
      return "Impossibile andare avanti (fine cronologia)";
    }
  }

  if (lower.includes("ricarica") || lower.includes("aggiorna") || lower.includes("refresh")) {
    onLog?.("Ricaricamento pagina in corso...");
    try {
      await p.reload({ waitUntil: "domcontentloaded" });
      activeCandidates = [];
      candidatesPageUrl = "";
      return "Pagina ricaricata";
    } catch (e: any) {
      return "Errore ricaricamento";
    }
  }

  return "Comando inviato";
}

/**
 * Resolves a website name to its proper URL.
 */
export function resolveWebsiteUrl(targetName: string, platform?: SearchPlatform): string {
  const clean = targetName
    .replace(/apri\s+/i, "")
    .replace(/vai\s+su\s+/i, "")
    .replace(/collegati\s+a\s+/i, "")
    .trim()
    .toLowerCase();

  const directory: Record<string, string> = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "amazon": "https://www.amazon.it",
    "wikipedia": "https://it.wikipedia.org",
    "chatgpt": "https://chatgpt.com",
    "netflix": "https://www.netflix.com",
    "github": "https://github.com",
    "reddit": "https://www.reddit.com",
    "twitch": "https://www.twitch.tv",
    "twitter": "https://x.com",
    "x": "https://x.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "spotify": "https://open.spotify.com",
    "whatsapp": "https://web.whatsapp.com",
    "gmail": "https://mail.google.com",
    "ansa": "https://www.ansa.it",
    "ilpost": "https://www.ilpost.it",
    "repubblica": "https://www.repubblica.it",
    "corriere": "https://www.corriere.it",
    "notizie": "https://news.google.com"
  };

  if (directory[clean]) {
    return directory[clean];
  }

  if (platform && platform !== "none" && directory[platform]) {
    return directory[platform];
  }

  if (clean.includes(".") && !clean.includes(" ")) {
    return clean.startsWith("http") ? clean : `https://${clean}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
}
