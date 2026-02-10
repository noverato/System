/**
 * SPAWN2909 - INVENTAR-LOGIK (Emoji-First Edition)
 * Stoppt URI-Fehler durch intelligente Icon/Emoji-Abfrage.
 */

// --- HILFSFUNKTION FÜR VISUALS ---

/**
 * Erzeugt das passende HTML-Markup für ein Item (Bild, Emoji oder Fallback).
 * @param {Object} item - Das Item-Objekt
 * @param {string} cssClass - Optionale CSS-Klasse
 */
function getItemMarkup(item, cssStyle = "") {
    if (item && item.emoji) {
        return `<span style="font-size: 2em; ${cssStyle}">${item.emoji}</span>`;
    } else {
        return `<span style="font-size: 2em; ${cssStyle}">📦</span>`;
    }
}

// --- KERN-LOGIK ---

function openInventory() {
    // Wenn der Wald offen ist, öffne das Overlay im Wald
    const fpModal = document.getElementById('fpModal');
    if (fpModal && fpModal.style.display === 'flex') {
        const overlay = document.getElementById('fpInventoryOverlay');
        if (overlay) {
            overlay.style.display = 'block';
            renderInventoryUI();
            return;
        }
    }

    // Sonst normales Modal
    if (window.FPWald && typeof window.FPWald.close === 'function') {
        window.FPWald.close();
    }
    toggleModal('gameModal', true);
    renderInventoryUI();
}

/**
 * Sucht ein Item über alle Kategorien hinweg.
 */
function getItemById(id) {
    if (!id) return null;
    
    // 1. Suche in ITEM_DATABASE oder window.items (rekursiv)
    const db = window.ITEM_DATABASE || window.items || window.allItems;
    if (db) {
        const search = (obj) => {
            if (obj && obj.id === id) return obj;
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (obj[key].id === id) return obj[key];
                    const found = search(obj[key]);
                    if (found) return found;
                }
            }
            return null;
        };
        const found = search(db);
        if (found) return found;
    }

    return null;
}

/**
 * Hilfsfunktion für die Positionierung von Waffen auf dem Avatar.
 */
window.getWeaponOffsets = function(className, itemName) {
    const fallback = { x: 0, y: 0, rotation: 0 };
    if (!className) return fallback;

    // Konvertiere className zu Key-Format (Leerzeichen -> Unterstrich, Umlaute ersetzen)
    const key = className
        .replace(/ /g, '_')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae')
        .replace(/Ö/g, 'Oe')
        .replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss');

    const anchorData = window.AvatarAnchors ? window.AvatarAnchors[key] : null;
    if (!anchorData) return fallback;

    // Prüfen ob es eine Waffe oder ein Schild ist
    const itemData = getItemById(itemName);
    const isShield = itemData && itemData.slot === 'offhand';

    return isShield ? (anchorData.shield || fallback) : (anchorData.weapon || fallback);
};

