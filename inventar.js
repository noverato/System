/**
 * SPAWN2909 - INVENTAR & AUSRÜSTUNG (Final Version)
 * Verwaltung von Rucksack, Ausrüstung und UI-Darstellung.
 */

// 1. Initialisierung der Datenstrukturen
if (!data.inventar) data.inventar = {};
if (!data.equipment) {
    data.equipment = {
        head: null,
        chest: null,
        legs: null,
        feet: null,
        weapon: null
    };
}

/**
 * GÖTTER-BEFEHL: Fügt ein Item via Konsole hinzu.
 * Nutzung: adminGetItem("Eisenschwert", 1)
 */
window.adminGetItem = function(itemName, amount = 1) {
    console.log(`%c Götter-Befehl: ${amount}x ${itemName} herbeigerufen!`, "color: #ffd700; font-weight: bold;");
    addItemToInventory(itemName, amount);
};

/**
 * Fügt ein Item dem Rucksack hinzu.
 */
function addItemToInventory(itemName, amount = 1) {
    data.inventar[itemName] = (data.inventar[itemName] || 0) + amount;
    
    console.log(`[Inventar] +${amount} ${itemName} erhalten.`);
    
    renderInventoryUI();
    if (typeof save === "function") save(); 
}

/**
 * Kern-Logik: Ein Item aus dem Rucksack anlegen.
 */
function equipItem(itemName) {
    const itemData = allItems[itemName];
    
    if (!itemData || !itemData.slot) {
        console.warn("Dieses Item ist nicht ausrüstbar!");
        return;
    }

    const slot = itemData.slot;

    // Falls bereits etwas ausgerüstet ist: Zurück in den Rucksack
    if (data.equipment[slot]) {
        const oldItem = data.equipment[slot];
        data.inventar[oldItem] = (data.inventar[oldItem] || 0) + 1;
    }

    // Neues Item ausrüsten
    data.equipment[slot] = itemName;
    
    // Eines aus dem Inventar entfernen
    if (data.inventar[itemName] > 1) {
        data.inventar[itemName]--;
    } else {
        delete data.inventar[itemName];
    }

    renderInventoryUI();
    if (typeof save === "function") save();
}

/**
 * Berechnet die gesamten Bonus-Werte für die battle.js
 */
function getEquipmentStats() {
    let stats = { atk: 0, def: 0 };
    Object.values(data.equipment).forEach(itemName => {
        if (itemName && allItems[itemName]) {
            const item = allItems[itemName];
            stats.atk += item.atk || 0;
            stats.def += item.def || 0;
        }
    });
    return stats;
}

/**
 * Rendert das Inventar in die Sidebar (#miniInv)
 */
function renderInventoryUI() {
    const invDiv = document.getElementById('miniInv');
    if (!invDiv) return;
    
    invDiv.innerHTML = '';
    
    // --- ABSCHNITT 1: AUSRÜSTUNG ---
    const equipHtml = Object.entries(data.equipment).map(([slot, item]) => {
        const itemData = item ? allItems[item] : null;
        const iconClass = itemData && itemData.iconType ? `icon-${itemData.iconType}` : 'icon-none';
        
        return `<div style="font-size: 11px; color: #aaa; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                    <div class="${iconClass}" style="width:16px; height:16px; background: #333; border: 1px solid #555;"></div>
                    <span style="color:var(--gold); width: 60px;">${slot.toUpperCase()}:</span> 
                    ${item ? `<b style="color:white">${item}</b>` : '<span style="color:#555">leer</span>'}
                </div>`;
    }).join('');

    invDiv.innerHTML = `<div style="margin-bottom:15px; border-bottom:1px solid var(--gold); padding-bottom:10px;">
                            <h4 style="margin:0 0 10px 0; font-size: 12px; color: gold;">AUSRÜSTUNG</h4>
                            ${equipHtml}
                        </div>`;

    // --- ABSCHNITT 2: RUCKSACK ---
    if (data.inventar) {
        Object.keys(data.inventar).forEach(itemName => {
            const count = data.inventar[itemName];
            const itemData = allItems[itemName] || {};
            
            if (count > 0) {
                const isEquippable = itemData.slot;
                const iconClass = itemData.iconType ? `icon-${itemData.iconType}` : 'icon-default';
                const priceLabel = itemData.baseValue ? `<span style="color: #888; font-size: 10px;">Wert: ${itemData.baseValue} LXP</span>` : '';

                invDiv.innerHTML += `
                    <div style="padding:10px 8px; border-bottom:1px solid #333; color: #fdf5e6; display: flex; align-items: center; gap: 10px;">
                        <div class="${iconClass}" style="width:24px; height:24px; background: #222; border: 1px solid var(--gold);"></div>
                        <div style="flex-grow: 1;">
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                <span>${itemName}</span>
                                <span style="color: gold;">x${count}</span>
                            </div>
                            ${priceLabel}
                        </div>
                        ${isEquippable ? 
                            `<button class="btn-action" style="font-size:9px; padding:2px 5px;" onclick="equipItem('${itemName}')">ANLEGEN</button>` 
                            : ''}
                    </div>`;
            }
        });
    }
}
