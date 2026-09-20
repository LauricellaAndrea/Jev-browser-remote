import "dotenv/config";
import { routeIntent, selectCandidate } from "./src/services/typesafe.js";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 TESTING TYPESAFE JEV ROUTER & CANDIDATE SELECT");
  console.log("==================================================\n");

  const testCases = [
    "apri notepad",
    "metti il volume al 60%",
    "cerca eminem lose yourself su youtube",
    "che tempo fa a Roma?"
  ];

  for (const query of testCases) {
    console.log(`Testing query: "${query}"`);
    try {
      const result = await routeIntent(query);
      console.log(`  -> Action:     ${result.action}`);
      console.log(`  -> Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  -> Latency:    ${result.timeMs.toFixed(0)} ms`);
    } catch (err) {
      console.error(`  -> Error:`, err);
    }
    console.log("");
  }

  console.log("--------------------------------------------------");
  console.log("🧪 TESTING JEV CANDIDATE SELECTION (PATTERN 'SELECT INSTEAD OF GENERATE')");
  console.log("--------------------------------------------------\n");

  const userGoal = "voglio ascoltare la versione originale ufficiale del brano";
  const candidates = [
    { id: "cand_1", label: "Eminem - Lose Yourself [Official Music Video]" },
    { id: "cand_2", label: "Lose Yourself - Eminem (Lyrics 1 Hour Loop)" },
    { id: "cand_3", label: "Eminem live performance at Oscars" },
    { id: "cand_4", label: "Tutorial: how to play Lose Yourself on piano" }
  ];

  console.log(`User Goal: "${userGoal}"`);
  console.log("Candidates:");
  candidates.forEach(c => console.log(`  [${c.id}] ${c.label}`));

  try {
    const selection = await selectCandidate(userGoal, candidates);
    console.log(`\n  -> Selected ID: ${selection.id}`);
    console.log(`  -> Confidence:  ${(selection.confidence * 100).toFixed(1)}%`);
    console.log(`  -> Latency:     ${selection.timeMs.toFixed(0)} ms`);
  } catch (err) {
    console.error(`  -> Error:`, err);
  }

  console.log("\n==================================================");
  console.log("✅ TEST COMPLETED");
  console.log("==================================================");
}

runTests();
