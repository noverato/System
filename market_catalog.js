/**
 * market_catalog.js
 * * Zentrale Datenbank für den LXP-Markt.
 * Kategorien: 1 = Immer kaufbar, 2 = Freischaltbar, 3 = Drop-only, 4 = Sub-Exklusiv
 */

const MarketCatalog = {
    // Rüstungen (Nur Einzelteile für Follower)
    armors: [
        // Stufe 1: Immer kaufbar
        { id: "armor_wald_1", name: "Wald-Rekruten-Harnisch", type: "Brust", stufe: 1, price: 100, category: 1 },
        { id: "armor_schatten_1", name: "Schatten-Fechter-Leder", type: "Brust", stufe: 1, price: 100, category: 1 },
        
        // Stufe 2: Freischaltbar (Erscheint ab Spieler-Evo 2)
        { id: "armor_silber_2", name: "Silber-Gardist-Panzer", type: "Brust", stufe: 2, price: 500, category: 2, reqEvo: 2 },
        { id: "armor_obsidian_2", name: "Obsidian-Klingen-Harnisch", type: "Brust", stufe: 2, price: 500, category: 2, reqEvo: 2 },

        // Stufe 7: Legendär (Kategorie 3: In diesem File dokumentiert, aber 'market_visible: false')
        { id: "armor_souv_7", name: "Leg. Souverän-Pracht", type: "Brust", stufe: 7, price: 0, category: 3, market_visible: false }
    ],

    // Waffen Evolution (Basierend auf Level/Evo)
    weapons: [
        { id: "wpn_esche_5", name: "Esche-Kurzbogen", atk: 8, stufe: 1, reqLevel: 5, price: 150, category: 1 },
        { id: "wpn_rost_5", name: "Rostiger Dolch", atk: 10, stufe: 1, reqLevel: 5, price: 150, category: 1 },
        // Höhere Stufen benötigen entsprechendes Level
        { id: "wpn_falke_20", name: "Falken-Bogen", atk: 35, stufe: 1, reqLevel: 20, price: 1200, category: 2 }
    ],

    // Sub-Exklusive Sets (Nur komplette Sets, niemals handelbar)
    sub_sets: [
        { 
            id: "sub_dragon_1", 
            name: "Schuppenpanzer des Drachenjungen", 
            bonus: "+15% HP / +10% DEF", 
            price: 5000, 
            category: 4, 
            css_class: "glow-green-scales",
            isFullSet: true 
        },
        { 
            id: "sub_lich_6", 
            name: "Gewand der Astral-Eminenz", 
            bonus: "+200% HP / +150% DEF", 
            price: 50000, 
            category: 4, 
            css_class: "opacity-70",
            isFullSet: true 
        }
    ]
};

/**
 * Filter-Logik für die Anzeige im Frontend
 * @param {Object} player - Das aktuelle Spieler-Objekt
 */
function getVisibleMarketItems(player) {
    let availableItems = [];

    // Gehe alle Kategorien durch
    for (const category in MarketCatalog) {
        MarketCatalog[category].forEach(item => {
            
            // Regel 1: Drop-only Items niemals im LXP-Markt zeigen
            if (item.category === 3 || item.market_visible === false) return;

            // Regel 2: Sub-Exklusiv (Nur für Subs sichtbar)
            if (item.category === 4 && !player.isSub) return;

            // Regel 3: Freischaltbar durch Level/Evo
            if (item.category === 2) {
                if (item.reqEvo && player.evoStufe < item.reqEvo) return;
                if (item.reqLevel && player.level < item.reqLevel) return;
            }

            // Wenn alle Checks bestanden: Item zum Shop hinzufügen
            availableItems.push(item);
        });
    }
    return availableItems;
}

window.MarketCatalog = MarketCatalog;
window.getVisibleMarketItems = getVisibleMarketItems;

