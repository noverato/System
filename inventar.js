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
    if (item && item.icon && item.icon.trim() !== "" && item.icon !== "stone.png") {
        return `<img src="${item.icon}" style="${cssStyle} object-fit: contain;">`;
    } else if (item && item.emoji) {
        return `<span style="font-size: 2em; ${cssStyle}">${item.emoji}</span>`;
    } else {
        return `<span style="font-size: 2em; ${cssStyle}">📦</span>`; // Globaler Fallback
    }
}

// --- KERN-LOGIK ---

function openInventory() {
    toggleModal('gameModal', true);
    renderInventoryUI();
}

function renderInventoryUI() {
    const main = document.getElementById('modalLeft');
    if (!main) return;
    
    main.innerHTML = '';
    const temp = document.getElementById('inventory-template');
    main.appendChild(temp.content.cloneNode(true));

    // 1. STAT-SYNCHRONISATION
    const bonuses = typeof getEquipmentStats === 'function' ? getEquipmentStats() : { atk:0, def:0, hp:0, mp:0, setBonusActive: false };
    
    document.getElementById('stat-hp').innerText = (data.maxHp || 100) + (bonuses.hp || 0);
    document.getElementById('stat-mp').innerText = (data.maxMp || 50) + (bonuses.mp || 0);
    document.getElementById('stat-atk').innerText = (data.stats.atk || 0) + (bonuses.atk || 0);
    document.getElementById('stat-def').innerText = (data.stats.def || 0) + (bonuses.def || 0);

    // 2. SET-BONUS
    const setMsg = document.getElementById('set-bonus-msg');
    if (setMsg) {
        setMsg.style.display = bonuses.setBonusActive ? 'block' : 'none';
        if(bonuses.setName) setMsg.innerText = `✨ ${bonuses.setName.toUpperCase()}-SET AKTIV ✨`;
    }

    // 3. AVATAR & WAFFEN-MAPPING
    const baseImg = (typeof getCreatureSprite === 'function') ? getCreatureSprite(data, verifiedID === BROADCASTER_ID) : 'Ei.png';
    document.getElementById('avatar-base').src = baseImg;

    const weaponLayer = document.getElementById('weapon-layer');
    weaponLayer.innerHTML = ''; 

    // 4. SLOT-VISUALISIERUNG & ANKER
    for (let slotKey in data.equipment) {
        const slotEl = document.getElementById(`slot-${slotKey}`);
        if (!slotEl) continue;

        const itemName = data.equipment[slotKey];
        if (itemName) {
            const itemData = (window.allItems && allItems[itemName]) || (window.items && items[itemName]);
            if (itemData) {
                // EMOJI-FIRST LOGIK FÜR SLOTS
                slotEl.innerHTML = getItemMarkup(itemData, "cursor:pointer; max-width:100%; max-height:100%;");
                slotEl.onclick = () => unequipItem(slotKey);
                slotEl.onmouseenter = (e) => showTooltip(e, itemData);
                slotEl.onmouseleave = hideTooltip;

                // Visuelles Mapping auf dem Avatar (Weapon/Offhand)
                if (slotKey === 'weapon' || slotKey === 'offhand') {
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
    let itemCount = 0;
    
    if (data.inventar) {
        Object.keys(data.inventar).forEach(id => {
            const count = data.inventar[id];
            if (count > 0) {
                const item = (window.allItems && allItems[id]) || (window.items && items[id]) || { name: id };
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
    
    document.getElementById('bag-count').innerText = itemCount;
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
        if (item.slot && typeof equipItem === 'function') equipItem(id);
    };
    
    div.onmouseenter = (e) => showTooltip(e, item);
    div.onmouseleave = hideTooltip;
    return div;
}

// --- RESTLICHE FUNKTIONEN (UNBERÜHRT) ---

window.equipItem = function(itemId) {
    const itemData = (window.allItems && allItems[itemId]) || (window.items && items[itemId]);
    if (!itemData || !itemData.slot) return;

    const slot = itemData.slot;

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
    if (typeof save === "function") save();
};

window.getEquipmentStats = function() {
    const totals = { atk: 0, def: 0, hp: 0, mp: 0, setBonusActive: false };

    if (!data.equipment) return totals;

    for (let slot in data.equipment) {
        const itemId = data.equipment[slot];
        if (!itemId) continue;

        const itemData = (window.allItems && allItems[itemId]) || (window.items && items[itemId]);
        if (itemData && itemData.stats) {
            if (itemData.stats.atk) totals.atk += itemData.stats.atk;
            if (itemData.stats.def) totals.def += itemData.stats.def;
            if (itemData.stats.hp) totals.hp += itemData.stats.hp;
            if (itemData.stats.mp) totals.mp += itemData.stats.mp;
        }
    }

    return totals;
};

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
    const itemData = (window.allItems && allItems[itemName]) || (window.items && items[itemName]);
    const isShield = itemData && itemData.slot === 'offhand';

    return isShield ? (anchorData.shield || fallback) : (anchorData.weapon || fallback);
};

window.unequipItem = function(slot) {
    if (data.equipment[slot]) {
        const itemName = data.equipment[slot];
        data.inventar[itemName] = (data.inventar[itemName] || 0) + 1;
        data.equipment[slot] = null;
        renderInventoryUI();
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
