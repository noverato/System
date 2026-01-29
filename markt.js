/**
 * THE NEST: MARKET SYSTEM (markt.js)
 * Synchronisierte Logik: Nutzt MarketCatalog, GlobalMarketState und die items-Schnittstelle.
 */

/**
 * HAUPTFUNKTION: MARKT RENDERN
 */
function renderMarketplace() {
    const display = document.getElementById('modalLeft');
    if (!display) return;
    
    let html = `
        <div style="padding:20px; color: #fdf5e6; font-family: 'Crimson Text', serif;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--gold); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--gold); font-size:28px;">Handelsplatz des Hains</h2>
                <div style="font-size:18px; color:var(--gold);">💰 Guthaben: <span id="marketGold">${data.lxp}</span> LXP</div>
            </div>
            
            <p style="color:#aaa; font-style:italic; margin-top:10px;">"Preise atmen. Bestände fließen. Handle weise, Reisender."</p>
            
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
 * ARENA: MATCHMAKING RENDERN
 */
function renderArenaMatchmaking() {
    const display = document.getElementById('modalLeft');
    if (!display) return;

    display.innerHTML = `
        <div style="padding:20px; color: #fdf5e6; font-family: 'Crimson Text', serif; text-align: center;">
            <div style="border-bottom:2px solid var(--gold); padding-bottom:15px; margin-bottom:20px;">
                <h2 style="margin:0; color:var(--gold); font-size:32px; text-shadow: 0 0 10px rgba(255,215,0,0.4);">⚔️ Arena des Hains ⚔️</h2>
                <p style="color:#aaa; font-style:italic;">"Staub und Ehre erwarten dich. Wähle deinen Pfad."</p>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:20px; margin-top:40px;">
                <div style="background:rgba(0,0,0,0.4); border:1px solid var(--gold); padding:30px; border-radius:15px; width: 80%; box-shadow: inset 0 0 20px rgba(0,0,0,0.5);">
                    <h3 style="margin-top:0; color:var(--gold);">PvE: Monster-Jagd</h3>
                    <p style="font-size:14px; color:#ccc; margin-bottom:20px;">Tritt gegen die wilden Kreaturen des Waldes an.</p>
                    <button class="btn-action" style="font-size:18px; padding:15px 40px; width:100%;" onclick="window.Arena ? Arena.startMonsterFight() : startMonsterFight()">
                        ⚔️ GEGEN MONSTER KÄMPFEN
                    </button>
                </div>
                <div style="opacity: 0.5; background:rgba(20,20,20,0.8); border:1px solid #444; padding:20px; border-radius:15px; width: 80%;">
                    <h3 style="margin:0; color:#888;">PvP: Spieler-Duell</h3>
                    <p style="font-size:12px; color:#666;">Demnächst verfügbar.</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * DYNAMISCHE PREISBERECHNUNG (Isekai-Ökonomie)
 */
function getMarketPrice(itemID, istVerkauf = false) {
    const item = (typeof items !== 'undefined') ? items[itemID] : null;
    if (!item) return 0;

    const basis = item.basisPreis || item.price || 100;

    // 1. Lokale Sättigung (Spieler-Bestand senkt Ankaufswert)
    const bestand = (data.inventar && data.inventar[itemID]) ? data.inventar[itemID] : 0;
    const saettigung = 1 / (1 + bestand * 0.10);

    // 2. Globale Marktdynamik (Inflation/Deflation)
    let marketMult = 1;
    if (typeof MarketState !== 'undefined') {
        const circulation = MarketState.getCirculation(itemID);
        const ideal = item.idealBestand || MarketState.config.defaultIdeal;

        // Formel: Wenn Umlauf > Ideal -> Preis sinkt. Wenn Umlauf < Ideal -> Preis steigt.
        const delta = (ideal - circulation) / ideal;
        marketMult = 1 + (delta * MarketState.config.damping);

        // Begrenzung durch Global Config
        marketMult = Math.max(
            MarketState.config.minPriceMult,
            Math.min(MarketState.config.maxPriceMult, marketMult)
        );
    }

    // Finale Berechnung
    let price = basis * (0.5 + saettigung) * marketMult;
    price = Math.floor(price);

    // Händler-Marge (Ankauf ist immer günstiger als Verkauf)
    return istVerkauf ? Math.max(1, Math.floor(price * 0.7)) : price;
}

/**
 * TAB: KAUFEN
 * Nutzt die Brücke zum MarketCatalog
 */
function renderShopTab() {
    const container = document.getElementById('marketContent');
    if (!container) return;
    container.innerHTML = '';

    // Player-Kontext für die Filterung erstellen
    const playerContext = {
        level: data.stats.currentLevel || 0,
        evoStufe: data.stats.totalEvoLevel || 0,
        isSub: data.isSub || false
    };

    // Waren über die globale Brücke aus market_catalog.js holen
    let verfügbareWaren = [];
    if (typeof window.getVisibleMarketItems === 'function') {
        verfügbareWaren = window.getVisibleMarketItems(playerContext);
    }

    verfügbareWaren.forEach(item => {
        const preis = getMarketPrice(item.id, false);
        const icon = item.icon || 'stone.png';

        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.3); border:1px solid #444; padding:15px; border-radius:10px; text-align:center; transition: 0.2s;" class="shop-slot">
                <img src="${icon}" style="width:40px; height:40px; margin-bottom:5px; filter: drop-shadow(0 0 5px var(--gold));">
                <div style="font-weight:bold; color:cyan; margin-bottom:5px;">${item.name || item.id}</div>
                <div style="font-size:11px; color:#aaa; height:35px; overflow:hidden;">${item.desc || 'Ein nützliches Item'}</div>
                <div style="margin:10px 0; color:var(--gold); font-weight:bold;">${preis} LXP</div>
                <button class="btn-action" style="width:100%; font-size:11px;" onclick="buyItem('${item.id}')">KAUFEN</button>
            </div>
        `;
    });

    if (verfügbareWaren.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#666;">Der Händler hat momentan keine Waren für deine Stufe.</p>';
    }
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
            const item = (typeof items !== 'undefined') ? items[itemID] : { name: itemID, icon: 'stone.png' };
            
            // Drop-Only Items können verkauft, aber nie gekauft werden (ID Check)
            hatItems = true;
            const preis = getMarketPrice(itemID, true);
            const icon = item.icon || 'stone.png';

            container.innerHTML += `
                <div style="background:rgba(20,15,10,0.5); border:1px solid #642; padding:15px; border-radius:10px; text-align:center;">
                    <img src="${icon}" style="width:30px; height:30px; margin-bottom:5px;">
                    <div style="font-weight:bold; color:var(--gold);">${item.name || itemID}</div>
                    <div style="font-size:11px;">Besitz: ${data.inventar[itemID]}</div>
                    <div style="margin:10px 0; color:#4ade80; font-weight:bold;">+ ${preis} LXP</div>
                    <button class="btn-action" style="width:100%; font-size:11px; background:linear-gradient(135deg, #522, #311);" onclick="sellItem('${itemID}')">VERKAUFEN</button>
                </div>
            `;
        }
    }

    if (!hatItems) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#888;">Dein Rucksack ist leer.</p>';
    }
}

/**
 * LOGIK: ITEM KAUFEN
 */
function buyItem(itemID) {
    const preis = getMarketPrice(itemID, false);
    if (data.lxp >= preis) {
        data.lxp -= preis;
        
        // Marktdynamik: Item wird dem Umlauf entzogen (Verknappung)
        if (typeof MarketState !== 'undefined') {
            MarketState.updateCirculation(itemID, -1);
        }

        if (typeof addItem === 'function') {
            addItem(itemID, 1);
        } else {
            if (!data.inventar) data.inventar = {};
            data.inventar[itemID] = (data.inventar[itemID] || 0) + 1;
        }
        finalizeMarketTrade(`${itemID} gekauft!`);
    } else {
        alert("Deine LXP reichen nicht aus!");
    }
}

/**
 * LOGIK: ITEM VERKAUFEN
 */
function sellItem(itemID) {
    if (data.inventar && data.inventar[itemID] > 0) {
        const preis = getMarketPrice(itemID, true);
        data.lxp += preis;
        
        // Marktdynamik: Item wird dem Umlauf zugeführt (Sättigung)
        if (typeof MarketState !== 'undefined') {
            MarketState.updateCirculation(itemID, 1);
        }

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
    const goldDisplay = document.getElementById('marketGold');
    if (goldDisplay) goldDisplay.innerText = data.lxp;

    if (typeof updateUI === 'function') updateUI();
    if (typeof save === 'function') save();

    const currentContent = document.getElementById('marketContent');
    if (currentContent) {
        const isSellTab = currentContent.innerHTML.includes('Besitz:');
        isSellTab ? renderSellTab() : renderShopTab();
    }
    console.log("Markt-System: " + msg);
}