function renderInventoryUI() {
    const main = document.getElementById('modalLeft');
    const fpOverlay = document.getElementById('fpInventoryOverlay');
    
    // Bestimme das Ziel-Element (entweder gameModal oder fpModal Overlay)
    const isForestOverlay = fpOverlay && fpOverlay.style.display !== 'none';
    const target = isForestOverlay ? fpOverlay : main;
    if (!target) return;
    
    target.innerHTML = '';
    
    // Wenn Overlay im Wald, brauche wir einen Schließen-Button
    if (isForestOverlay) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-action';
        closeBtn.innerText = 'X';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '10px';
        closeBtn.style.zIndex = '101';
        closeBtn.onclick = () => { fpOverlay.style.display = 'none'; };
        target.appendChild(closeBtn);
    }

    const temp = document.getElementById('inventory-template');
    if (!temp) return;
    
    target.appendChild(temp.content.cloneNode(true));

    // 1. STAT-SYNCHRONISATION
    const bonuses = typeof getEquipmentStats === 'function' ? getEquipmentStats() : { atk:0, def:0, hp:0, mp:0, setBonusActive: false };
    
    const elHp = document.getElementById('stat-hp');
    const elMp = document.getElementById('stat-mp');
    const elAtk = document.getElementById('stat-atk');
    const elDef = document.getElementById('stat-def');
    const elLxp = document.getElementById('inv-lxp-display');

    if (elHp) elHp.innerText = (data.maxHp || 100) + (bonuses.hp || 0);
    if (elMp) elMp.innerText = (data.maxMp || 50) + (bonuses.mp || 0);
    if (elAtk) elAtk.innerText = ((data.stats && data.stats.atk) || 0) + (bonuses.atk || 0);
    if (elDef) elDef.innerText = ((data.stats && data.stats.def) || 0) + (bonuses.def || 0);
    if (elLxp) elLxp.innerText = (data.lxp || 0) + " LXP";

    // 1b. LEVEL-ANZEIGE (Neu)
    const elLvl = document.getElementById('inv-level-display');
    if (elLvl) elLvl.innerText = "Level " + ((data.stats && data.stats.currentLevel) || 1);

    // 2. SET-BONUS
    const setMsg = document.getElementById('set-bonus-msg');
    if (setMsg) {
        setMsg.style.display = bonuses.setBonusActive ? 'block' : 'none';
        if(bonuses.setName) setMsg.innerText = `✨ ${bonuses.setName.toUpperCase()}-SET AKTIV ✨`;
    }

    // 3. AVATAR & WAFFEN-MAPPING
    const elAvatar = document.getElementById('avatar-base');
    if (elAvatar) {
        const baseImg = (typeof getCreatureSprite === 'function') ? getCreatureSprite(data, verifiedID === BROADCASTER_ID) : 'Ei.png';
        elAvatar.src = baseImg;
    }

    const weaponLayer = document.getElementById('weapon-layer');
    if (weaponLayer) weaponLayer.innerHTML = ''; 

    // 4. SLOT-VISUALISIERUNG & ANKER
    for (let slotKey in data.equipment) {
        const slotEl = document.getElementById(`slot-${slotKey}`);
        if (!slotEl) continue;

        const itemName = data.equipment[slotKey];
        if (itemName) {
            const itemData = getItemById(itemName);
            if (itemData) {
                // EMOJI-FIRST LOGIK FÜR SLOTS
                slotEl.innerHTML = getItemMarkup(itemData, "cursor:pointer; max-width:100%; max-height:100%;");
                slotEl.onclick = () => unequipItem(slotKey);
                slotEl.onmouseenter = (e) => showTooltip(e, itemData);
                slotEl.onmouseleave = hideTooltip;

                // Visuelles Mapping auf dem Avatar (Weapon/Offhand)
                if (weaponLayer && (slotKey === 'weapon' || slotKey === 'offhand')) {
                    const offsets = getWeaponOffsets(data.stats.className, itemName);
                    const visualWrap = document.createElement('div');
                    visualWrap.style.position = 'absolute';
                    visualWrap.style.left = offsets.x + "px";
                    visualWrap.style.top = offsets.y + "px";
                    visualWrap.style.transform = `rotate(${offsets.rotation || 0}deg)`;
                    visualWrap.style.pointerEvents = "none";
                    visualWrap.style.zIndex = "10";
                    
                    // Nutze auch hier das Markup (für Emojis auf dem Avatar!)
                    visualWrap.innerHTML = getItemMarkup(itemData, "width:80px; height:80px; display:flex; align-items:center; justify-content:center;");
                    weaponLayer.appendChild(visualWrap);
                }
            }
        } else {
            slotEl.innerHTML = ''; 
            slotEl.onclick = null;
        }
    }

    // 5. RUCKSACK RENDERING
    const grid = document.getElementById('backpack-slots');
    if (!grid) return;
    
    let itemCount = 0;
    if (data.inventar) {
        Object.keys(data.inventar).forEach(id => {
            const count = data.inventar[id];
            if (count > 0) {
                let item = getItemById(id) || { name: id };
                const meta = (window.data && window.data.inventarMeta) ? window.data.inventarMeta[id] : null;
                if (meta && !item.emoji) item = { ...item, emoji: meta.emoji, name: meta.name || item.name };
                grid.appendChild(createItemSlot(id, item, count));
                itemCount++;
            }
        });
    }

    for (let i = itemCount; i < 40; i++) {
        const empty = document.createElement('div');
        empty.className = 'slot';
        grid.appendChild(empty);
    }
    
    const elBagCount = document.getElementById('bag-count');
    if (elBagCount) elBagCount.innerText = itemCount;
}

/**
 * Erstellt einen klickbaren Item-Slot für den Rucksack (Emoji-Safe)
 */
function createItemSlot(id, item, count) {
    const div = document.createElement('div');
    div.className = 'slot';
    div.style.cursor = 'pointer';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    
    // EMOJI-FIRST LOGIK
    const visual = getItemMarkup(item, "max-width:45px; max-height:45px;");
    div.innerHTML = `${visual}<span style="position:absolute; bottom:2px; right:4px; font-size:10px; pointer-events:none; background:rgba(0,0,0,0.6); padding:0 2px; border-radius:3px;">${count}</span>`;
    
    div.onclick = () => {
        if (item.id === 'item_nest_feder' && typeof window.FPWald !== 'undefined' && typeof window.FPWald.teleport === 'function') {
            window.FPWald.teleport();
            // Schließe Overlay nach Teleport
            const overlay = document.getElementById('fpInventoryOverlay');
            if (overlay) overlay.style.display = 'none';
            return;
        }
        
        // Auto-Equip Logik: Alles was Waffe, Rüstung oder Schild ist, versuchen wir auszurüsten
        const isEquippable = item.slot || 
                           item.type === 'Waffe' || 
                           item.type === 'Rüstung' || 
                           item.type === 'Schild' ||
                           id.startsWith('w_') || 
                           id.startsWith('s_') || 
                           id.startsWith('a_');

        if (isEquippable && typeof equipItem === 'function') {
            equipItem(id);
        }
    };
    
    div.onmouseenter = (e) => showTooltip(e, item);
    div.onmouseleave = hideTooltip;
    return div;
}

