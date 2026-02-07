/**
 * THE NEST – Mining System (Overlord Balance)
 * Design: Gewichtetes Mining + Erschöpfung + Anti-Outplay
 */

// ==========================
// ⚙️ BALANCE KONFIGURATION
// ==========================
const MINING_CONFIG = {
    maxEffectiveHits: 3,          // Gute Hits
    softCapHits: 6,               // Ab hier starke Erschöpfung
    hardCapHits: 9,               // Danach fast nichts mehr
    fatigueRecoveryMin: 45000,    // 45s
    fatigueRecoveryMax: 90000     // 90s (NICHT vorhersehbar!)
};

// ==========================
// 🧠 SESSION STATE
// ==========================
let miningSession = {
    hits: 0,
    fatigue: 0,
    nextRecovery: Date.now() + randomRecoveryTime()
};

// ==========================
// ⏱️ HILFSFUNKTION
// ==========================
function randomRecoveryTime() {
    return Math.floor(
        MINING_CONFIG.fatigueRecoveryMin +
        Math.random() * (MINING_CONFIG.fatigueRecoveryMax - MINING_CONFIG.fatigueRecoveryMin)
    );
}

// ==========================
// ⛏️ UI
// ==========================
function renderMiningMenu(targetId = 'modalLeft') {
    const container = document.getElementById(targetId);
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <h2 style="color:var(--gold);">⛏️ Der Steinbruch</h2>
            <p style="color:#aaa;font-style:italic;">Der Fels merkt sich jeden Schlag…</p>

            <div id="mining-area"
                 onclick="mineAction('${targetId}')"
                 style="margin:30px auto;width:180px;height:180px;
                 background:rgba(0,0,0,0.4);border:3px double var(--gold);
                 border-radius:50%;display:flex;align-items:center;
                 justify-content:center;font-size:60px;cursor:pointer;">
                ⛏️
            </div>

            <button class="btn-action" onclick="mineAction('${targetId}')">ZUSCHLAGEN</button>

            <div id="mining-log_${targetId}"
                 style="margin-top:30px;height:150px;overflow-y:auto;
                 background:rgba(20,15,10,0.85);padding:15px;
                 border-radius:10px;border:1px solid var(--gold);
                 font-family:monospace;font-size:14px;">
                <div style="color:#888;">> Der Fels ist still…</div>
            </div>
        </div>
    `;
}

// ==========================
// 🪓 KERNLOGIK
// ==========================
function mineAction(targetId = 'modalLeft') {
    const now = Date.now();

    // 🧠 Regeneration (NICHT planbar!)
    if (now >= miningSession.nextRecovery) {
        miningSession.hits = Math.max(0, miningSession.hits - 2);
        miningSession.fatigue = Math.max(0, miningSession.fatigue - 1);
        miningSession.nextRecovery = now + randomRecoveryTime();
    }

    miningSession.hits++;
    miningSession.fatigue++;

    // 💀 Hard Cap – fast nichts mehr
    if (miningSession.hits > MINING_CONFIG.hardCapHits) {
        addMiningLog("🪨 Der Fels gibt nichts mehr her…", "#666", targetId);
        return;
    }

    // ⚠️ Soft Cap – stark reduziert
    if (miningSession.hits > MINING_CONFIG.softCapHits) {
        if (Math.random() < 0.15) {
            giveStone(targetId);
        } else {
            addMiningLog("⛏️ Nur Staub…", "#777", targetId);
        }
        return;
    }

    // ✅ Effektive Hits
    if (miningSession.hits <= MINING_CONFIG.maxEffectiveHits) {
        rollWeightedLoot(targetId);
    } else {
        if (Math.random() < 0.35) {
            giveStone(targetId);
        } else {
            addMiningLog("⛏️ Der Schlag hallt leer wider…", "#777", targetId);
        }
    }
}

// ==========================
// 🎲 GEWICHTETER LOOT
// ==========================
function rollWeightedLoot(targetId = 'modalLeft') {
    const roll = Math.random();

    if (roll < 0.70) return giveStone(targetId);
    if (roll < 0.88) return giveIron(targetId);
    if (roll < 0.96) return giveLXP(targetId);
    if (roll < 0.99) return giveGold(targetId);

    addMiningLog("✨ Ein seltener Glanz… doch nichts bleibt.", "#999", targetId);
}

// ==========================
// 🎁 LOOT FUNKTIONEN
// ==========================
function giveStone(targetId = 'modalLeft') {
    addToInventory("res_stein", 1);
    addMiningLog("🪨 Stein gefunden", "var(--gold)", targetId);
}

function giveIron(targetId = 'modalLeft') {
    addToInventory("res_eisen", 1);
    addMiningLog("⛓️ Eisen entdeckt", "#aaa", targetId);
}

function giveGold(targetId = 'modalLeft') {
    addToInventory("res_gold", 1);
    addMiningLog("🟡 GOLD-ERZ!", "#ffd700", targetId);
}

function giveLXP(targetId = 'modalLeft') {
    data.lxp += 3;
    addMiningLog("💎 LXP absorbiert (+3)", "#3b82f6", targetId);
}

// ==========================
// 📦 INVENTAR
// ==========================
function addToInventory(id, amount) {
    if (!data.inventar) data.inventar = {};
    data.inventar[id] = (data.inventar[id] || 0) + amount;
    if (typeof save === "function") save();
    if (typeof updateUI === "function") updateUI();
}

// ==========================
// 📜 LOG
// ==========================
function addMiningLog(msg, color, targetId = 'modalLeft') {
    const log = document.getElementById(`mining-log_${targetId}`);
    if (!log) return;

    const entry = document.createElement("div");
    entry.style.color = color;
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.prepend(entry);
}

window.renderMiningMenu = renderMiningMenu;
window.mineAction = mineAction;
function simpleGather(area) {
    const pools = {
        wald: ["res_stock", "res_gras", "res_kraeuter", "res_schleimkern"],
        steinbruch: ["res_stein"]
    };
    const list = pools[area] || pools.wald;
    const id = list[Math.floor(Math.random() * list.length)];
    const qty = 1 + Math.floor(Math.random() * 2);
    addToInventory(id, qty);
    
    const meta = (typeof window.getItemById === "function") ? window.getItemById(id) : { name: id, emoji: "📦" };
    addMiningLog(`${meta.emoji || "📦"} ${meta.name || id} +${qty}`, "var(--gold)");
}
window.simpleGather = simpleGather;
