/**
 * SPAWN2909 - INVENTAR-LOGIK (Rucksack-Meister Edition)
 * Nutzt die globale 'data'-Variable der Engine.
 */

// Initialisierung der Unterstrukturen, falls sie in data noch fehlen
if (window.data) {
    if (!data.inventar) data.inventar = {};
    if (!data.equipment) {
        data.equipment = { head: null, chest: null, legs: null, feet: null, weapon: null };
    }
}

/**
 * GÖTTER-BEFEHL: Item direkt via Konsole geben
 */
window.adminGetItem = function(itemName, amount = 1) {
    console.log(`%c[ADMIN] Schöpfung: ${amount}x ${itemName}`, "color: gold; font-weight: bold;");
    addItemToInventory(itemName, amount);
};

/**
 * Fügt Items zum globalen Daten-Objekt hinzu
 */
function addItemToInventory(itemName, amount = 1) {
    if (!data.inventar) data.inventar = {};
    data.inventar[itemName] = (data.inventar[itemName] || 0) + amount;
    
    // UI-Update anstoßen (Nutzt die Brücke zur Haupt-UI)
    if (typeof updateUI === "function") updateUI();
    if (typeof save === "function") save(); 
}

/**
 * Ausrüstungs-Logik: Wechselt Items zwischen Rucksack und Slot
 */
function equipItem(itemName) {
    const itemData = window.allItems ? allItems[itemName] : null;
    if (!itemData || !itemData.slot) return;

    const slot = itemData.slot;

    // Tausch-Logik
    if (data.equipment[slot]) {
        const oldItem = data.equipment[slot];
        data.inventar[oldItem] = (data.inventar[oldItem] || 0) + 1;
    }

    data.equipment[slot] = itemName;
    
    if (data.inventar[itemName] > 1) {
        data.inventar[itemName]--;
    } else {
        delete data.inventar[itemName];
    }

    if (typeof updateUI === "function") updateUI();
    if (typeof save === "function") save();
}

/**
 * Gibt die aktuellen Stats für battle.js zurück
 */
function getEquipmentStats() {
    let stats = { atk: 0, def: 0 };
    if (!data.equipment || !window.allItems) return stats;

    Object.values(data.equipment).forEach(itemName => {
        if (itemName && allItems[itemName]) {
            stats.atk += allItems[itemName].atk || 0;
            stats.def += allItems[itemName].def || 0;
        }
    });
    return stats;
}

/**
 * Kern-Funktion: Befüllt den miniInv-Bereich im HUD/Modal
 */
function renderInventoryUI() {
    const invDiv = document.getElementById('miniInv');
    if (!invDiv) return;
    
    invDiv.innerHTML = '';

    // 1. RENDER AUSRÜSTUNG (Oben angepinnt)
    let equipHtml = `<div style="margin-bottom:15px; border-bottom:1px solid var(--gold); padding-bottom:10px;">
                        <h4 style="margin:0 0 10px 0; font-size: 11px; color: gold; letter-spacing:1px;">EQUIPMENT</h4>`;
    
    for (let slot in data.equipment) {
        const item = data.equipment[slot];
        const itemData = item && window.allItems ? allItems[item] : null;
        const iconClass = itemData?.iconType ? `icon-${itemData.iconType}` : 'icon-empty';
        
        equipHtml += `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px;">
                <div class="${iconClass}" style="width:16px; height:16px; background: rgba(255,215,0,0.1); border: 1px solid #444;"></div>
                <span style="color:#888; width:50px;">${slot.toUpperCase()}</span>
                <span style="color:white;">${item || '---'}</span>
            </div>`;
    }
    equipHtml += `</div>`;
    invDiv.innerHTML = equipHtml;

    // 2. RENDER RUCKSACK-ITEMS
    if (data.inventar) {
        Object.entries(data.inventar).forEach(([itemName, count]) => {
            if (count <= 0) return;
            const itemData = window.allItems ? allItems[itemName] : {};
            const iconClass = itemData.iconType ? `icon-${itemData.iconType}` : 'icon-default';

            invDiv.innerHTML += `
                <div style="padding:8px; border-bottom:1px solid #333; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.02); margin-bottom: 2px;">
                    <div class="${iconClass}" style="width:24px; height:24px; border: 1px solid var(--gold); flex-shrink:0;"></div>
                    <div style="flex-grow: 1;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <b style="color:#fdf5e6;">${itemName}</b>
                            <span style="color: var(--gold);">x${count}</span>
                        </div>
                        <div style="font-size: 10px; color: #888;">Wert: ${itemData.baseValue || 0} LXP</div>
                    </div>
                    ${itemData.slot ? 
                        `<button class="btn-action" style="font-size:9px; padding:2px 6px;" onclick="equipItem('${itemName}')">EQUIP</button>` 
                        : ''}
                </div>`;
        });
    }
}
