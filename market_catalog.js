/**
 * market_catalog.js
 * * Zentrale Datenbank für den LXP-Markt.
 * Kategorien: 1 = Immer kaufbar, 2 = Freischaltbar, 3 = Drop-only, 4 = Sub-Exklusiv
 */

const MarketCatalog = {
    // Ressourcen (Basis-Waren)
    resources: [
        { id: "res_stein", price: 20, category: 1 },
        { id: "res_eisen", price: 45, category: 1 },
        { id: "res_stock", price: 10, category: 1 },
        { id: "res_gras", price: 5, category: 1 },
        { id: "res_kraeuter", price: 25, category: 1 },
        { id: "res_schleimkern", price: 60, category: 1 },
        { id: "res_gold", price: 150, category: 2, reqLevel: 10 },
        { id: "lxp_shard", price: 500, category: 2, reqLevel: 20 }
    ],

    // Starter-Waffen (Holz)
    starter_weapons: [
        { id: "w_holzschwert", price: 50, category: 1 },
        { id: "w_holzdolch", price: 30, category: 1 },
        { id: "w_holzstab", price: 40, category: 1 },
        { id: "w_holzbogen", price: 60, category: 1 },
        { id: "w_pfeile", price: 5, category: 1 },
        { id: "w_holzschild", price: 45, category: 1 }
    ],

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
        { id: "w_f_bogen_1_5", stufe: 1, reqLevel: 5, price: 150, category: 1 },
        { id: "w_f_schwert_1_5", stufe: 1, reqLevel: 5, price: 150, category: 1 },
        { id: "w_f_stab_1_5", stufe: 1, reqLevel: 5, price: 150, category: 1 },
        { id: "w_f_armbrust_1_5", stufe: 1, reqLevel: 5, price: 150, category: 1 },
        { id: "w_f_dolch_1_5", stufe: 1, reqLevel: 5, price: 150, category: 1 },
        
        // Höhere Stufen (Kategorie 2)
        { id: "w_f_bogen_2_8", stufe: 2, reqLevel: 8, reqEvo: 2, price: 450, category: 2 },
        { id: "w_f_schwert_2_8", stufe: 2, reqLevel: 8, reqEvo: 2, price: 450, category: 2 }
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
    for (const key in MarketCatalog) {
        const group = MarketCatalog[key];
        if (!Array.isArray(group)) continue; // Nur Arrays verarbeiten

        group.forEach(item => {
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

