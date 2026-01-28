/**
 * admin.js - Die absolute Kontrollinstanz für Spawn2909
 * Mission: Direkte Manipulation des globalen data-Objekts
 */

const AdminConsole = {
    // 1. GÖTTER-BEFEHLE (Direkte Daten-Manipulation)
    
    // LXP vergeben
    giveLXP: function(amount) {
        if (typeof data !== 'undefined') {
            data.lxp += parseInt(amount);
            this.sync(`Segen erteilt: +${amount} LXP.`);
        }
    },

    // Level direkt setzen
    setLevel: function(amount) {
        if (typeof data !== 'undefined' && data.stats) {
            data.stats.currentLevel += parseInt(amount);
            this.sync(`Macht gesteigert: +${amount} Level.`);
        }
    },

    // Evolution manuell ändern
    changeEvolution: function(newStage) {
        if (typeof data !== 'undefined' && data.stats) {
            data.stats.className = newStage;
            this.sync(`Realität gefaltet: Klasse auf [${newStage}] gesetzt.`);
        }
    },

    // Item-Beschwörung (Greift auf loot.js & inventar.js zu)
    spawnItem: function(itemID) {
        if (!itemID) return;
        // Prüfung ob globaler Inventar-Handler existiert
        if (typeof window.addItemToInventory === 'function') {
            window.addItemToInventory(itemID);
            this.sync(`Gegenstand [${itemID}] aus dem Nichts erschaffen.`);
        } else {
            // Fallback: Direkt in das data-Objekt
            data.inventar = data.inventar || {};
            data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;
            this.sync(`Item ${itemID} direkt ins Datenpaket geschrieben.`);
        }
    },

    // Welt-Editor Toggle
    toggleEditMode: function() {
        window.isEditMode = !window.isEditMode;
        const btn = document.getElementById('btnEditToggle');
        if (btn) {
            btn.innerText = window.isEditMode ? "EDIT-MODUS: AN" : "EDIT-MODUS: AUS";
            btn.style.boxShadow = window.isEditMode ? "0 0 15px #4ade80" : "none";
        }
        console.log(`[Admin] Edit-Modus: ${window.isEditMode}`);
    },

    // 2. SYNCHRONISATION (Speichern & UI Update)
    sync: function(msg) {
        console.log(`%c[GOTT]: ${msg}`, "color: gold; font-weight: bold; background: #000; padding: 2px 5px;");
        
        // Triggert die Funktionen aus der Master-HTML
        if (typeof save === 'function') save(); 
        if (typeof updateUI === 'function') updateUI();
        
        // Falls vorhanden, Firebase-AutoSave forcieren
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
    }
};

// 3. UI-GENERIERUNG (Wird in modalLeft gerendert)
function openAdminPanel() {
    const modal = document.getElementById('gameModal');
    const container = document.getElementById('modalLeft');
    
    if (!modal || !container) return;

    // Item-Dropdown generieren (aus loot.js)
    let itemOptions = `<option value="">-- Item wählen --</option>`;
    if (window.lootTable) {
        Object.keys(window.lootTable).forEach(id => {
            itemOptions += `<option value="${id}">${window.lootTable[id].name || id}</option>`;
        });
    }

    container.innerHTML = `
        <div style="font-family: 'Courier New', monospace; color: gold; padding: 10px;">
            <h1 style="text-shadow: 0 0 10px red; border-bottom: 2px solid gold;">🛠 GÖTTER-KONSOLE</h1>
            <p>Eingeloggt als: <span style="color:#4ade80;">OVERLORD</span></p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
                <button class="btn-action" onclick="AdminConsole.giveLXP(5000)">+5000 LXP</button>
                <button class="btn-action" onclick="AdminConsole.setLevel(30)">+30 LEVEL</button>
                <button class="btn-action" onclick="data.followDays += 30; AdminConsole.sync('+30 Tage Follower-Zeit');">+30 TAGE</button>
                <button class="btn-action" id="btnEditToggle" onclick="AdminConsole.toggleEditMode()">EDIT-MODUS: AUS</button>
            </div>

            <hr style="border: 1px solid #444; margin: 20px 0;">

            <h3>WELTEN-MANIPULATION</h3>
            <div style="display: flex; gap: 10px; flex-direction: column;">
                <label>Item beschwören:</label>
                <select id="adminItemSelect" style="background:#111; color:gold; border:1px solid gold; padding:8px;">
                    ${itemOptions}
                </select>
                <button class="btn-action" onclick="AdminConsole.spawnItem(document.getElementById('adminItemSelect').value)">GEGENSTAND GEWÄHREN</button>
            </div>

            <div style="margin-top: 20px;">
                <label>Evolutions-Stufe erzwingen:</label>
                <input type="text" id="evoInput" placeholder="Klassenname..." style="width:100%; background:#111; color:gold; border:1px solid gold; padding:5px; margin-top:5px;">
                <button class="btn-action" style="width:100%; margin-top:5px;" onclick="AdminConsole.changeEvolution(document.getElementById('evoInput').value)">EVOLUTION AUSLÖSEN</button>
            </div>

            <button class="btn-action" style="width:100%; margin-top:30px; background: #444;" onclick="AdminConsole.sync('Manueller Cloud-Sync')">💾 FORCIERE CLOUD-SPEICHERUNG</button>
        </div>
    `;

    modal.style.display = 'flex';
}

// Globaler Hilfs-Befehl für die Konsole
window.adminAddLevel = (n) => AdminConsole.setLevel(n);
