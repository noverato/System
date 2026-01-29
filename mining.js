/**
 * Mining-System für "The Nest"
 * Spezialist: Buddy 11 (Der Gräber-Buddy)
 * Logik: ID-basierte Funde für nahtlose Inventar-Integration.
 */

// Konfiguration der Fundraten mit eindeutigen IDs
const MINING_LOOT_TABLE = [
    { id: "res_stein", name: "Stein", emoji: "🪨", chance: 0.55, amount: 1, type: "resource" },
    { id: "res_eisen", name: "Eisen", emoji: "⛓️", chance: 0.18, amount: 1, type: "resource" },
    { id: "res_gold", name: "Gold-Erz", emoji: "🟡", chance: 0.04, amount: 1, type: "resource" },
    { id: "lxp_shard", name: "LXP-Splitter", emoji: "💎", chance: 0.03, amount: 5, type: "lxp" }
];

// Summe = 0.80 → 20 %: „Nichts gefunden“

/**
 * Erstellt das Mining-Interface im modalLeft
 */
function renderMiningMenu() {
    const container = document.getElementById('modalLeft');
    
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #fdf5e6;">
            <h2 style="color: var(--gold); text-shadow: var(--shadow);">⛏️ Der Steinbruch</h2>
            <p style="font-style: italic; color: #aaa;">"Die Spitzhacke singt das Lied der Erde..."</p>
            
            <div id="mining-area" style="margin: 30px auto; width: 180px; height: 180px; background: rgba(0,0,0,0.4); border: 3px double var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 60px; cursor: pointer; transition: transform 0.1s; user-select: none;" 
                 onclick="mineAction()">
                ⛏️
            </div>

            <button class="btn-action" style="font-size: 1.2rem; width: 250px; height: 50px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" onclick="mineAction()">ZUSCHLAGEN!</button>

            <div id="mining-log" style="margin-top: 30px; height: 150px; overflow-y: auto; background: rgba(20,15,10,0.8); padding: 15px; border-radius: 10px; border: 1px solid var(--gold); text-align: left; font-family: 'Courier New', monospace; font-size: 14px; box-shadow: inset 0 0 10px #000;">
                <div style="color: #888;">> Glück auf, Abenteurer!</div>
            </div>
        </div>
    `;
}

/**
 * Kern-Logik des Abbaus
 */
function mineAction() {
    const miningArea = document.getElementById('mining-area');
    
    // Visueller Kickback
    miningArea.style.transform = "scale(0.85) rotate(-10deg)";
    setTimeout(() => miningArea.style.transform = "scale(1) rotate(0deg)", 100);

    const rand = Math.random();
    let cumulativeChance = 0;
    let foundItem = null;

    for (const item of MINING_LOOT_TABLE) {
        cumulativeChance += item.chance;
        if (rand < cumulativeChance) {
            foundItem = item;
            break;
        }
    }

    if (foundItem) {
        processMiningReward(foundItem);
    } else {
        addMiningLog("Klong! Nur Staub und Splitter.", "#777");
    }
}

/**
 * Verarbeitet den Fund und schreibt ihn in die globale Datenstruktur
 */
function processMiningReward(item) {
    if (item.type === "lxp") {
        // LXP wird direkt dem Spieler-Konto gutgeschrieben
        data.lxp += item.amount;
        addMiningLog(`MAGISCH: +${item.amount} LXP absorbiert! ${item.emoji}`, "#3b82f6");
    } else {
        // Sicherstellen, dass das Inventar existiert
        if (!data.inventar) data.inventar = {};
        
        // Nutze die ID als Key für das Inventar-Objekt (Wichtig für Buddy 8!)
        data.inventar[item.id] = (data.inventar[item.id] || 0) + item.amount;
        
        addMiningLog(`GEFUNDEN: ${item.amount}x ${item.name} ${item.emoji}`, "var(--gold)");
    }

    // UI-Refresh und Cloud-Sync
    if (typeof updateUI === 'function') updateUI();
    if (typeof save === 'function') save();
}

/**
 * Schreibt Nachrichten in das Mining-Log
 */
function addMiningLog(msg, color) {
    const log = document.getElementById('mining-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.style.color = color;
    entry.style.marginBottom = "4px";
    entry.style.borderBottom = "1px solid rgba(255,215,0,0.1)";
    entry.innerHTML = `<span style="color: #555;">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    
    log.prepend(entry);
}
