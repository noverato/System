/**
 * THE NEST: MARKET SYSTEM (markt.js)
 * Verantwortlich für den Handel, die Preisdynamik und die UI-Anbindung.
 */

// SICHERHEITS-CHECK: Sicherstellen, dass 'data' verfügbar ist
if (typeof data === 'undefined') {
    var data = window.data || { lxp: 0, inventar: {} };
}

// 1. MARKT-DATENBANK (Warenkatalog)
const MARKT_WAREN = {
    "Heiltrank": { id: "Heiltrank", basisPreis: 500, desc: "Stellt 25% HP wieder her", kategorie: "verbrauch" },
    "Schleifstein": { id: "Schleifstein", basisPreis: 1200, desc: "+5 Permanente ATK", kategorie: "buff" },
    "Evo-Splitter": { id: "Evo-Splitter", basisPreis: 5000, desc: "Beschleunigt die Evolution", kategorie: "material" },
    "Eisenerz": { id: "Eisenerz", basisPreis: 150, desc: "Rohmaterial für Schmiede", kategorie: "material" }
};

/**
 * BERECHNUNG: DYNAMISCHER PREIS
 * Formel: Preis = Basis * (0.4 + (1 / (1 + Bestand * 0.15)))
 */
function getDynamicPrice(itemID, istVerkauf = false) {
    const item = MARKT_WAREN[itemID];
    if (!item) return 0;

    const bestand = (data.inventar && data.inventar[itemID]) ? data.inventar[itemID] : 0;
    const saettigung = 1 / (1 + bestand * 0.15);
    const aktuellerPreis = Math.floor(item.basisPreis * (0.4 + saettigung));

    return istVerkauf ? Math.floor(aktuellerPreis * 0.7) : aktuellerPreis;
}

/**
 * HAUPTFUNKTION: MARKT RENDERN
 */
function renderMarketplace() {
    const display = document.getElementById('modalLeft');
    if (!display) return;
    
    let html = `
        <div style="padding:20px; color: #fdf5e6; font-family: sans-serif;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ffd700; padding-bottom:10px;">
                <h2 style="margin:0; color:#ffd700; font-size:28px; text-shadow: 1px 1px 2px #000;">Handelsplatz des Hains</h2>
                <div style="font-size:18px; color:#ffd700; font-weight:bold;">💰 <span id="marketGold">${data.lxp}</span> LXP</div>
            </div>
            
            <p style="color:#aaa; font-style:italic; margin-top:10px;">"Handle weise. Die Preise folgen dem Gesetz von Angebot und Nachfrage."</p>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn-action" style="flex:1; cursor:pointer;" onclick="renderShopTab()">🛒 KAUFEN</button>
                <button class="btn-action" style="flex:1; background:linear-gradient(135deg, #444, #222); cursor:pointer;" onclick="renderSellTab()">📦 VERKAUFEN</button>
            </div>
            
            <div id="marketContent" style="margin-top:25px; display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:15px;"></div>
        </div>
    `;
    
    display.innerHTML = html;
    renderShopTab(); 
}

/**
 * TAB: KAUFEN
 */
function renderShopTab() {
    const container = document.getElementById('marketContent');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(MARKT_WAREN).forEach(itemID => {
        const item = MARKT_WAREN[itemID];
        const preis = getDynamicPrice(itemID, false);

        container.innerHTML += `
            <div style="background:rgba(20,20,20,0.6); border:1px solid #444; padding:15px; border-radius:10px; text-align:center; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" class="shop-slot">
                <div style="font-weight:bold; color:cyan; margin-bottom:5px;">${item.id}</div>
                <div style="font-size:11px; color:#aaa; height:30px; overflow:hidden;">${item.desc}</div>
                <div style="margin:10px 0; color:#ffd700; font-weight:bold; font-size:1.1em;">${preis} LXP</div>
                <button class="btn-action" style="width:100%; font-size:11px; padding:8px;" onclick="buyItem('${itemID}')">KAUFEN</button>
            </div>
        `;
    });
}

/**
 * TAB: VERKAUFEN
 */
function renderSellTab() {
    const container = document.getElementById('marketContent');
    if (!container) return;
    container.innerHTML = '';
    
    let hatItems = false;
    if (data.inventar) {
        for (const itemID in data.inventar) {
            if (data.inventar[itemID] > 0) {
                hatItems = true;
                const preis = getDynamicPrice(itemID, true);

                container.innerHTML += `
                    <div style="background:rgba(40,30,20,0.6); border:1px solid #642; padding:15px; border-radius:10px; text-align:center;" class="shop-slot">
                        <div style="font-weight:bold; color:#ffcc00; margin-bottom:5px;">${itemID}</div>
                        <div style="font-size:11px; color:#aaa;">Besitz: ${data.inventar[itemID]}</div>
                        <div style="margin:10px 0; color:#90ee90; font-weight:bold;">+ ${preis} LXP</div>
                        <button class="btn-action" style="width:100%; font-size:11px; background:linear-gradient(135deg, #522, #311);" onclick="sellItem('${itemID}')">VERKAUFEN</button>
                    </div>
                `;
            }
        }
    }

    if (!hatItems) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#888;">Dein Rucksack ist leer...</p>';
    }
}

/**
 * LOGIK: ITEM KAUFEN
 */
function buyItem(itemID) {
    const preis = getDynamicPrice(itemID, false);

    if (data.lxp >= preis) {
        data.lxp -= preis;
        
        // Stabilität: addItem() aus inventar.js bevorzugen
        if (typeof addItem === 'function') {
            addItem(itemID, 1);
        } else if (typeof addItemToInventory === 'function') {
            addItemToInventory(itemID, 1);
        } else {
            // Fallback: Direktes Schreiben
            if (!data.inventar) data.inventar = {};
            data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;
        }

        finalizeTrade(`${itemID} gekauft!`);
    } else {
        alert("Zu wenig LXP!");
    }
}

/**
 * LOGIK: ITEM VERKAUFEN
 */
function sellItem(itemID) {
    if (data.inventar && data.inventar[itemID] > 0) {
        const preis = getDynamicPrice(itemID, true);
        
        data.lxp += preis;
        
        // Stabilität: removeItem() bevorzugen oder direkt abziehen
        if (typeof removeItem === 'function') {
            removeItem(itemID, 1);
        } else {
            data.inventar[itemID] -= 1;
            if (data.inventar[itemID] <= 0) delete data.inventar[itemID];
        }

        finalizeTrade(`${itemID} verkauft!`);
    }
}

/**
 * ABSCHLUSS & SPEICHERUNG
 */
function finalizeTrade(msg) {
    const goldDisplay = document.getElementById('marketGold');
    if (goldDisplay) goldDisplay.innerText = data.lxp;

    if (typeof updateUI === 'function') updateUI();
    
    // Speicher-Meister kontaktieren
    if (typeof window.triggerAutoSave === 'function') {
        window.triggerAutoSave();
    } else if (typeof save === 'function') {
        save();
    }

    // Refresh der Ansicht
    const currentContent = document.getElementById('marketContent');
    if (currentContent) {
        const isSellTab = currentContent.innerHTML.includes('Besitz:');
        isSellTab ? renderSellTab() : renderShopTab();
    }

    console.log("Markt-Log: " + msg);
}
