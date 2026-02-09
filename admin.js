/**
 * admin.js - Die absolute Kontrollinstanz für Spawn2909
 * Fokus: Rekursiver Deep-Scan der ITEM_DATABASE & Welt-Editor (Drag, Drop & Scale)
 * Status: STABILITÄTS-MASTER V1.0 (Versiegelt 2026)
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
                if (obj[key].id) {
                    items.push(obj[key]);
                } else {
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

    setPowerLevel: function(level) {
        localStorage.setItem('adminPowerLevel', level);
        window.adminPowerLevel = level;
        
        // UI Feedback für Buttons
        ['easy', 'normal', 'hard', 'god'].forEach(l => {
            const btn = document.getElementById(`btn-power-${l}`);
            if (btn) {
                btn.style.border = (l === level) ? '2px solid #4ade80' : '1px solid gold';
                btn.style.boxShadow = (l === level) ? '0 0 10px #4ade80' : 'none';
            }
        });

        const labels = {
            'easy': 'Einfach (Fair)',
            'normal': 'Normal (+50%)',
            'hard': 'Schwer (Raid-Boss)',
            'god': 'Gott-Modus (One-Hit)'
        };
        this.sync(`Macht-Stufe: ${labels[level]}`);
    },

    spawnItem: function(itemID) {
        if (!itemID) return;
        if (!data.inventar) data.inventar = {};
        data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;
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

        let flatItems = this.flattenDatabase(ITEM_DATABASE);
        flatItems.sort((a, b) => {
            if (a.evoReq !== b.evoReq) return a.evoReq - b.evoReq;
            return a.levelReq - b.levelReq;
        });

        let html = `<div style="display: grid; grid-template-columns: 1fr; gap: 5px; max-height: 300px; overflow-y: auto; padding-right: 10px; border: 1px solid rgba(255,215,0,0.3); padding: 5px; background: rgba(0,0,0,0.3);">`;
        
        flatItems.forEach(item => {
            const rarityColor = item.rarity === 'legendary' ? '#ff4500' : (item.rarity === 'Follower' ? '#ffd700' : '#ffffff');
            const typeTag = item.type ? `[${item.type}]` : '[Item]';
            const evoTag = `(Evo ${item.evoReq || 0})`;

            html += `
                <button class="btn-action" 
                        style="font-size: 11px; padding: 8px; border-color: ${rarityColor}; text-align: left; display: flex; justify-content: space-between; align-items: center;" 
                        data-action="adminAction" data-args='["spawnItem", "${item.id}"]'>
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
        
        document.querySelectorAll('.building').forEach(b => {
            b.classList.toggle('editing', window.isEditMode);
        });
    },

    startHouseCalibration: function() {
        const graphics = window.FPGraphics;
        const player = window.avatar;

        if (!graphics || !player) {
            this.sync(`FPGraphics (${!!graphics}) oder Avatar (${!!player}) nicht gefunden.`);
            return;
        }

        const success = graphics.selectNearestHouse(player.position.x, player.position.z);
        if (success) {
            document.getElementById('calibration-controls').style.display = 'block';
            this.sync("Haus zur Kalibrierung ausgewählt. Nutze die Regler!");
        } else {
            this.sync("Kein Haus in der Nähe gefunden.");
        }
    },

    updateCalibration: function(key, value) {
        const val = parseFloat(value);
        const el = document.getElementById(`val-${key}`);
        if (el) el.innerText = val.toFixed(2);
        
        const params = {};
        params[key] = val;
        
        if (window.FPGraphics) {
            window.FPGraphics.updateCalibration(params);
        }
    },

    setHouseModel: function(modelType) {
        if (!window.FPGraphics) return;
        
        // Wir setzen einen speziellen Kalibrierungsparameter
        window.FPGraphics.updateCalibration({ houseModel: modelType });
        this.sync(`Haus-Modell auf ${modelType.toUpperCase()} gesetzt.`);
        
        // UI Feedback
        console.log(`[GOTT] Modell-Wechsel angefordert: ${modelType}`);
    },

    exportCalibration: function() {
        const keys = ['overallScale', 'targetWidth', 'targetDepth', 'wallScaleW', 'wallScaleD', 'roofScaleY', 'gableScaleY', 'wallY', 'roofY', 'offsetX', 'offsetY', 'offsetZ'];
        const results = {};
        keys.forEach(k => {
            const el = document.getElementById(`val-${k}`);
            if (el) results[k] = parseFloat(el.innerText);
        });

        const json = JSON.stringify(results, null, 4);
        console.log("%c[GOTT] GOLDENE WERTE EXPORTIERT:", "color: #059669; font-weight: bold; font-size: 14px;");
        console.log(json);
        
        navigator.clipboard.writeText(json).then(() => {
            this.sync("Goldene Werte in Konsole & Zwischenablage kopiert!");
        });
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
            
            <div style="margin-bottom: 15px;">
                <h3 style="margin-bottom: 8px; font-size: 14px;">⚔️ ADMIN-POWER-LEVEL</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <button class="btn-action" id="btn-power-easy" data-action="adminAction" data-args='["setPowerLevel", "easy"]' style="font-size: 10px;">EINFACH</button>
                    <button class="btn-action" id="btn-power-normal" data-action="adminAction" data-args='["setPowerLevel", "normal"]' style="font-size: 10px;">NORMAL</button>
                    <button class="btn-action" id="btn-power-hard" data-action="adminAction" data-args='["setPowerLevel", "hard"]' style="font-size: 10px;">SCHWER</button>
                    <button class="btn-action" id="btn-power-god" data-action="adminAction" data-args='["setPowerLevel", "god"]' style="font-size: 10px;">GOTT</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                <button class="btn-action" data-action="adminAction" data-args='["giveLXP", 5000]'>+5000 LXP</button>
                <button class="btn-action" data-action="adminAction" data-args='["setLevel", 30]'>+30 LEVEL</button>
                <button class="btn-action" id="btnEditToggle" data-action="adminAction" data-args='["toggleEditMode"]'>EDIT-MODUS: AUS</button>
                <button class="btn-action" style="background: #444;" data-action="adminAction" data-args='["sync", "Manueller Cloud-Sync"]'>☁ CLOUD SAVE</button>
            </div>

            <hr style="border: 1px solid #444; margin: 15px 0;">

            <h3 style="margin-bottom: 10px;">🏠 HAUS-KALIBRIERUNG (GOLDENE WERTE)</h3>
            <div style="background: rgba(0,0,0,0.5); padding: 10px; border: 1px solid gold; font-size: 11px;">
                <button class="btn-action" data-action="adminAction" data-args='["startHouseCalibration"]' style="width:100%; margin-bottom:10px; background: #b45309;">NÄCHSTES HAUS AUSWÄHLEN</button>
                
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #555;">
                    <label style="color: gold; display: block; margin-bottom: 5px;">Haus-Modell wechseln:</label>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-action" data-action="adminAction" data-args='["setHouseModel", "modular"]' style="flex:1; font-size: 11px;">MODULAR</button>
                        <button class="btn-action" data-action="adminAction" data-args='["setHouseModel", "house1"]' style="flex:1; font-size: 11px; background: #4338ca;">HOUSE_1</button>
                    </div>
                </div>

                <div id="calibration-controls" style="display: none;">
                    <div style="margin-bottom: 5px;">
                        <label>Gesamt-Skalierung (overallScale): <span id="val-overallScale">6.0</span></label>
                        <input type="range" min="1" max="15" step="0.1" value="6.0" data-admin-cal="overallScale" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Fundament Breite (targetWidth): <span id="val-targetWidth">6.5</span></label>
                        <input type="range" min="2" max="15" step="0.1" value="6.5" data-admin-cal="targetWidth" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Fundament Tiefe (targetDepth): <span id="val-targetDepth">6.5</span></label>
                        <input type="range" min="2" max="15" step="0.1" value="6.5" data-admin-cal="targetDepth" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Wand-Streckung B (wallScaleW): <span id="val-wallScaleW">1.6</span></label>
                        <input type="range" min="0.5" max="4" step="0.05" value="1.6" data-admin-cal="wallScaleW" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Wand-Streckung T (wallScaleD): <span id="val-wallScaleD">1.6</span></label>
                        <input type="range" min="0.5" max="4" step="0.05" value="1.6" data-admin-cal="wallScaleD" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Dach Höhe (roofScaleY): <span id="val-roofScaleY">1.3</span></label>
                        <input type="range" min="0.1" max="5" step="0.1" value="1.3" data-admin-cal="roofScaleY" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Giebel Höhe (gableScaleY): <span id="val-gableScaleY">1.3</span></label>
                        <input type="range" min="0.1" max="5" step="0.1" value="1.3" data-admin-cal="gableScaleY" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Wand Y-Offset (wallY): <span id="val-wallY">0.0</span></label>
                        <input type="range" min="-5" max="5" step="0.1" value="0.0" data-admin-cal="wallY" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label>Dach Y-Offset (roofY): <span id="val-roofY">4.0</span></label>
                        <input type="range" min="0" max="10" step="0.1" value="4.0" data-admin-cal="roofY" style="width:100%;">
                    </div>

                    <div style="border-top: 1px solid #555; margin-top: 10px; padding-top: 5px;">
                        <label style="color: #60a5fa;">Position X-Offset: <span id="val-offsetX">0.0</span></label>
                        <input type="range" min="-10" max="10" step="0.1" value="0.0" data-admin-cal="offsetX" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label style="color: #60a5fa;">Position Y-Offset: <span id="val-offsetY">0.0</span></label>
                        <input type="range" min="-10" max="10" step="0.1" value="0.0" data-admin-cal="offsetY" style="width:100%;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label style="color: #60a5fa;">Position Z-Offset: <span id="val-offsetZ">0.0</span></label>
                        <input type="range" min="-10" max="10" step="0.1" value="0.0" data-admin-cal="offsetZ" style="width:100%;">
                    </div>
                    
                    <button class="btn-action" data-action="adminAction" data-args='["exportCalibration"]' style="width:100%; margin-top:10px; background: #059669;">GOLDENE WERTE EXPORTIEREN</button>
                </div>
            </div>

            <hr style="border: 1px solid #444; margin: 15px 0;">

            <h3 style="margin-bottom: 10px;">📦 WARENLAGER (Sortiert nach Evolution)</h3>
            <div id="admin-item-grid"></div>

            <div style="margin-top: 15px;">
                <label>Evolution erzwingen:</label>
                <input type="text" id="evoInput" placeholder="z.B. Höheres Wesen" style="width:100%; background:#111; color:gold; border:1px solid gold; padding:8px; margin-top:5px;">
                <button class="btn-action" style="width:100%; margin-top:5px;" data-action="adminAction" data-args='["changeEvolution", "document.getElementById(\"evoInput\").value"]'>STRUKTUR ÄNDERN</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    
    console.log("[GOTT] Status Check:", {
        FPGraphics: !!window.FPGraphics,
        Avatar: !!window.avatar,
        isEditMode: window.isEditMode,
        clipmapActive: !!window.FPGraphics?.clipmapMesh
    });
    
    // Initialen Power-Level State setzen
    const currentLevel = localStorage.getItem('adminPowerLevel') || 'god';
    AdminConsole.setPowerLevel(currentLevel);

    AdminConsole.updateAdminItemSpawner();

    // Event Listener für Kalibrierung (CSP-konform)
    container.addEventListener('input', (e) => {
        const calKey = e.target.getAttribute('data-admin-cal');
        if (calKey) {
            AdminConsole.updateCalibration(calKey, e.target.value);
        }
    });
}

// --- 6. WELT-EDITOR LOGIK (DRAG, DROP & SCALE) ---

let draggedElement = null;
let offset = { x: 0, y: 0 };

document.addEventListener('mousedown', (e) => {
    if (!window.isEditMode) return;
    
    const target = e.target.closest('.building') || (e.target.tagName === 'IMG' ? e.target : null);
    
    if (target) {
        draggedElement = target;
        const rect = draggedElement.getBoundingClientRect();
        
        // Offset speichern für pixelgenaues Greifen
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        
        draggedElement.style.zIndex = "10000";
        draggedElement.style.cursor = "grabbing";
    }
});

document.addEventListener('mousemove', (e) => {
    if (!window.isEditMode || !draggedElement) return;

    const world = document.getElementById('world');
    const worldRect = world.getBoundingClientRect();

    // Berechnung: Aktuelle Maus-Position minus Welt-Anker minus Klick-Offset
    const x = e.clientX - worldRect.left - offset.x;
    const y = e.clientY - worldRect.top - offset.y;

    // Setzen der Position rein über top/left (Kein translate-Konflikt)
    draggedElement.style.left = `${x}px`;
    draggedElement.style.top = `${y}px`;
});

document.addEventListener('mouseup', () => {
    if (draggedElement) {
        draggedElement.style.zIndex = "";
        draggedElement.style.cursor = "";
        draggedElement = null;
        AdminConsole.sync("Position fixiert");
    }
});

// Proportionale Skalierung via Shift + Mausrad
document.addEventListener('wheel', (e) => {
    if (!window.isEditMode || !e.shiftKey) return;

    const target = e.target.closest('.building') || (e.target.tagName === 'IMG' ? e.target : null);
    
    if (target) {
        e.preventDefault(); 
        
        let currentScale = target.dataset.scale ? parseFloat(target.dataset.scale) : 1;
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        currentScale = Math.max(0.1, currentScale + delta); 
        
        target.dataset.scale = currentScale;
        
        // Stabilisierung durch zentrierten Origin und reine Skalierung
        target.style.transformOrigin = "center center";
        target.style.transform = `scale(${currentScale})`;
    }
}, { passive: false });

window.AdminConsole = AdminConsole;
window.openAdminPanel = openAdminPanel;
