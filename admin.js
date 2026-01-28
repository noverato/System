/**
 * admin.js - Die absolute Kontrollinstanz für Spawn2909
 * Fokus: Integration der ITEM_DATABASE & Cloud-Sync
 */

const AdminConsole = {
    // 1. GÖTTER-BEFEHLE
    giveLXP: function(amount) {
        if (typeof data !== 'undefined') {
            data.lxp += parseInt(amount);
            this.sync(`Segen erteilt: +${amount} LXP.`);
        }
    },

    setLevel: function(amount) {
        if (typeof data !== 'undefined' && data.stats) {
            data.stats.currentLevel += parseInt(amount);
            this.sync(`Macht gesteigert: +${amount} Level.`);
        }
    },

    changeEvolution: function(newStage) {
        if (typeof data !== 'undefined' && data.stats) {
            data.stats.className = newStage;
            this.sync(`Realität gefaltet: Klasse auf [${newStage}] gesetzt.`);
        }
    },

    // 2. ITEM-BESCHWÖRUNG (Neu: Integration items.js)
    spawnItem: function(itemID) {
        if (!itemID) return;

        // Nutze die Funktion aus items.js falls vorhanden
        const itemData = (typeof getItemById === 'function') ? getItemById(itemID) : null;
        const itemName = itemData ? itemData.name : itemID;

        // Sicherstellen, dass das Inventar-Array existiert
        if (!data.inventar) data.inventar = {};
        
        // Hinzufügen (Logik: Erhöhe Anzahl oder setze auf 1)
        data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;

        this.sync(`Item [${itemName}] erfolgreich beschworen.`);
    },

    // 3. LISTEN-GENERATOR (Dynamische UI)
    updateAdminItemSpawner: function() {
        const container = document.getElementById('admin-item-grid');
        if (!container) return;

        // Prüfen ob Datenbank geladen ist
        if (typeof ITEM_DATABASE === 'undefined') {
            container.innerHTML = `<p style="color:orange; animation: pulse 1s infinite;">Lade Warenlager...</p>`;
            // Erneuter Versuch in 1 Sekunde
            setTimeout(() => this.updateAdminItemSpawner(), 1000);
            return;
        }

        let html = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; max-height: 200px; overflow-y: auto; padding-right: 5px;">`;
        
        Object.keys(ITEM_DATABASE).forEach(id => {
            const item = ITEM_DATABASE[id];
            const color = item.rarity === 'legendary' ? '#ff4500' : '#ffd700';
            html += `
                <button class="btn-action" 
                        style="font-size: 10px; padding: 5px; border-color: ${color}; text-align: left;" 
                        onclick="AdminConsole.spawnItem('${id}')">
                    + ${item.name || id}
                </button>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    },

    toggleEditMode: function() {
        window.isEditMode = !window.isEditMode;
        const btn = document.getElementById('btnEditToggle');
        if (btn) {
            btn.innerText = window.isEditMode ? "EDIT-MODUS: AN" : "EDIT-MODUS: AUS";
            btn.style.boxShadow = window.isEditMode ? "0 0 15px #4ade80" : "none";
        }
    },

    // 4. SYNCHRONISATION (Greift auf storage.js zu)
    sync: function(msg) {
        console.log(`%c[GOTT]: ${msg}`, "color: gold; font-weight: bold; background: #000; padding: 2px 5px;");
        
        // UI im HUD sofort aktualisieren
        if (typeof updateUI === 'function') updateUI();
        
        // Speichern in LocalStorage & Firebase (via storage.js / master-save)
        if (typeof save === 'function') {
            save(); 
        } else if (typeof window.triggerAutoSave === 'function') {
            window.triggerAutoSave();
        }
        
        // Optionales visuelles Feedback im Admin-Panel
        const feedback = document.getElementById('admin-feedback');
        if (feedback) {
            feedback.innerText = msg;
            setTimeout(() => { feedback.innerText = ""; }, 3000);
        }
    }
};

// 5. UI-GENERIERUNG
function openAdminPanel() {
    const modal = document.getElementById('gameModal');
    const container = document.getElementById('modalLeft');
    
    if (!modal || !container) return;

    container.innerHTML = `
        <div style="font-family: 'Courier New', monospace; color: gold; padding: 10px;">
            <h1 style="text-shadow: 0 0 10px red; border-bottom: 2px solid gold; margin-bottom: 5px;">🛠 GÖTTER-KONSOLE</h1>
            <div id="admin-feedback" style="height: 20px; color: #4ade80; font-size: 12px; font-weight: bold;"></div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                <button class="btn-action" onclick="AdminConsole.giveLXP(5000)">+5000 LXP</button>
                <button class="btn-action" onclick="AdminConsole.setLevel(30)">+30 LEVEL</button>
                <button class="btn-action" id="btnEditToggle" onclick="AdminConsole.toggleEditMode()">EDIT-MODUS: AUS</button>
                <button class="btn-action" style="background: #444;" onclick="AdminConsole.sync('Cloud-Sync erzwungen')">☁ CLOUD SAVE</button>
            </div>

            <hr style="border: 1px solid #444; margin: 15px 0;">

            <h3>📦 ITEM-WARENLAGER (Klicken zum Beschwören)</h3>
            <div id="admin-item-grid">
                </div>

            <div style="margin-top: 15px;">
                <label>Evolutions-Stufe erzwingen:</label>
                <input type="text" id="evoInput" placeholder="Klassenname..." style="width:100%; background:#111; color:gold; border:1px solid gold; padding:5px; margin-top:5px;">
                <button class="btn-action" style="width:100%; margin-top:5px;" onclick="AdminConsole.changeEvolution(document.getElementById('evoInput').value)">EVOLUTION SETZEN</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    // Starte den Listen-Generator
    AdminConsole.updateAdminItemSpawner();
}

window.adminAddLevel = (n) => AdminConsole.setLevel(n);
