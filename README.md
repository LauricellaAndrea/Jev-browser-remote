# 🎙️ Jev OS & Browser Remote Controller (TypeSafe AI)

Un controller vocale e testuale autonomo per **Windows & Web Browser**, alimentato dal modello **System One TypeSafe Jev**. 

Il progetto consente di controllare vocalmente il computer e il browser in tempo reale: l'assistente ascolta il comando, prende decisioni strutturate e tipizzate in millisecondi, apre fisicamente Google Chrome e le app di Windows, e compie le azioni a schermo davanti ai tuoi occhi (cercare, cliccare video e risultati, scorrere, mettere in pausa, tornare indietro, regolare il volume).

---

## 📌 Nota sulla Versione Attuale: Profilo Chrome Dedicato / Ospite

> [!IMPORTANT]
> In questa versione, Google Chrome si apre come finestra autonoma con un **profilo dedicato indipendente** (`JevDevProfile`), che visivamente appare come un profilo "Ospite" o pulito (senza il tuo account Google connesso di default).
>
> **Perché è necessario:**
> - Google Chrome blocca (*SingletonLock*) qualsiasi tentativo di controllare da codice il profilo personale principale se questo è già aperto sul PC.
> - L'uso di un profilo dedicato con la porta di debug remoto (`--remote-debugging-port=9222`) permette a Playwright e TypeSafe Jev di **prendere il controllo fisico in tempo reale** della finestra aperta, senza confliggere né rischiare di toccare le tue schede o credenziali personali.
>
> **Come renderlo connesso ai tuoi account:**
> - La cartella `JevDevProfile` è **permanente sul tuo disco** (`%LOCALAPPDATA%\Google\Chrome\JevDevProfile`).
> - Ti basta effettuare l'accesso una sola volta con il tuo account (Google, YouTube, Gmail, Amazon) spuntando *"Resta connesso"*: i cookie e le sessioni rimarranno salvati per sempre in quel profilo, consentendo a Jev di operare con i tuoi dati anche nelle future sessioni.

---

## 🚀 Caratteristiche Principali

- **🧠 Ragionamento Deterministico TypeSafe Jev (System One)**:
  - **Universal Intent Routing**: Valuta in parallelo l'azione richiesta (`web_search`, `open_website`, `browser_click`, `browser_control`, `open_app`, `system_volume`, `system_command`) e la piattaforma di destinazione ottimale (`youtube`, `google`, `amazon`, `wikipedia`) con latenza media inferiore a 900 ms.
  - **Select Instead of Generate**: Ispeziona il DOM della pagina aperta ed estrae i candidati; quando chiedi di aprire un elemento (es. *"clicca su Lose Yourself"* oppure *"apri il primo video"*, *"clicca sul secondo risultato"*), Jev seleziona l'elemento esatto con confidenza calibrata al 99-100%.
- **🖥️ Controllo Fisico del Browser (Playwright + Chrome CDP)**:
  - **Apertura visibile su Desktop**: Grazie al launcher Win32 (`launch-desktop.ps1`), Chrome si apre direttamente sul monitor fisico reale (`WinSta0\Default`) anche quando il server gira in background.
  - **Nessun popup o link manuale**: Le pagine, le ricerche e i video si aprono e si avviano da soli.
  - **Superamento Banner Cookie**: Bypassa automaticamente i popup di consenso cookie (YouTube, Google Italia, Amazon).
  - **Navigazione Completa**: Tasti rapidi di riproduzione (Play/Pausa, Schermo Intero, Mute, Scroll) e cronologia (Torna indietro, Vai avanti, Ricarica).
- **🪟 Automazione Nativa Windows**:
  - Avvio immediato di app di sistema (Calcolatrice, Blocco Note, Paint, Esplora Risorse, Terminale, Impostazioni).
  - Regolazione fine del volume audio di sistema Windows via script PowerShell dedicato.
- **🎙️ Dashboard Vocale in Tempo Reale (Web HUD)**:
  - Web Speech API integrata in italiano (`it-IT`).
  - Filtro antirimbalzo (debouncing) per evitare doppie attivazioni del microfono.
  - Telemetria live: percentuale di confidenza Jev, tempo di inferenza in millisecondi e registro eventi operativo via WebSocket.

---

## 📂 Struttura del Progetto

