# 🎙️ Jev Browser Remote Controller (TypeSafe AI)

Un controller vocale e testuale autonomo per **Windows & Web Browser**, alimentato dal modello **System One TypeSafe Jev**. 

Il progetto consente di controllare vocalmente il computer e il browser in tempo reale: l'assistente ascolta il comando, prende decisioni strutturate e tipizzate in millisecondi, apre fisicamente Google Chrome e le app di Windows, e compie le azioni a schermo davanti ai tuoi occhi (gestione schede, ricerche, click su video e risultati, scorrimento, pause, navigazione indietro/avanti e regolazione del volume).

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
- **🗂️ Smart Voice Tab Manager (Novità)**:
  - **Apertura Nuove Schede (`OPEN_NEW`)**: Riconosce trigger e target naturali (*"apri nuova tab e cerca scarpe su amazon"*, *"nuova tab youtube"*, *"apri una nuova scheda github"*).
  - **Cambio Scheda Semantico (`SMART_SWITCH_OR_OPEN`)**: Ispeziona in parallelo i titoli e gli host di tutte le schede aperte via Playwright CDP. Se Jev individua una scheda attinente con confidenza $\ge 0.70$, la porta subito in primo piano (`bringToFront()`). Se nessuna scheda corrisponde, esegue il fallback automatico aprendo la risorsa richiesta.
  - **Chiusura Intelligente Schede (`CLOSE_TAB`)**: Chiusura generica della scheda a schermo (*"chiudi questa scheda"*) oppure chiusura mirata (*"chiudi la scheda di YouTube"*), riallineando immediatamente la scheda attiva su quella rimasta per prevenire dangling reference.
  - **Targeting Scheda Corrente per i Click**: La selezione e il click dei risultati candidati avvengono rigorosamente sulla scheda attualmente a schermo, isolando la memoria dei candidati per pagina/URL ed evitando click accidentali su schede precedenti.
- **🖥️ Controllo Fisico del Browser (Playwright + Chrome CDP)**:
  - **Apertura visibile su Desktop**: Grazie al launcher Win32 (`launch-desktop.ps1`), Chrome si apre direttamente sul monitor fisico reale (`WinSta0\Default`) anche quando il server gira in background.
  - **Nessun popup o link manuale**: Le pagine, le ricerche e i video si aprono e si avviano da soli.
  - **Superamento Banner Cookie**: Bypassa automaticamente i popup di consenso cookie (YouTube, Google Italia, Amazon).
  - **Navigazione Completa**: Tasti rapidi di riproduzione (Play/Pausa, Schermo Intero, Mute, Scroll) e cronologia (Torna indietro, Vai avanti, Ricarica) con priorità di routing garantita.
- **🪟 Automazione Nativa Windows**:
  - Avvio immediato di app di sistema (Calcolatrice, Blocco Note, Paint, Esplora Risorse, Terminale, Impostazioni).
  - Regolazione fine del volume audio di sistema Windows via script PowerShell dedicato.
- **🎙️ Dashboard Vocale & Command Bar (Web HUD)**:
  - Web Speech API integrata in italiano (`it-IT`).
  - Filtro antirimbalzo (debouncing) per evitare doppie attivazioni del microfono.
  - Command Bar moderna, centrata e integrata con pulsante rapido `Invio ↵`.
  - Telemetria live WebSocket: percentuale di confidenza Jev, tempo di inferenza in ms, azioni del Tab Manager (🗂️) e registro eventi operativo.

---

## 📂 Struttura del Progetto

```text
Jev-project/
├── AVVIA-JEV.bat                # Launcher rapido con 1 click per Windows
├── package.json                 # Dipendenze e script npm
├── tsconfig.json                # Configurazione TypeScript
├── .env                         # Chiave API TypeSafe (TYPESAFE_API_KEY)
├── public/
│   └── index.html               # Interfaccia Web HUD (Microfono, Command Bar, Telemetria Jev, Log)
├── scripts/
│   ├── launch-desktop.ps1       # Bridge Win32 per creare processi su WinSta0\Default
│   └── set-volume.ps1           # Script PowerShell per regolazione volume master
└── src/
    ├── server.ts                # Server Express + WebSocket & orchestratore comandi con priorità
    ├── index.ts                 # CLI alternativa da terminale
    ├── services/
    │   ├── typesafe.ts          # Client TypeSafe Jev (Routing e Scelta Candidati)
    │   └── tabManager.ts        # Smart Voice Tab Manager (OPEN_NEW, CLOSE_TAB, SMART_SWITCH)
    └── executors/
        ├── browser.ts           # Automazione Chrome visibile via Playwright CDP & targeting schede
        └── windows.ts           # Automazione comandi e app native di Windows
```

---

## 🛠️ Cosa è Stato Implementato

1. **Smart Voice Tab Manager (Playwright + TypeSafe Jev)**:
   - Modulo TypeScript dedicato (`src/services/tabManager.ts`) per gestire l'intero ciclo di vita delle schede: apertura, switch euristico/semantico e chiusura.
   - **Estrazione Parallela Schede**: Lettura di titoli e URL tramite `Promise.all` con filtro `!page.isClosed()` e timeout di sicurezza a 800ms per non impattare la latenza.
   - **Gestione Dangling Reference**: Quando una scheda viene chiusa, il puntatore interno si riaggancia immediatamente all'ultima scheda rimanente portandola in primo piano.
   - **Targeting Isolato sulla Scheda Corrente**: La cache dei risultati cliccabili è legata all'URL della scheda attiva. I comandi *"clicca sul secondo risultato"* agiscono sempre sulla scheda a schermo, senza interferenze con schede aperte in precedenza.
