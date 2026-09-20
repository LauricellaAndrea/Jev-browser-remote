import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export type LogCallback = (msg: string) => void;

async function runPowerShell(command: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${command}"`);
  if (stderr && !stderr.includes("CLIXML")) {
    console.warn("[PowerShell Warning]:", stderr);
  }
  return stdout.trim();
}

/**
 * Opens a local Windows desktop application.
 */
export async function openApp(rawName: string, onLog?: LogCallback): Promise<string> {
  const cleanName = rawName.toLowerCase().trim();

  const appMappings: Record<string, string> = {
    "notepad": "notepad",
    "blocco note": "notepad",
    "blocco note di windows": "notepad",
    "note": "notepad",
    "calcolatrice": "calc",
    "calculator": "calc",
    "calc": "calc",
    "paint": "mspaint",
    "disegno": "mspaint",
    "esplora file": "explorer",
    "esplora risorse": "explorer",
    "explorer": "explorer",
    "cartella": "explorer",
    "questo pc": "explorer",
    "documenti": "explorer shell:Personal",
    "download": "explorer shell:Downloads",
    "impostazioni": "start ms-settings:",
    "settings": "start ms-settings:",
    "task manager": "taskmgr",
    "gestione attività": "taskmgr",
    "gestione attivita": "taskmgr",
    "spotify": "spotify",
    "musica": "spotify",
    "terminale": "wt",
    "powershell": "powershell",
    "cmd": "cmd",
    "prompt dei comandi": "cmd",
    "chrome": "chrome",
    "google chrome": "chrome",
    "edge": "msedge",
    "word": "winword",
    "excel": "excel"
  };

  const target = appMappings[cleanName] || cleanName;

  const msg = `Avvio applicazione Windows: '${target}'...`;
  console.log(`[Windows Executor] ${msg}`);
  onLog?.(msg);

  try {
    const psScript = path.resolve(process.cwd(), "scripts", "launch-desktop.ps1");
    if (target.startsWith("start ")) {
      await runPowerShell(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -CommandLine "cmd.exe /c ${target}"`);
    } else {
      await runPowerShell(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -CommandLine "${target}"`);
    }
    const successMsg = `Applicazione '${target}' avviata a schermo!`;
    onLog?.(successMsg);
    return successMsg;
  } catch (error: any) {
    const errMsg = `Impossibile aprire '${target}': applicazione non trovata.`;
    console.error(`[Windows Executor] ${errMsg}`);
    onLog?.(errMsg);
    return errMsg;
  }
}

/**
 * Sets Windows system master volume using the PowerShell script.
 */
export async function setVolume(level: number, onLog?: LogCallback): Promise<string> {
  const target = Math.max(0, Math.min(100, Math.round(level)));
  const scriptPath = path.resolve(process.cwd(), "scripts", "set-volume.ps1");
  
  const msg = `Regolazione volume di sistema al ${target}%...`;
  console.log(`[Windows Executor] ${msg}`);
  onLog?.(msg);

  try {
    const out = await runPowerShell(`& "${scriptPath}" -targetPercent ${target}`);
    const resMsg = `Volume impostato al ${target}%`;
    console.log(`[Windows Executor] ${out}`);
    onLog?.(resMsg);
    return resMsg;
  } catch (error: any) {
    const errMsg = `Errore regolazione volume: ${error.message}`;
    console.error(`[Windows Executor] ${errMsg}`);
    onLog?.(errMsg);
    return errMsg;
  }
}

/**
 * Executes a native Windows system command.
 */
export async function executeSystemCommand(command: string, onLog?: LogCallback): Promise<string> {
  const lower = command.toLowerCase();

  if (lower.includes("blocca") || lower.includes("lock")) {
    onLog?.("Blocco del computer in corso...");
    await execAsync("rundll32.exe user32.dll,LockWorkStation");
    return "Computer bloccato";
  }

  return "Comando di sistema non riconosciuto";
}