```text
Jev-project/
├── AVVIA-JEV.bat                # Launcher rapido con 1 click per Windows
├── package.json                 # Dipendenze e script npm
├── tsconfig.json                # Configurazione TypeScript
├── .env                         # Chiave API TypeSafe (TYPESAFE_API_KEY)
├── public/
│   └── index.html               # Interfaccia Web HUD (Microfono, Telemetria Jev, Log)
├── scripts/
│   ├── launch-desktop.ps1       # Bridge Win32 per creare processi su WinSta0\Default
│   └── set-volume.ps1           # Script PowerShell per regolazione volume master
└── src/
    ├── server.ts                # Server Express + WebSocket & orchestratore comandi
    ├── index.ts                 # CLI alternativa da terminale
    ├── services/
    │   └── typesafe.ts          # Client TypeSafe Jev (Routing e Scelta Candidati)
    └── executors/
        ├── browser.ts           # Automazione Chrome visibile via Playwright CDP
        └── windows.ts           # Automazione comandi e app native di Windows
```

---

## 🛠️ Cosa è Stato Implementato fino ad oggi

1. **Risolto il problema del Desktop Nascosto (WinSta0 / Sandbox)**:
   - *Problema*: Quando i comandi venivano eseguiti in background, Windows li avviava in un desktop virtuale isolato (`WinSta0\exebox-...`); il server diceva *"Aperto a schermo"*, ma sul monitor dell'utente non compariva nulla.
   - *Soluzione*: Creato `scripts/launch-desktop.ps1` che chiama l'API Win32 `OpenDesktop("Default")` e `SetThreadDesktop` per forzare l'apertura grafica sul monitor reale.
2. **Integrazione Chrome DevTools Protocol (CDP)**:
   - Chrome viene avviato con la porta di debug remoto (`--remote-debugging-port=9222`) e un profilo dedicato permanente (`JevDevProfile`).
   - Playwright si connette via `chromium.connectOverCDP`, garantendo il pieno controllo della finestra visibile senza confliggere con il Chrome personale già aperto.
3. **Selezione Ordinale su Google & Risoluzione Redirect**:
   - *Problema*: Su Google i link utilizzano percorsi relativi o redirect (`/goto?...`, `/url?...`), provocando lo scarto di tutti i risultati se filtrati per `http`.
   - *Soluzione*: Risolti tutti gli URL di Google e aggiunte etichette ordinali in italiano (`1. [primo risultato]`, `2. [secondo risultato]`), consentendo a Jev di selezionare con precisione chirurgica comandi come *"clicca sul primo risultato"* o *"apri il secondo"*.
4. **Navigazione Cronologia (`Torna indietro`, `Vai avanti`, `Ricarica`)**:
   - Aggiunto supporto immediato a comandi di navigazione cronologica del browser: *"torna indietro"* (`p.goBack()`), *"vai avanti"* (`p.goForward()`), *"ricarica"* (`p.reload()`) eseguiti in meno di 50 ms.
5. **Bypass dei Timeout Pointer Events su YouTube**:
   - Superati i problemi di intercettazione click causati dai banner di consenso o dalle intestazioni fisse di YouTube, implementando la navigazione diretta istantanea all'URL del video con fallback a click forzato e DOM evaluation.
6. **Rimozione Completa di Bottoni e Link Manuali**:
   - Eliminata la necessità di cliccare collegamenti nella dashboard: il flusso è 100% autonomo hands-free.
7. **Stabilizzazione del Microfono e Web Speech API**:
   - Risolto il problema del loop audio e dei trigger a raffica grazie a debouncing temporale (2.5s) e gestione controllata del ciclo di ascolto continuo.

---

## ⚡ Guida Rapida all'Uso