// --- RESTLICHE FUNKTIONEN (UNBERÜHRT) ---

window.equipItem = function(itemId) {
    const itemData = getItemById(itemId);
    if (!itemData) return;

    // --- AUTOMATISCHE SLOT-ERKENNUNG (Falls nicht im Item definiert) ---
    let slot = itemData.slot;
    if (!slot) {
        if (itemId.startsWith('w_')) slot = 'weapon';
        else if (itemId.startsWith('s_')) slot = 'offhand';
        else if (itemId.includes('_head_')) slot = 'head';
        else if (itemId.includes('_chest_')) slot = 'chest';
        else if (itemId.includes('_legs_')) slot = 'legs';
        else if (itemId.includes('_feet_')) slot = 'feet';
        // Spezialfall: Lederkappe (kann verschiedene IDs haben)
        else if (itemData.name && itemData.name.toLowerCase().includes('lederhaube')) slot = 'head';
        else if (itemData.name && itemData.name.toLowerCase().includes('leder-kappe')) slot = 'head';
        else if (itemData.name && itemData.name.toLowerCase().includes('lederkappe')) slot = 'head';
    }

    if (!slot) {
        console.log("Kein Slot für Item gefunden:", itemId);
        return;
    }

    // Initialisierung von equipment, falls nicht vorhanden
    if (!data.equipment) data.equipment = {};

    // 1. ANFORDERUNGS-CHECK
    const playerLevel = (data.stats && data.stats.currentLevel) || 1;
    const playerEvo = (data.stats && data.stats.totalEvoLevel) || 0;

    if (itemData.levelReq && playerLevel < itemData.levelReq) {
        alert(`Benötigt Level ${itemData.levelReq}!`);
        return;
    }
    if (itemData.evoReq != null && playerEvo < itemData.evoReq) {
        alert(`Benötigt eine höhere Evolutionsstufe!`);
        return;
    }

    // Wenn Slot bereits belegt: unequip
    if (data.equipment[slot]) {
        unequipItem(slot);
    }

    // Ausrüsten
    data.equipment[slot] = itemId;

    // Aus Inventar entfernen (Menge -1)
    if (data.inventar[itemId] > 0) {
        data.inventar[itemId]--;
        if (data.inventar[itemId] === 0) delete data.inventar[itemId];
    }

    renderInventoryUI();
    if (window.EventHub) {
        EventHub.emit('equipment:update');
    }
    if (typeof save === "function") save();
};

window.getEquipmentStats = function() {
    const totals = { atk: 0, def: 0, hp: 0, mp: 0, setBonusActive: false };

    if (!data.equipment) return totals;

    for (let slot in data.equipment) {
        const itemId = data.equipment[slot];
        if (!itemId) continue;

        const itemData = getItemById(itemId);
        if (itemData && itemData.stats) {
            if (itemData.stats.atk) totals.atk += itemData.stats.atk;
            if (itemData.stats.def) totals.def += itemData.stats.def;
            if (itemData.stats.hp) totals.hp += itemData.stats.hp;
            if (itemData.stats.mp) totals.mp += itemData.stats.mp;
        }
    }

    return totals;
};

window.unequipItem = function(slot) {
    if (data.equipment && data.equipment[slot]) {
        const itemName = data.equipment[slot];
        data.inventar[itemName] = (data.inventar[itemName] || 0) + 1;
        data.equipment[slot] = null;
        renderInventoryUI();
        if (window.EventHub) {
            EventHub.emit('equipment:update');
        }
        if (typeof save === "function") save();
    }
};

function showTooltip(e, item) {
    const tt = document.getElementById('item-tooltip');
    if (!tt) return;
    const statText = (typeof getStatPreview === 'function') ? getStatPreview(item.name || item) : "Gegenstand";
    tt.innerHTML = `<h4>${item.emoji || ''} ${item.name || 'Unbekannt'}</h4><div style="font-size:13px; white-space:pre-line;">${statText}</div>`;
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 15) + "px";
    tt.style.top = (e.clientY + 15) + "px";
}

function hideTooltip() {
    const tt = document.getElementById('item-tooltip');
    if (tt) tt.style.display = 'none';
}

window.openInventory = openInventory;
window.renderInventoryUI = renderInventoryUI;

// — Event-Integration: UI-Aktualisierung bei Inventar-Änderungen
if (window.EventHub) {
    EventHub.on(EventHub.EVENTS.INVENTORY_ADD, () => {
        renderInventoryUI();
    });
}
