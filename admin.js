/**
 * admin.js - Die ultimative Schaltzentrale für Spawn2909
 * Mission: Absolute Kontrolle über das Isekai-Nest
 */

// 1. GÖTTLICHE KONFIGURATION
const ADMIN_CONFIG = {
    BROADCASTER_ID: "573773653",
    styles: {
        success: "background: #00ff00; color: #000; padding: 5px; border-radius: 3px;",
        error: "background: #ff0000; color: #fff; padding: 5px; border-radius: 3px;"
    }
};

// 2. INITIALISIERUNG & ZUGRIFFSKONTROLLE
document.addEventListener("DOMContentLoaded", () => {
    checkAdminPrivileges();
});

function checkAdminPrivileges() {
    // Prüft, ob der User die Berechtigung hat (isAdmin muss global gesetzt sein)
    if (window.isAdmin || window.data?.userId === ADMIN_CONFIG.BROADCASTER_ID) {
        const hud = document.getElementById('adminHud');
        if (hud) hud.style.display = 'block';
        console.log("%c[ADMIN] Götter-Status verifiziert. Willkommen, Spawn2909.", ADMIN_CONFIG.styles.success);
    }
}

// 3. KERNFUNKTIONEN (GÖTTER-BEFEHLE)
const AdminActions = {
    
    // LXP vergeben
    giveLXP: function(amount) {
        if (typeof data !== 'undefined') {
            data.lxp += amount;
            this.notify(`Göttlicher Segen: +${amount} LXP gewährt.`);
            this.finalize();
        }
    },

    // Item-Beschwörung aus loot.js
    giveItem: function(itemID) {
        // Prüfen, ob das Item in der loot.js existiert (angenommen: window.lootTable)
        const lootSource = window.lootTable || window.allItems; 
        if (lootSource && lootSource[itemID]) {
            if (typeof window.addItemToInventory === 'function') {
                window.addItemToInventory(itemID);
                this.notify(`Item [${itemID}] erfolgreich beschworen!`);
                this.finalize();
            }
        } else {
            this.notify("Fehler: Item-ID nicht in der Welt-Datenbank gefunden.", true);
        }
    },

    // Evolution manuell setzen
    changeEvolution: function(newStage) {
        if (data) {
            data.evolutionStage = newStage;
            this.notify(`Realität gefaltet: Evolution auf [${newStage}] gesetzt.`);
            if (typeof renderEvoMenu === 'function') renderEvoMenu();
            this.finalize();
        }
    },

    // Welt-Editor Toggle
    toggleEditMode: function() {
        window.isEditMode = !window.isEditMode;
        const btn = document.getElementById('btnEditToggle');
        
        if (window.isEditMode) {
            btn.innerText = "EDIT-MODUS: AN";
            btn.style.background = "linear-gradient(135deg, #4ade80, #22c55e)";
            document.body.classList.add('admin-edit-active');
        } else {
            btn.innerText = "EDIT-MODUS: AUS";
            btn.style.background = ""; 
        }
        this.notify(`Edit-Modus: ${window.isEditMode ? 'AKTIVIERT' : 'DEAKTIVIERT'}`);
    },

    // Feedback & Speicherung
    finalize: function() {
        if (typeof window.save === 'function') window.save();
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        if (typeof renderUI === 'function') renderUI();
    },

    notify: function(msg, isError = false) {
        console.log(`%c[ADMIN] ${msg}`, isError ? ADMIN_CONFIG.styles.error : ADMIN_CONFIG.styles.success);
        // Optional: Ein kleines In-Game Toast-Feedback
        const log = document.getElementById('game-log'); // Falls vorhanden
        if (log) log.innerHTML += `<p style="color:gold;">[GOTT]: ${msg}</p>`;
    }
};

// 4. UI-GENERIERUNG (Das dynamische Panel)
function openAdminPanel() {
    const container = document.getElementById('modalLeftContainer');
    if (!container) return;

    // Erzeuge Item-Optionen aus der loot.js (falls vorhanden)
    let itemOptions = `<option value="">-- Item wählen --</option>`;
    if (window.lootTable) {
        Object.keys(window.lootTable).forEach(id => {
            itemOptions += `<option value="${id}">${window.lootTable[id].name || id}</option>`;
        });
    }

    container.innerHTML = `
        <div class="admin-console-content" style="font-family:'Courier New', monospace; color: gold;">
            <h2>🛠 GÖTTER-KONSOLE</h2>
            <div style="background: rgba(255,215,0,0.1); padding:15px; border:1px solid gold; border-radius:10px;">
                <p>Status: <b style="color:#4ade80;">GEBIETER</b></p>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <button class="btn-action" onclick="data.followDays+=30;AdminActions.finalize();">+30 Tage</button>
                    <button class="btn-action" onclick="AdminActions.giveLXP(5000)">+5000 LXP</button>
                </div>

                <hr style="border:0.5px solid gold; margin: 15px 0;">

                <h3>OBJEKT-BESCHWÖRUNG</h3>
                <select id="adminItemSelect" style="width:100%; background:#000; color:gold; border:1px solid gold; padding:5px;">
                    ${itemOptions}
                </select>
                <button class="btn-action" style="width:100%; margin-top:5px;" 
                        onclick="AdminActions.giveItem(document.getElementById('adminItemSelect').value)">
                    GEGENSTAND GEWÄHREN
                </button>

                <hr style="border:0.5px solid gold; margin: 15px 0;">

                <h3>WELT-EDITOR</h3>
                <button class="btn-action" id="btnEditToggle" onclick="AdminActions.toggleEditMode()">
                    EDIT-MODUS: ${window.isEditMode ? 'AN' : 'AUS'}
                </button>
                <p style="font-size:11px; color:#aaa; margin-top:10px;">
                    Gebäude ziehen: Verschieben | Shift + Ziehen: Skalieren
                </p>
                
                <button class="btn-action" style="background: #444; width:100%; margin-top:20px;" 
                        onclick="AdminActions.finalize()">
                    ☁ MANUELLES CLOUD-BACKUP
                </button>
            </div>
        </div>
    `;
}

// Globaler Shortcut für schnelle Korrekturen (Level-Cheat)
window.adminAddLevel = (amount) => {
    if (data) {
        data.level = (data.level || 0) + amount;
        AdminActions.notify(`Level auf ${data.level} erhöht.`);
        AdminActions.finalize();
    }
};
