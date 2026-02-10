/**
 * THE NEST – MARKET SYSTEM
 * Version: Stable 1.0
 * Abhängigkeiten:
 *  - market_catalog.js
 *  - market_state.js
 *  - items.js
 */

/* =========================
   MARKT RENDERN
========================= */
function renderMarketplace(targetId = "modalLeft") {
    const display = document.getElementById(targetId);
    if (!display) return;

    display.innerHTML = `
        <div style="padding:20px; color:#fdf5e6;">
            <div style="display:flex; justify-content:space-between; border-bottom:2px solid var(--gold); padding-bottom:10px;">
                <h2 style="color:var(--gold);">Handelsplatz des Hains</h2>
                <div>💰 <span id="marketGold_${targetId}">${data.lxp}</span> LXP</div>
            </div>

            <p style="color:#aaa; font-style:italic;">
                „Angebot und Nachfrage bestimmen das Schicksal.“
            </p>

            <div style="display:flex; gap:10px; margin-top:15px;">
                <button class="btn-action" style="flex:1;" data-action="renderShopTab" data-args='["${targetId}"]'>🛒 KAUFEN</button>
                <button class="btn-action" style="flex:1; background:#333;" data-action="renderSellTab" data-args='["${targetId}"]'>📦 VERKAUFEN</button>
            </div>

            <div id="marketContent_${targetId}"
                 style="margin-top:20px; display:grid;
                 grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
                 gap:15px;">
            </div>
        </div>
    `;

    renderShopTab(targetId);
}

window.renderMarketplace = renderMarketplace;
window.buyItem = buyItem;
window.sellItem = sellItem;

/* =========================
   PREISBERECHNUNG
========================= */
function getMarketPrice(catalogItem, istVerkauf = false) {
    if (!catalogItem) return 0;

    const basis = catalogItem.price || 100;

    /* Globaler Markt */
    let marketMult = 1;
    if (typeof MarketState !== "undefined") {
        const circulation = MarketState.getCirculation(catalogItem.id);
        const ideal = catalogItem.idealBestand || MarketState.config.defaultIdeal;

        const delta = ideal / Math.max(1, circulation);
        marketMult = Math.pow(delta, MarketState.config.damping);

        marketMult = Math.max(
            MarketState.config.minPriceMult,
            Math.min(MarketState.config.maxPriceMult, marketMult)
        );
    }

    /* Lokale Sättigung beim Verkaufen */
    let saturation = 1;
    if (istVerkauf) {
        const owned = data.inventar?.[catalogItem.id] || 0;
        saturation = 1 / (1 + owned * 0.05);
    }

    let price = basis * marketMult;
    if (istVerkauf) price *= 0.7 * saturation;

    return Math.max(1, Math.floor(price));
}

