/**
 * admin.js - Die absolute Kontrollinstanz für Spawn2909
 * Fokus: Rekursiver Deep-Scan der ITEM_DATABASE & Multi-Level Sortierung
 */

const AdminConsole = {
    // 1. INTERNE HILFSFUNKTIONEN
    
    /**
     * Durchleuchtet die ITEM_DATABASE rekursiv und extrahiert alle Items mit einer ID.
     */
    flattenDatabase: function(obj) {
        let items = [];
        for (let key in obj) {
            if (obj[key] !== null && typeof obj[key] === 'object') {
                // Wenn das Objekt eine ID hat, ist es ein Item
                if (obj[key].id) {
                    items.push(obj[key]);
                } else {
                    // Ansonsten tiefer graben (rekursiv)
                    items = items.concat(this.flattenDatabase(obj[key]));
                }
            }
        }
        return items;
    },

    // 2. GÖTTER-BEFEHLE
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
            this.sync(`Realität gefaltet: Evolution auf [${newStage}] gesetzt.`);
        }
    },

    spawnItem: function(itemID) {
        if (!itemID) return;
        if (!data.inventar) data.inventar = {};
        
        data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;

        // Namen für das Feedback finden
        const itemData = (typeof getItemById === 'function') ? getItemById(itemID) : null;
        this.sync(`Item [${itemData ? itemData.name : itemID}] beschworen.`);
    },

    // 3. LISTEN-GENERATOR (Flatten, Sort & Render)
    updateAdminItemSpawner: function() {
        const container = document.getElementById('admin-item-grid');
        if (!container) return;

        if (typeof ITEM_DATABASE === 'undefined') {
            container.innerHTML = `<p style="color:orange; animation: pulse 1s infinite;">Lade Warenlager...</p>`;
            setTimeout(() => this.updateAdminItemSpawner(), 1000);
            return;
        }

        // Schritt 1: Datenbank flachklopfen
        let flatItems = this.flattenDatabase(ITEM_DATABASE);

        // Schritt 2: Sortierung (Primär: evoReq, Sekundär: levelReq)
        flatItems.sort((a, b) => {
            if (a.evoReq !== b.evoReq) return a.evoReq - b.evoReq;
            return a.levelReq - b.levelReq;
        });

        // Schritt 3: HTML generieren
        let html = `<div style="display: grid; grid-template-columns: 1fr; gap: 5px; max-height: 300px; overflow-y: auto; padding-right: 10px; border: 1px solid rgba(255,215,0,0.3); padding: 5px; background: rgba(0,0,0,0.3);">`;
        
        flatItems.forEach(item => {
            const rarityColor = item.rarity === 'legendary' ? '#ff4500' : (item.rarity === 'Follower' ? '#ffd700' : '#ffffff');
            const typeTag = item.type ? `[${item.type}]` : '[Item]';
            const evoTag = `(Evo ${item.evoReq || 0})`;

            html += `
                <button class="btn-action" 
                        style="font-size: 11px; padding: 8px; border-color: ${rarityColor}; text-align: left; display: flex; justify-content: space-between; align-items: center;" 
                        onclick="AdminConsole.spawnItem('${item.id}')">
                    <span><b style="color:${rarityColor}">${typeTag}</b> ${item.name}</span>
                    <span style="color:#aaa; font-size: 9px;">${evoTag}</span>
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

    // 4. SYNCHRONISATION
    sync: function(msg) {
        console.log(`%c[GOTT]: ${msg}`, "color: gold; font-weight: bold; background: #000; padding: 2px 5px;");
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        else if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        
        const feedback = document.getElementById('admin-feedback');
        if (feedback) {
            feedback.innerText = msg;
            setTimeout(() => { feedback.innerText = ""; }, 3000);
        }
    }
};

// 5. UI-OPENER
function openAdminPanel() {
    const modal = document.getElementById('gameModal');
    const container = document.getElementById('modalLeft');
    if (!modal || !container) return;

    container.innerHTML = `
        <div style="font-family: 'Courier New', monospace; color: gold; padding: 10px;">
            <h1 style="text-shadow: 0 0 10px red; border-bottom: 2px solid gold; margin-bottom: 5px;">🛠 GÖTTER-KONSOLE</h1>
            <div id="admin-feedback" style="height: 20px; color: #4ade80; font-size: 12px; font-weight: bold; text-align: center;"></div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                <button class="btn-action" onclick="AdminConsole.giveLXP(5000)">+5000 LXP</button>
                <button class="btn-action" onclick="AdminConsole.setLevel(30)">+30 LEVEL</button>
                <button class="btn-action" id="btnEditToggle" onclick="AdminConsole.toggleEditMode()">EDIT-MODUS: AUS</button>
                <button class="btn-action" style="background: #444;" onclick="AdminConsole.sync('Manueller Cloud-Sync')">☁ CLOUD SAVE</button>
            </div>

            <hr style="border: 1px solid #444; margin: 15px 0;">

            <h3 style="margin-bottom: 10px;">📦 WARENLAGER (Sortiert nach Evolution)</h3>
            <div id="admin-item-grid"></div>

            <div style="margin-top: 15px;">
                <label>Evolution erzwingen:</label>
                <input type="text" id="evoInput" placeholder="z.B. Höheres Wesen" style="width:100%; background:#111; color:gold; border:1px solid gold; padding:8px; margin-top:5px;">
                <button class="btn-action" style="width:100%; margin-top:5px;" onclick="AdminConsole.changeEvolution(document.getElementById('evoInput').value)">STRUKTUR ÄNDERN</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    AdminConsole.updateAdminItemSpawner();
}