### 1. Prerequisiti
- **Windows 10 o 11**
- **Node.js** (v18 o superiore)
- **Google Chrome** installato nel percorso standard (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- Una **API Key di TypeSafe AI**

### 2. Configurazione
Crea un file `.env` nella root del progetto:
```env
TYPESAFE_API_KEY=tuo_token_qui
```

### 3. Installazione e Compilazione
Apri un terminale nella cartella del progetto:
```bash
npm install
npm run build
```

### 4. Avvio
Puoi avviare il controller in due modi:
- **Metodo 1 (Consigliato)**: Fai doppio click sul file **`AVVIA-JEV.bat`** (presente anche sul tuo Desktop).
- **Metodo 2 (Terminale)**:
  ```bash
  npm run dev
  ```

### 5. Utilizzo
1. Apri il browser su: **`http://localhost:3000`**
2. Clicca sull'icona del microfono 🎤 (*"🔴 In ascolto..."*) oppure scrivi un comando nella barra in basso.
3. Prova questi comandi vocali:
   - 🔍 **Ricerche Web**:
     - *"Cercami Eminem su YouTube"* $\rightarrow$ Apre Chrome ed esegue la ricerca.
     - *"Cerca la ricetta della carbonara su Google"* $\rightarrow$ Cerca su Google.
     - *"Prezzo cuffie Bluetooth su Amazon"* $\rightarrow$ Cerca su Amazon.it.
     - *"Apri Wikipedia"* $\rightarrow$ Apre la homepage di Wikipedia.
   - 🎯 **Selezione e Click Autonomo**:
     - *"Clicca su Lose Yourself"* $\rightarrow$ Individua il video e lo avvia.
     - *"Apri il primo video"* o *"Metti il secondo"* $\rightarrow$ Seleziona per posizione su YouTube.
     - *"Clicca sul primo risultato"* o *"Apri il secondo"* $\rightarrow$ Seleziona per posizione su Google.
   - 🔙 **Navigazione Cronologia Browser**:
     - *"Torna indietro"* $\rightarrow$ Torna alla pagina o ricerca precedente.
     - *"Vai avanti"* $\rightarrow$ Avanza alla pagina successiva.
     - *"Ricarica"* o *"Aggiorna"* $\rightarrow$ Ricarica la pagina attiva.
   - ⏯️ **Controlli Multimediali**:
     - *"Metti in pausa"* o *"Riprendi"* $\rightarrow$ Ferma/avvia la riproduzione.
     - *"Schermo intero"* $\rightarrow$ Attiva/disattiva fullscreen.
     - *"Muta"* $\rightarrow$ Silenzia/riattiva l'audio.
   - 💻 **Comandi di Sistema Windows**:
     - *"Apri Calcolatrice"* o *"Apri Blocco Note"* $\rightarrow$ Apre l'app nativa a schermo.
     - *"Volume al 30%"* o *"Alza il volume"* $\rightarrow$ Modifica il volume di Windows.

---

## 🚀 Come Arricchire ed Estendere il Progetto

Se desideri aggiungere nuove funzionalità, ecco una guida rapida ai punti di estensione:

### 1. Usare i Tuoi Account Personali (Gmail, Calendar, Amazon, YouTube Premium)
Il profilo creato dal controller (`JevDevProfile`) è una cartella **permanente** situata in:
`%LOCALAPPDATA%\Google\Chrome\JevDevProfile`

- **Come fare**:
  1. Quando Jev apre Chrome, fai il login con il tuo account Google o Amazon e spunta *"Resta connesso"*.
  2. Le sessioni e i cookie rimarranno salvati per sempre.
  3. Da quel momento Jev potrà accedere direttamente alla tua casella Gmail, ai tuoi calendari o al tuo account YouTube con i tuoi consigliati e senza pubblicità!

### 2. Aggiungere Nuove Piattaforme di Ricerca o Nuovi Siti
Nel file [`src/services/typesafe.ts`](file:///c:/Users/andre/Desktop/Jev-project/src/services/typesafe.ts):
- Aggiungi la nuova piattaforma al tipo `SearchPlatform` (es. `'github' | 'reddit'`).
- Aggiungi la descrizione della piattaforma nella domanda `choice` di Jev:
  ```typescript
  platform: choice("If the user wants to search or visit the web, what is the best destination platform?", {
    // ...
    github: "Repositories, code, developer projects, open source issues."
  })
  ```
- Nel file [`src/executors/browser.ts`](file:///c:/Users/andre/Desktop/Jev-project/src/executors/browser.ts):
  - Aggiungi l'URL di ricerca in `performWebSearch` e in `resolveWebsiteUrl`.

### 3. Aggiungere Nuove Applicazioni Windows
Nel file [`src/executors/windows.ts`](file:///c:/Users/andre/Desktop/Jev-project/src/executors/windows.ts):
- Modifica la mappa `appMappings` aggiungendo sinonimi in italiano e il comando eseguibile:
  ```typescript
  const appMappings: Record<string, string> = {
    // ...
    "word": "winword",
    "excel": "excel",
    "discord": "start discord:",
    "steam": "start steam:"
  };
  ```

### 4. Aggiungere Nuove Azioni Intelligenti Jev (System One)
Se vuoi introdurre comandi speciali (ad esempio *"riassumi la pagina"*, *"estrai il prezzo"*, *"compila il modulo"*):
1. In `src/services/typesafe.ts`, aggiungi l'opzione nella domanda `action` di `routeUniversalIntent`.
2. In `src/server.ts`, gestisci il nuovo `case` nello `switch(routing.action)` invocando la funzione corrispondente in `browser.ts`.

---

## 📄 Licenza
Progetto rilasciato sotto licenza MIT. Libero da utilizzare, estendere e personalizzare.