2. **Priorità Assoluta di Routing**:
   - I comandi di cronologia (`torna indietro`, `vai avanti`, `ricarica`), i comandi di volume (`volume al...`) e i comandi multimediali vengono elaborati prima dell'euristica delle schede, evitando che espressioni come *"torna indietro"* aprano schede per errore.
3. **Risolto il problema del Desktop Nascosto (WinSta0 / Sandbox)**:
   - Creato `scripts/launch-desktop.ps1` che invoca l'API Win32 `OpenDesktop("Default")` e `SetThreadDesktop` per forzare l'apertura grafica sul monitor reale.
4. **Integrazione Chrome DevTools Protocol (CDP)**:
   - Chrome viene avviato con la porta di debug remoto (`--remote-debugging-port=9222`) e un profilo dedicato permanente (`JevDevProfile`).
   - Playwright si connette via `chromium.connectOverCDP`, garantendo il pieno controllo della finestra visibile senza confliggere con il Chrome personale già aperto.
5. **Selezione Ordinale su Google, YouTube e Amazon**:
   - Etichette ordinali in italiano (`1. [primo risultato]`, `2. [secondo risultato]`), consentendo a Jev di selezionare con precisione chirurgica comandi come *"clicca sul primo risultato"* o *"apri il secondo"*.
6. **Navigazione Cronologia (`Torna indietro`, `Vai avanti`, `Ricarica`)**:
   - Supporto a comandi di navigazione cronologica del browser: *"torna indietro"* (`p.goBack()`), *"vai avanti"* (`p.goForward()`), *"ricarica"* (`p.reload()`) eseguiti in meno di 50 ms.
7. **Bypass dei Timeout Pointer Events su YouTube & Cookie Banners**:
   - Superati i problemi di intercettazione click con navigazione diretta all'URL del video con fallback a click forzato e DOM evaluation.
8. **Interfaccia Web HUD Rinnovata**:
   - Navbar pulita (*Jev Browser Remote Controller*), box comandi centrale con supporto `Invio ↵`, footer con crediti e gestione completa degli eventi di telemetria WebSocket (`tab_manager_telemetry`).

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

### 5. Comandi Vocali Disponibili

Apri il browser su **`http://localhost:3000`**, attiva il microfono (o scrivi nella command bar):

#### 🗂️ Gestione Vocale Schede (Smart Tab Manager)
- *"Apri nuova tab e cerca scarpe su Amazon"* $\rightarrow$ Apre una nuova scheda con la ricerca Amazon.
- *"Nuova tab YouTube"* $\rightarrow$ Apre una nuova scheda su YouTube.
- *"Apri una nuova scheda GitHub"* $\rightarrow$ Apre una nuova scheda con GitHub.
- *"Passa alla scheda YouTube"* o *"Passa al video"* $\rightarrow$ Jev porta la scheda di YouTube in primo piano.
- *"Vai su GitHub"* $\rightarrow$ Se già aperta ci torna sopra, altrimenti la apre come fallback.
- *"Torna alla scheda di Amazon"* $\rightarrow$ Riporta la scheda Amazon attiva.
- *"Chiudi la scheda di YouTube"* $\rightarrow$ Chiude selettivamente la scheda di YouTube.
- *"Chiudi questa scheda"* $\rightarrow$ Chiude la scheda attualmente a schermo e riattiva quella rimasta.

#### 🔍 Ricerche Web
- *"Cercami Eminem su YouTube"* $\rightarrow$ Esegue la ricerca su YouTube.
- *"Cerca la ricetta della carbonara su Google"* $\rightarrow$ Cerca su Google.
- *"Prezzo cuffie Bluetooth su Amazon"* $\rightarrow$ Cerca su Amazon.it.
- *"Apri Wikipedia"* $\rightarrow$ Apre Wikipedia.

#### 🎯 Selezione e Click Autonomo (Sulla scheda corrente)
- *"Clicca su Lose Yourself"* $\rightarrow$ Individua il video su YouTube e lo avvia.
- *"Clicca sul primo video"* o *"Metti il secondo"* $\rightarrow$ Clicca per posizione su YouTube.
- *"Clicca sul primo risultato"* o *"Apri il secondo"* $\rightarrow$ Clicca per posizione su Google o Amazon.

#### 🔙 Navigazione Cronologia Browser
- *"Torna indietro"* $\rightarrow$ Torna alla pagina o ricerca precedente.
- *"Vai avanti"* $\rightarrow$ Avanza alla pagina successiva.
- *"Ricarica"* o *"Aggiorna"* $\rightarrow$ Ricarica la pagina attiva.

#### ⏯️ Controlli Multimediali
- *"Metti in pausa"* o *"Riprendi"* $\rightarrow$ Ferma/avvia la riproduzione.
- *"Schermo intero"* $\rightarrow$ Attiva/disattiva fullscreen.
- *"Muta"* $\rightarrow$ Silenzia/riattiva l'audio.

#### 💻 Comandi di Sistema Windows
- *"Apri Calcolatrice"* o *"Apri Blocco Note"* $\rightarrow$ Apre l'app nativa a schermo.
- *"Volume al 30%"* o *"Alza il volume"* $\rightarrow$ Modifica il volume di Windows.

---

## 🚀 Come Arricchire ed Estendere il Progetto

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

---

## 📄 Licenza
Progetto rilasciato sotto licenza MIT. Libero da utilizzare, estendere e personalizzare.
