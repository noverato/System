/**
 * THE NEST: MARKET SYSTEM (markt.js)
 * Zentralisierte Logik: Nutzt globale Master-Daten und loot.js
 */

/**
 * HAUPTFUNKTION: MARKT RENDERN
 * Zieht Items direkt aus der MARKT_WAREN (loot.js)
 */
function renderMarketplace() {
    const display = document.getElementById('modalLeft');
    if (!display) return;
    
    // Header & Gold-Anzeige (Greift auf globale 'data' zu)
    let html = `
        <div style="padding:20px; color: #fdf5e6; font-family: 'Crimson Text', serif;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--gold); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--gold); font-size:28px;">Handelsplatz des Hains</h2>
                <div style="font-size:18px; color:var(--gold);">💰 Guthaben: <span id="marketGold">${data.lxp}</span> LXP</div>
            </div>
            
            <p style="color:#aaa; font-style:italic; margin-top:10px;">"Willkommen im Nest. Die Preise atmen mit dem Bestand."</p>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn-action" style="flex:1;" onclick="renderShopTab()">🛒 KAUFEN</button>
                <button class="btn-action" style="flex:1; background:linear-gradient(135deg, #444, #222);" onclick="renderSellTab()">📦 VERKAUFEN</button>
            </div>
            
            <div id="marketContent" style="margin-top:25px; display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:15px;">
            </div>
        </div>
    `;
    
    display.innerHTML = html;
    renderShopTab(); 
}

/**
 * DYNAMISCHE PREISBERECHNUNG
 * Nutzt MARKT_WAREN aus loot.js und data.inventar für die Sättigung
 */
function getMarketPrice(itemID, istVerkauf = false) {
    // Greift auf MARKT_WAREN aus der loot.js zu
    const item = MARKT_WAREN[itemID];
    if (!item) return 0;

    const bestand = (data.inventar && data.inventar[itemID]) ? data.inventar[itemID] : 0;
    const saettigung = 1 / (1 + bestand * 0.15);
    const aktuellerPreis = Math.floor(item.basisPreis * (0.4 + saettigung));

    return istVerkauf ? Math.floor(aktuellerPreis * 0.7) : aktuellerPreis;
}

/**
 * TAB: KAUFEN
 */
function renderShopTab() {
    const container = document.getElementById('marketContent');
    if (!container) return;
    container.innerHTML = '';

    // Wir iterieren über die Waren aus der loot.js
    Object.keys(MARKT_WAREN).forEach(itemID => {
        const item = MARKT_WAREN[itemID];
        const preis = getMarketPrice(itemID, false);

        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.3); border:1px solid #444; padding:15px; border-radius:10px; text-align:center;" class="shop-slot">
                <div style="font-weight:bold; color:cyan; margin-bottom:5px;">${itemID}</div>
                <div style="font-size:11px; color:#aaa; height:35px;">${item.desc}</div>
                <div style="margin:10px 0; color:var(--gold); font-weight:bold;">${preis} LXP</div>
                <button class="btn-action" style="width:100%; font-size:11px;" onclick="buyItem('${itemID}')">KAUFEN</button>
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
    for (const itemID in data.inventar) {
        if (data.inventar[itemID] > 0) {
            hatItems = true;
            const preis = getMarketPrice(itemID, true);

            container.innerHTML += `
                <div style="background:rgba(20,15,10,0.5); border:1px solid #642; padding:15px; border-radius:10px; text-align:center;">
                    <div style="font-weight:bold; color:var(--gold);">${itemID}</div>
                    <div style="font-size:11px;">Menge: ${data.inventar[itemID]}</div>
                    <div style="margin:10px 0; color:#4ade80; font-weight:bold;">+ ${preis} LXP</div>
                    <button class="btn-action" style="width:100%; font-size:11px; background:linear-gradient(135deg, #522, #311);" onclick="sellItem('${itemID}')">VERKAUFEN</button>
                </div>
            `;
        }
    }

    if (!hatItems) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#666;">Dein Rucksack ist leer.</p>';
    }
}

/**
 * LOGIK: ITEM KAUFEN
 */
function buyItem(itemID) {
    const preis = getMarketPrice(itemID, false);

    if (data.lxp >= preis) {
        data.lxp -= preis;
        
        // Nutze addItem aus inventar.js für grafische Korrektheit
        if (typeof addItem === 'function') {
            addItem(itemID, 1);
        } else {
            data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;
        }

        finalizeMarketTrade(`${itemID} gekauft!`);
    } else {
        alert("Nicht genug LXP!");
    }
}

/**
 * LOGIK: ITEM VERKAUFEN
 */
function sellItem(itemID) {
    if (data.inventar && data.inventar[itemID] > 0) {
        const preis = getMarketPrice(itemID, true);
        
        data.lxp += preis;
        
        // Nutze removeItem aus inventar.js
        if (typeof removeItem === 'function') {
            removeItem(itemID, 1);
        } else {
            data.inventar[itemID] -= 1;
            if (data.inventar[itemID] <= 0) delete data.inventar[itemID];
        }

        finalizeMarketTrade(`${itemID} verkauft!`);
    }
}

/**
 * ABSCHLUSS: SYNC MIT MASTER-LOGIK
 */
function finalizeMarketTrade(msg) {
    // 1. UI im Markt-Fenster updaten
    const goldDisplay = document.getElementById('marketGold');
    if (goldDisplay) goldDisplay.innerText = data.lxp;

    // 2. Globale Master-UI updaten (HUD etc.)
    if (typeof updateUI === 'function') updateUI();
    
    // 3. In Firebase speichern (Master-Funktion aus HTML)
    if (typeof save === 'function') save();

    // 4. Aktuellen Tab im Markt refreshen
    const currentContent = document.getElementById('marketContent');
    if (currentContent) {
        const isSellTab = currentContent.innerHTML.includes('Menge:');
        isSellTab ? renderSellTab() : renderShopTab();
    }

    console.log("Markt-System: " + msg);
}
