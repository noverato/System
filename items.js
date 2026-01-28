/**
 * THE NEST: OVERLORD EDITION 2026 - ITEM DATABASE
 * Core System for Inventory, Marketplace and Evolution
 */

const ITEM_DATABASE = {
    // --- WAFFEN: LICHT-PFAD ---
    weapons_light: {
        boegen: {
            "w_licht_bogen_1_5": { id: "w_licht_bogen_1_5", name: "Lichtbringer Bogen", levelReq: 5, evoReq: 1, stats: { atk: 12 }, type: "Waffe", rarity: "Follower" },
            "w_licht_bogen_2_15": { id: "w_licht_bogen_2_15", name: "Sonnenstrahl-Sehne", levelReq: 15, evoReq: 3, stats: { atk: 45 }, type: "Waffe", rarity: "Subscriber" }
        },
        schwerter: {
            "w_licht_schwert_1_5": { id: "w_licht_schwert_1_5", name: "Novizen-Klinge des Lichts", levelReq: 5, evoReq: 1, stats: { atk: 15 }, type: "Waffe", rarity: "Follower" }
        },
        kristallstaebe: {
            "w_licht_stab_1_10": { id: "w_licht_stab_1_10", name: "Saphir-Fokus Stab", levelReq: 10, evoReq: 2, stats: { atk: 25 }, type: "Waffe", rarity: "Follower" }
        },
        kurzschwerter: {},
        rapiere: {}
    },

    // --- WAFFEN: DUNKEL-PFAD ---
    weapons_dark: {
        armbrueste: {
            "w_dunkel_armbrust_1_5": { id: "w_dunkel_armbrust_1_5", name: "Schatten-Bolzenwerfer", levelReq: 5, evoReq: 1, stats: { atk: 14 }, type: "Waffe", rarity: "Follower" }
        },
        degen: {},
        runen: {},
        dolche: {},
        katanas: {
            "w_dunkel_katana_1_20": { id: "w_dunkel_katana_1_20", name: "Nachtklinge Yasuo", levelReq: 20, evoReq: 4, stats: { atk: 65 }, type: "Waffe", rarity: "Subscriber" }
        }
    },

    // --- RÜSTUNGEN (EINZELTEILE) ---
    armor: {
        head: {
            "a_head_basic_5": { id: "a_head_basic_5", name: "Lederhaube des Suchenden", levelReq: 5, evoReq: 1, stats: { def: 5 }, type: "Rüstung", rarity: "Follower" }
        },
        chest: {
            "a_chest_plate_10": { id: "a_chest_plate_10", name: "Brustplatte des Wächters", levelReq: 10, evoReq: 2, stats: { def: 15 }, type: "Rüstung", rarity: "Follower" }
        },
        legs: {
            "a_legs_basic_5": { id: "a_legs_basic_5", name: "Stoffhose der Ahnen", levelReq: 5, evoReq: 1, stats: { def: 3 }, type: "Rüstung", rarity: "Follower" }
        },
        feet: {
            "a_feet_heavy_15": { id: "a_feet_heavy_15", name: "Eisenstiefel des Molochs", levelReq: 15, evoReq: 3, stats: { def: 10 }, type: "Rüstung", rarity: "Subscriber" }
        }
    },

    // --- SCHILDE ---
    shields: {
        light: {
            "s_light_prunk_1": { id: "s_light_prunk_1", name: "Goldener Prunkschild", levelReq: 10, evoReq: 2, stats: { def: 20 }, type: "Schild", rarity: "Subscriber" }
        },
        dark: {
            "s_dark_dornen_1": { id: "s_dark_dornen_1", name: "Vampirischer Dornenschild", levelReq: 12, evoReq: 2, stats: { def: 18, recoil: 5 }, type: "Schild", rarity: "Subscriber" }
        }
    },

    // --- SUB-SPECIALS (EXTREME MULTIPLIKATOREN & CSS EFFEKTE) ---
    specials: {
        sub_armor: {
            "sub_aura_chaos": { 
                id: "sub_aura_chaos", 
                name: "Chaos-Aura der Götter", 
                levelReq: 30, 
                evoReq: 7, 
                stats: { defMult: 2.5, hpBoost: 500 }, 
                cssEffect: "glow-purple-pulse", 
                type: "Sub-Rüstung", 
                rarity: "Subscriber" 
            }
        },
        sub_weapons: {
            "sub_blade_void": { 
                id: "sub_blade_void", 
                name: "Void-Klinge der Vernichtung", 
                levelReq: 30, 
                evoReq: 7, 
                stats: { atkMult: 3.0 }, 
                cssEffect: "void-distortion", 
                type: "Sub-Waffe", 
                rarity: "Subscriber" 
            }
        }
    }
};

/**
 * HELPER FUNCTIONS
 */

/**
 * Sucht ein Item über alle Kategorien hinweg anhand der ID
 */
function getItemById(id) {
    for (const category in ITEM_DATABASE) {
        const subCats = ITEM_DATABASE[category];
        for (const subKey in subCats) {
            // Check if it's a direct item (like in armor) or a sub-category (like in weapons)
            if (subCats[subKey].id === id) return subCats[subKey];
            
            // Deep search for weapons structure
            if (typeof subCats[subKey] === 'object') {
                const item = subCats[subKey][id];
                if (item) return item;
            }
        }
    }
    console.warn(`Item mit ID ${id} nicht gefunden!`);
    return null;
}

/**
 * Gibt alle Items zurück, die für eine bestimmte Evo-Stufe verfügbar sind
 */
function getItemsByEvo(stufe) {
    const results = [];
    const search = (obj) => {
        for (const key in obj) {
            if (obj[key].evoReq === stufe) {
                results.push(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                search(obj[key]);
            }
        }
    };
    search(ITEM_DATABASE);
    return results;
}

// Export für die Nutzung in anderen Skripten
console.log("⚔️ Item-Datenbank geladen. Einheiten bereit zur Ausrüstung.");
