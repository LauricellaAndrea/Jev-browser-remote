import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import "dotenv/config";

if (!process.env.TYPESAFE_API_KEY) {
  throw new Error("Missing TYPESAFE_API_KEY in environment variables.");
}

const client = new TypeSafeClient();

export type IntentAction = 
  | "web_search"
  | "open_website"
  | "open_app" 
  | "system_volume" 
  | "browser_click"
  | "browser_control"
  | "system_command"
  | "unknown";

export type SearchPlatform = 
  | "google"
  | "youtube"
  | "amazon"
  | "wikipedia"
  | "none";

export interface UniversalRoutingResult {
  action: IntentAction;
  platform: SearchPlatform;
  actionConfidence: number;
  platformConfidence: number;
  timeMs: number;
}

export interface CandidateResult {
  id: string | null;
  confidence: number;
  timeMs: number;
}

/**
 * Universal Intent Router using parallel TypeSafe Choice questions over the user input.
 * Evaluates in a single request: action category and optimal destination platform.
 */
export async function routeUniversalIntent(userInput: string): Promise<UniversalRoutingResult> {
  const startTime = performance.now();
  
  const response = await client.systemOne({
    state: `User Spoken Command: "${userInput}"`,
    questions: {
      action: choice("Classify the primary action intended by the user.", {
        web_search: "User wants to search for queries, topics, songs, videos, artists, products, or recipes on the web (e.g. 'cerca Eminem', 'cercami un brano', 'trova ricetta carbonara').",
        browser_click: "User wants to click, select, play or open a specific video, song, link or result on the active browser page (e.g. 'clicca su Lose Yourself', 'apri il primo video', 'metti il primo risultato', 'seleziona Not Afraid').",
        browser_control: "User wants to pause, resume, fullscreen, mute, scroll, go back, or navigate forward on the active video or webpage (e.g. 'metti in pausa', 'play', 'torna indietro', 'vai avanti', 'schermo intero', 'muta', 'ricarica').",
        open_website: "User wants to open or navigate to the homepage of a specific website (e.g., 'apri wikipedia', 'vai su amazon', 'apri youtube', 'apri netflix', 'apri chatgpt').",
        open_app: "User wants to launch an installed Windows desktop application (e.g., 'apri blocco note', 'apri calcolatrice', 'apri paint', 'apri impostazioni').",
        system_volume: "User wants to adjust, mute, or set the Windows master audio volume (e.g. 'volume al 30%', 'alza il volume', 'abbassa').",
        system_command: "User wants to perform a Windows system action like locking the PC or closing a program.",
        unknown: "The intent is completely unclear or unsupported."
      }),
      platform: choice("If the user wants to search or visit the web, what is the best destination platform?", {
        youtube: "Music, songs, artists, video clips, video trailers, video gameplay, live streams, youtube.",
        google: "General web queries, weather, recipes, definitions, facts, news, generic search.",
        amazon: "Shopping, buying items, checking prices of electronics, clothes, books.",
        wikipedia: "Encyclopedia, history, biographies, scientific concepts, geography.",
        none: "The command is for local Windows apps, volume, media keys or not a web operation."
      })
    },
  });

  const endTime = performance.now();
  
  return {
    action: response.answers.action.choice as IntentAction,
    platform: response.answers.platform.choice as SearchPlatform,
    actionConfidence: response.answers.action.confidence,
    platformConfidence: response.answers.platform.confidence,
    timeMs: endTime - startTime,
  };
}

/**
 * Selects the best candidate ID from an array of candidates based on user input.
 * Implements TypeSafe System One pattern: "Select instead of generate".
 */
export async function selectCandidate(
  userInput: string, 
  candidates: Array<{ id: string, label: string }>
): Promise<CandidateResult> {
  const startTime = performance.now();
  
  if (candidates.length === 0) {
    return { id: null, confidence: 0, timeMs: 0 };
  }

  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    criteria[c.id] = c.label;
  }
  criteria["none"] = "None of the candidates match what the user wants.";

  const response = await client.systemOne({
    state: `User Spoken Request: "${userInput}"`,
    questions: {
      targetId: choice("Select the single candidate ID that best matches what the user is asking to click, open or play (matching either title or ordinal position e.g. primo/secondo).", criteria),
    },
  });

  const endTime = performance.now();
  const answer = response.answers.targetId;
  const selectedId = answer.choice === "none" ? null : answer.choice;

  return {
    id: selectedId,
    confidence: answer.confidence,
    timeMs: endTime - startTime,
  };
}
