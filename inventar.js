// --- OPTIMIERTE INVENTAR & MAPPING LOGIK ---

/**
 * Öffnet das Inventar und stößt das Rendering an
 */
function openInventory() {
    toggleModal('gameModal', true);
    renderInventoryUI();
}

/**
 * Kern-Rendering: Synchronisiert Stats, Ausrüstung und Waffen-Mapping
 */
function renderInventoryUI() {
    const main = document.getElementById('modalLeft');
    if (!main) return;
    
    main.innerHTML = '';
    const temp = document.getElementById('inventory-template');
    main.appendChild(temp.content.cloneNode(true));

    // 1. STAT-SYNCHRONISATION (Basis + Boni)
    const bonuses = typeof getEquipmentStats === 'function' ? getEquipmentStats() : { atk:0, def:0, hp:0, mp:0, setBonusActive: false };
    
    document.getElementById('stat-hp').innerText = (data.maxHp || 100) + (bonuses.hp || 0);
    document.getElementById('stat-mp').innerText = (data.maxMp || 50) + (bonuses.mp || 0);
    document.getElementById('stat-atk').innerText = (data.stats.atk || 0) + (bonuses.atk || 0);
    document.getElementById('stat-def').innerText = (data.stats.def || 0) + (bonuses.def || 0);

    // 2. SET-BONUS ANZEIGE
    const setMsg = document.getElementById('set-bonus-msg');
    if (setMsg) {
        setMsg.style.display = bonuses.setBonusActive ? 'block' : 'none';
        if(bonuses.setName) setMsg.innerText = `✨ ${bonuses.setName.toUpperCase()}-SET AKTIV ✨`;
    }

    // 3. AVATAR & WAFFEN-MAPPING (Anker-System)
    const baseImg = (typeof getCreatureSprite === 'function') ? getCreatureSprite(data, verifiedID === BROADCASTER_ID) : 'Ei.png';
    document.getElementById('avatar-base').src = baseImg;

    const weaponLayer = document.getElementById('weapon-layer');
    weaponLayer.innerHTML = ''; // Vorherige Waffen leeren

    // 4. SLOT-VISUALISIERUNG & ANKER-LOGIK
    for (let slotKey in data.equipment) {
        const slotEl = document.getElementById(`slot-${slotKey}`);
        if (!slotEl) continue;

        const itemName = data.equipment[slotKey];
        if (itemName) {
            const itemData = (window.allItems && allItems[itemName]) || (window.items && items[itemName]);
            if (itemData) {
                // Icon im Slot anzeigen
                slotEl.innerHTML = `<img src="${itemData.icon || 'stone.png'}" style="cursor:pointer;" onclick="unequipItem('${slotKey}')">`;
                slotEl.onmouseenter = (e) => showTooltip(e, itemData);
                slotEl.onmouseleave = hideTooltip;

                // Visuelles Mapping auf dem Avatar (nur für Weapon/Offhand)
                if (slotKey === 'weapon' || slotKey === 'offhand') {
                    const offsets = getWeaponOffsets(data.stats.className, itemName);
                    const wImg = document.createElement('img');
                    wImg.src = itemData.icon || '';
                    wImg.style.position = 'absolute';
                    wImg.style.left = offsets.x + "px";
                    wImg.style.top = offsets.y + "px";
                    wImg.style.transform = `rotate(${offsets.rotation || 0}deg)`;
                    wImg.style.width = "100px"; // Beispielgröße, anpassen falls nötig
                    wImg.style.pointerEvents = "none";
                    weaponLayer.appendChild(wImg);
                }
            }
        } else {
            slotEl.innerHTML = ''; // Slot leeren wenn nichts ausgerüstet
        }
    }

    // 5. RUCKSACK RENDERING
    const grid = document.getElementById('backpack-slots');
    let itemCount = 0;
    
    if (data.inventar) {
        Object.keys(data.inventar).forEach(id => {
            const count = data.inventar[id];
            if (count > 0) {
                const item = (window.allItems && allItems[id]) || (window.items && items[id]) || { name: id, icon: 'stone.png' };
                grid.appendChild(createItemSlot(id, item, count));
                itemCount++;
            }
        });
    }

    // Leere Slots auffüllen (RPG Look)
    for (let i = itemCount; i < 40; i++) {
        const empty = document.createElement('div');
        empty.className = 'slot';
        grid.appendChild(empty);
    }
    
    document.getElementById('bag-count').innerText = itemCount;
}

/**
 * Erstellt einen klickbaren Item-Slot für den Rucksack
 */
function createItemSlot(id, item, count) {
    const div = document.createElement('div');
    div.className = 'slot';
    div.style.cursor = 'pointer';
    div.innerHTML = `<img src="${item.icon || 'stone.png'}"><span style="position:absolute; bottom:2px; right:4px; font-size:10px; pointer-events:none;">${count}</span>`;
    
    div.onclick = () => {
        if (item.slot) {
            if (typeof equipItem === 'function') equipItem(id);
        }
    };
    
    div.onmouseenter = (e) => showTooltip(e, item);
    div.onmouseleave = hideTooltip;
    return div;
}

/**
 * Hilfsfunktion zum Ablegen (wird von Slot-Icons gerufen)
 */
window.unequipItem = function(slot) {
    if (data.equipment[slot]) {
        const itemName = data.equipment[slot];
        data.inventar[itemName] = (data.inventar[itemName] || 0) + 1;
        data.equipment[slot] = null;
        renderInventoryUI();
        if (typeof save === "function") save();
    }
};

/**
 * RPG Tooltip Anzeige
 */
function showTooltip(e, item) {
    const tt = document.getElementById('item-tooltip');
    if (!tt) return;
    
    const statText = (typeof getStatPreview === 'function') ? getStatPreview(item.name || item) : "Gegenstand";
    
    tt.innerHTML = `<h4>${item.name || 'Unbekannt'}</h4><div style="font-size:13px; white-space:pre-line;">${statText}</div>`;
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 15) + "px";
    tt.style.top = (e.clientY + 15) + "px";
}

function hideTooltip() {
    const tt = document.getElementById('item-tooltip');
    if (tt) tt.style.display = 'none';
}
