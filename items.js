/**
 * THE NEST: OVERLORD EDITION 2026 - ITEM DATABASE
 * Core System for Inventory, Marketplace and Evolution
 */

const ITEM_DATABASE = {
    // --- RESSOURCEN (NEU: Futter für Buddy 11 & Buddy 8) ---
    resources: {
        "res_stein": { id: "res_stein", name: "Stein", emoji: "🪨", type: "resource", rarity: "Common", description: "Einfacher Baumaterial." },
        "res_eisen": { id: "res_eisen", name: "Eisen", emoji: "⛓️", type: "resource", rarity: "Common", description: "Wichtig für stabile Ausrüstung." },
        "res_gold": { id: "res_gold", name: "Gold-Erz", emoji: "🟡", type: "resource", rarity: "Uncommon", description: "Glänzt und ist wertvoll." },
        "lxp_shard": { id: "lxp_shard", name: "LXP-Splitter", emoji: "💎", type: "lxp", rarity: "Rare", description: "Ein Fragment purer Erfahrung." }
    },

    // --- WAFFEN: LICHT-PFAD ---
    weapons_light: {
        boegen: {
            "w_f_bogen_1_5": { id: "w_f_bogen_1_5", name: "Esche-Kurzbogen", levelReq: 5, evoReq: 1, stats: { atk: 8 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_2_8": { id: "w_f_bogen_2_8", name: "Eiben-Langbogen", levelReq: 8, evoReq: 2, stats: { atk: 15 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_3_12": { id: "w_f_bogen_3_12", name: "Wächter-Bogen", levelReq: 12, evoReq: 3, stats: { atk: 28 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_4_16": { id: "w_f_bogen_4_16", name: "Lichtbringer-Sehne", levelReq: 16, evoReq: 4, stats: { atk: 42 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_5_20": { id: "w_f_bogen_5_20", name: "Waldläufer-Pracht", levelReq: 20, evoReq: 5, stats: { atk: 60 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_6_25": { id: "w_f_bogen_6_25", name: "Himmels-Schütze", levelReq: 25, evoReq: 6, stats: { atk: 85 }, type: "Waffe", rarity: "Follower" },
            "w_f_bogen_7_30": { id: "w_f_bogen_7_30", name: "Artemis' Vermächtnis", levelReq: 30, evoReq: 7, stats: { atk: 120 }, type: "Waffe", rarity: "Follower" }
        },
        schwerter: {
            "w_f_schwert_1_5": { id: "w_f_schwert_1_5", name: "Rostiges Übungsschwert", levelReq: 5, evoReq: 1, stats: { atk: 10 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_2_8": { id: "w_f_schwert_2_8", name: "Geschmiedeter Stahl", levelReq: 8, evoReq: 2, stats: { atk: 18 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_3_12": { id: "w_f_schwert_3_12", name: "Soldaten-Klinge", levelReq: 12, evoReq: 3, stats: { atk: 32 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_4_16": { id: "w_f_schwert_4_16", name: "Ritter-Epos", levelReq: 16, evoReq: 4, stats: { atk: 48 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_5_20": { id: "w_f_schwert_5_20", name: "Paladin-Zorn", levelReq: 20, evoReq: 5, stats: { atk: 68 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_6_25": { id: "w_f_schwert_6_25", name: "Heiliger Glanz", levelReq: 25, evoReq: 6, stats: { atk: 95 }, type: "Waffe", rarity: "Follower" },
            "w_f_schwert_7_30": { id: "w_f_schwert_7_30", name: "Excalibur-Fragment", levelReq: 30, evoReq: 7, stats: { atk: 135 }, type: "Waffe", rarity: "Follower" }
        },
        kristallstaebe: {
            "w_f_stab_1_5": { id: "w_f_stab_1_5", name: "Einfacher Ast", levelReq: 5, evoReq: 1, stats: { atk: 12 }, type: "Waffe", rarity: "Follower" }
        }
    },

    // --- WAFFEN: DUNKEL-PFAD ---
    weapons_dark: {
        armbrueste: {
            "w_f_armbrust_1_5": { id: "w_f_armbrust_1_5", name: "Leichte Repetierarmbrust", levelReq: 5, evoReq: 1, stats: { atk: 11 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_2_8": { id: "w_f_armbrust_2_8", name: "Schatten-Bolzenschuss", levelReq: 8, evoReq: 2, stats: { atk: 20 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_3_12": { id: "w_f_armbrust_3_12", name: "Assassinen-Winde", levelReq: 12, evoReq: 3, stats: { atk: 35 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_4_16": { id: "w_f_armbrust_4_16", name: "Nachtschatten-Werfer", levelReq: 16, evoReq: 4, stats: { atk: 52 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_5_20": { id: "w_f_armbrust_5_20", name: "Witwenmacher", levelReq: 20, evoReq: 5, stats: { atk: 75 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_6_25": { id: "w_f_armbrust_6_25", name: "Dämonen-Atem", levelReq: 25, evoReq: 6, stats: { atk: 105 }, type: "Waffe", rarity: "Follower" },
            "w_f_armbrust_7_30": { id: "w_f_armbrust_7_30", name: "Höllenfeuer-Salve", levelReq: 30, evoReq: 7, stats: { atk: 150 }, type: "Waffe", rarity: "Follower" }
        },
        dolche: {
            "w_f_dolch_1_5": { id: "w_f_dolch_1_5", name: "Küchenmesser des Grauens", levelReq: 5, evoReq: 1, stats: { atk: 7 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_2_8": { id: "w_f_dolch_2_8", name: "Gezackter Dolch", levelReq: 8, evoReq: 2, stats: { atk: 14 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_3_12": { id: "w_f_dolch_3_12", name: "Giftzahn", levelReq: 12, evoReq: 3, stats: { atk: 25 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_4_16": { id: "w_f_dolch_4_16", name: "Schattenklinge", levelReq: 16, evoReq: 4, stats: { atk: 38 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_5_20": { id: "w_f_dolch_5_20", name: "Lautloser Tod", levelReq: 20, evoReq: 5, stats: { atk: 55 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_6_25": { id: "w_f_dolch_6_25", name: "Seelenschlitzer", levelReq: 25, evoReq: 6, stats: { atk: 80 }, type: "Waffe", rarity: "Follower" },
            "w_f_dolch_7_30": { id: "w_f_dolch_7_30", name: "Abgrund-Stachel", levelReq: 30, evoReq: 7, stats: { atk: 110 }, type: "Waffe", rarity: "Follower" }
        }
    },

    // --- RÜSTUNGEN (EINZELTEILE) ---
    armor: {
        head: { "a_f_head_1": { id: "a_f_head_1", name: "Lederhaube", levelReq: 5, evoReq: 1, stats: { def: 5 }, type: "Rüstung", rarity: "Follower" } },
        chest: { "a_f_chest_1": { id: "a_f_chest_1", name: "Leinenwams", levelReq: 5, evoReq: 1, stats: { def: 8 }, type: "Rüstung", rarity: "Follower" } },
        legs: { "a_f_legs_1": { id: "a_f_legs_1", name: "Stoffhose", levelReq: 5, evoReq: 1, stats: { def: 4 }, type: "Rüstung", rarity: "Follower" } },
        feet: { "a_f_feet_1": { id: "a_f_feet_1", name: "Wanderschuhe", levelReq: 5, evoReq: 1, stats: { def: 3 }, type: "Rüstung", rarity: "Follower" } }
    },

    // --- SCHILDE ---
    shields: {
        light: { "s_f_light_1": { id: "s_f_light_1", name: "Holzschild", levelReq: 5, evoReq: 1, stats: { def: 10 }, type: "Schild", rarity: "Follower" } },
        dark: { "s_f_dark_1": { id: "s_f_dark_1", name: "Verstärkter Rundschild", levelReq: 5, evoReq: 1, stats: { def: 12 }, type: "Schild", rarity: "Follower" } }
    },

    // --- SUB-SPECIALS ---
    specials: { sub_armor: {}, sub_weapons: {} }
};

/**
 * HELPER FUNCTIONS
 */

function getItemById(id) {
    const search = (obj) => {
        for (const key in obj) {
            if (obj[key] && obj[key].id === id) return obj[key];
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const found = search(obj[key]);
                if (found) return found;
            }
        }
        return null;
    };
    return search(ITEM_DATABASE);
}

function getItemsByEvo(stufe) {
    const results = [];
    const search = (obj) => {
        for (const key in obj) {
            if (obj[key] && obj[key].evoReq === stufe) {
                results.push(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null && !obj[key].id) {
                search(obj[key]);
            }
        }
    };
    search(ITEM_DATABASE);
    return results;
}

console.log("⚔️ Item-Warenlager mit Follower-Waffen & Bergbau-Ressourcen synchronisiert.");
