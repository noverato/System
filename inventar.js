/**
 * SPAWN2909 - INVENTAR-LOGIK (Kampf- & Anker-Update)
 * Fokus: Stats-Erweiterung, Waffen-Positionierung & UI-Vorschau.
 */

// 1. Initialisierung mit erweiterten Slots
if (window.data) {
    if (!data.inventar) data.inventar = {};
    if (!data.equipment) {
        data.equipment = { 
            head: null, chest: null, legs: null, feet: null, 
            weapon: null, ring1: null, ring2: null, necklace: null 
        };
    }
}

/**
 * AVATAR-ANKER-SYSTEM
 * Findet die genauen Koordinaten für eine Waffe auf einem speziellen Avatar.
 * @param {string} avatarID - Die ID des aktuellen Avatars (z.B. "Warrior_Male")
 * @param {string} weaponName - Name der Waffe
 */
window.getWeaponOffsets = function(avatarID, weaponName) {
    const item = window.allItems?.[weaponName];
    if (item && item.offsets && item.offsets[avatarID]) {
        return item.offsets[avatarID]; // Gibt {x, y, rotation} zurück
    }
    return { x: 0, y: 0, rotation: 0 }; // Fallback
};

/**
 * ERWEITERTE STATS-BERECHNUNG
 * Berechnet ATK, DEF, HP, MP und prüft auf Set-Boni.
 */
function getEquipmentStats() {
    let stats = { atk: 0, def: 0, hp: 0, mp: 0, setBonusActive: false, setName: "" };
    if (!data.equipment || !window.allItems) return stats;

    const armorSlots = ['head', 'chest', 'legs', 'feet'];
    let activeSets = [];

    Object.values(data.equipment).forEach(itemName => {
        const item = window.allItems[itemName];
        if (item) {
            stats.atk += item.atk || 0;
            stats.def += item.def || 0;
            stats.hp += item.hp || 0;
            stats.mp += item.mp || 0;
            if (item.setName) activeSets.push(item.setName);
        }
    });

    // Set-Bonus Logik: Wenn alle 4 Rüstungsteile denselben Set-Namen haben
    const armorSets = armorSlots
        .map(slot => window.allItems?.[data.equipment[slot]]?.setName)
        .filter(name => name !== undefined);

    if (armorSets.length === 4 && new Set(armorSets).size === 1) {
        stats.setBonusActive = true;
        stats.setName = armorSets[0];
        // Hier könnten wir noch globale Set-Boni addieren, falls in loot.js definiert
    }

    return stats;
}

/**
 * UI-VORSCHAU (Final Fantasy Stil)
 * Generiert einen Tooltip-String für Stat-Veränderungen.
 */
function getStatPreview(itemName) {
    const item = window.allItems?.[itemName];
    if (!item) return "";
    
    let preview = `--- ${itemName.toUpperCase()} ---`;
    if (item.atk) preview += `\nATK: +${item.atk}`;
    if (item.def) preview += `\nDEF: +${item.def}`;
    if (item.hp) preview += `\nHP: +${item.hp}`;
    if (item.mp) preview += `\nMP: +${item.mp}`;
    if (item.setName) preview += `\nSET: ${item.setName}`;
    
    return preview;
}

/**
 * KERN-FUNKTION: UI-Rendering
 */
function renderInventoryUI() {
    const invDiv = document.getElementById('miniInv');
    if (!invDiv) return;
    invDiv.innerHTML = '';

    // 1. RENDER AUSRÜSTUNG
    let equipHtml = `<div style="margin-bottom:15px; border-bottom:1px solid var(--gold); padding-bottom:10px;">
                        <h4 style="margin:0 0 10px 0; font-size: 11px; color: gold; letter-spacing:1px;">EQUIPMENT</h4>`;
    
    for (let slot in data.equipment) {
        const item = data.equipment[slot];
        const itemData = item && window.allItems ? allItems[item] : null;
        const iconClass = itemData?.iconType ? `icon-${itemData.iconType}` : 'icon-empty';
        
        equipHtml += `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px;" title="${item ? getStatPreview(item) : 'Leer'}">
                <div class="${iconClass}" style="width:16px; height:16px; background: rgba(255,215,0,0.1); border: 1px solid #444;"></div>
                <span style="color:#888; width:65px;">${slot.toUpperCase()}</span>
                <span style="color:${item ? 'white' : '#444'};">${item || '---'}</span>
            </div>`;
    }
    equipHtml += `</div>`;
    invDiv.innerHTML = equipHtml;

    // 2. RENDER RUCKSACK
    if (data.inventar) {
        Object.entries(data.inventar).forEach(([itemName, count]) => {
            if (count <= 0) return;
            const itemData = window.allItems ? allItems[itemName] : {};
            const iconClass = itemData.iconType ? `icon-${itemData.iconType}` : 'icon-default';
            const statBonus = itemData.atk ? `<span style="color:#4ade80; margin-left:5px;">+${itemData.atk} ATK</span>` : '';

            invDiv.innerHTML += `
                <div class="inv-item" 
                     style="padding:8px; border-bottom:1px solid #333; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.02); cursor:help;"
                     title="${getStatPreview(itemName)}">
                    <div class="${iconClass}" style="width:24px; height:24px; border: 1px solid var(--gold); flex-shrink:0;"></div>
                    <div style="flex-grow: 1;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <b style="color:#fdf5e6;">${itemName} ${statBonus}</b>
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

// Grundfunktionen bleiben erhalten
function addItemToInventory(itemName, amount = 1) {
    if (!data.inventar) data.inventar = {};
    data.inventar[itemName] = (data.inventar[itemName] || 0) + amount;
    if (typeof updateUI === "function") updateUI();
    if (typeof save === "function") save(); 
}

function equipItem(itemName) {
    const itemData = window.allItems ? allItems[itemName] : null;
    if (!itemData || !itemData.slot) return;
    const slot = itemData.slot;
    if (data.equipment[slot]) {
        const oldItem = data.equipment[slot];
        data.inventar[oldItem] = (data.inventar[oldItem] || 0) + 1;
    }
    data.equipment[slot] = itemName;
    if (data.inventar[itemName] > 1) data.inventar[itemName]--;
    else delete data.inventar[itemName];
    if (typeof updateUI === "function") updateUI();
    if (typeof save === "function") save();
}

window.adminGetItem = function(itemName, amount = 1) {
    console.log(`%c[ADMIN] Schöpfung: ${amount}x ${itemName}`, "color: gold; font-weight: bold;");
    addItemToInventory(itemName, amount);
};