/* =========================
   KAUFEN TAB
========================= */
function renderShopTab(targetId = "modalLeft") {
    const container = document.getElementById(`marketContent_${targetId}`);
    if (!container) return;
    container.innerHTML = "";

    const player = {
        level: data.stats?.currentLevel || 0,
        evoStufe: data.stats?.totalEvoLevel || 0,
        isSub: data.isSub || false
    };

    let itemsForSale = [];
    if (typeof window.getVisibleMarketItems === "function") {
        itemsForSale = window.getVisibleMarketItems(player);
    }

    if (itemsForSale.length === 0) {
        container.innerHTML =
            `<p style="grid-column:1/-1; text-align:center; color:#666;">
                Keine Waren für deinen Rang verfügbar.
            </p>`;
        return;
    }

    itemsForSale.forEach(catalogItem => {
        let meta = (typeof window.getItemById === "function") ? window.getItemById(catalogItem.id) : null;
        if (!meta) meta = { name: catalogItem.id, emoji: "📦" }; // Fallback

        const price = getMarketPrice(catalogItem, false);

        // Emoji-First Logik für den Markt
        const visual = meta.emoji 
            ? `<span style="font-size: 2em; display:block; margin-bottom:5px;">${meta.emoji}</span>`
            : `<img src="${meta.icon || "stone.png"}" style="width:40px; display:block; margin: 0 auto 5px;">`;

        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.35); padding:15px; border-radius:10px; text-align:center;">
                ${visual}
                <div style="color:cyan; font-weight:bold;">${meta.name || catalogItem.id}</div>
                <div style="font-size:12px; color:#aaa;">${meta.desc || meta.description || "Handelsware"}</div>
                <div style="margin:8px 0; color:var(--gold);">${price} LXP</div>
                <button class="btn-action" style="width:100%;" data-action="buyItem" data-args='["${catalogItem.id}", "${targetId}"]'>
                    KAUFEN
                </button>
            </div>
        `;
    });
}

/* =========================
   VERKAUFEN TAB
========================= */
function renderSellTab(targetId = "modalLeft") {
    const container = document.getElementById(`marketContent_${targetId}`);
    if (!container) return;
    container.innerHTML = "";

    let hasItems = false;

    for (const id in data.inventar) {
        if (data.inventar[id] <= 0) continue;

        const catalogItem = findCatalogItem(id);
        if (catalogItem && catalogItem.category === 4) continue; // Sub-Schutz

        let meta = (typeof window.getItemById === "function") ? window.getItemById(id) : null;
        if (!meta) meta = { name: id, emoji: "📦" }; // Fallback

        const price = getMarketPrice(catalogItem || { id, price: 50 }, true);

        // Emoji-First Logik für den Verkauf
        const visual = meta.emoji 
            ? `<span style="font-size: 2em; display:block; margin-bottom:5px;">${meta.emoji}</span>`
            : `<img src="${meta.icon || "stone.png"}" style="width:30px; display:block; margin: 0 auto 5px;">`;

        hasItems = true;
        container.innerHTML += `
            <div style="background:rgba(20,15,10,0.6); padding:15px; border-radius:10px; text-align:center;">
                ${visual}
                <div style="color:var(--gold);">${meta.name || id}</div>
                <div>Besitz: ${data.inventar[id]}</div>
                <div style="color:#4ade80;">+${price} LXP</div>
                <button class="btn-action" style="width:100%; background:#522;"
                        data-action="sellItem" data-args='["${id}", "${targetId}"]'>
                    VERKAUFEN
                </button>
            </div>
        `;
    }

    if (!hasItems) {
        container.innerHTML =
            `<p style="grid-column:1/-1; text-align:center; color:#777;">
                Dein Rucksack ist leer.
            </p>`;
    }
}

/* =========================
   HANDELSLOGIK
========================= */
function buyItem(id, targetId = "modalLeft") {
    const catalogItem = findCatalogItem(id);
    const price = getMarketPrice(catalogItem, false);

    if (data.lxp < price) {
        alert("Nicht genug LXP!");
        return;
    }

    data.lxp -= price;
    data.inventar[id] = (data.inventar[id] || 0) + 1;

    if (typeof MarketState !== "undefined") {
        MarketState.updateCirculation(id, -1);
    }

    finalizeMarketTrade(targetId);
}

function sellItem(id, targetId = "modalLeft") {
    if (!data.inventar[id]) return;

    const catalogItem = findCatalogItem(id);
    const price = getMarketPrice(catalogItem || { id, price: 50 }, true);

    data.lxp += price;
    data.inventar[id]--;

    if (data.inventar[id] <= 0) delete data.inventar[id];

    if (typeof MarketState !== "undefined") {
        MarketState.updateCirculation(id, 1);
    }

    finalizeMarketTrade(targetId);
}

/* =========================
   HELFER
========================= */
function findCatalogItem(id) {
    const catalog = window.MarketCatalog || MarketCatalog;
    if (!catalog) return null;
    for (const group of Object.values(catalog)) {
        if (!Array.isArray(group)) continue;
        const found = group.find(i => i.id === id);
        if (found) return found;
    }
    return null;
}

function finalizeMarketTrade(targetId = "modalLeft") {
    const goldDisplay = document.getElementById(`marketGold_${targetId}`);
    if (goldDisplay) goldDisplay.innerText = data.lxp;
    
    if (typeof save === "function") save();
    renderShopTab(targetId);
}
