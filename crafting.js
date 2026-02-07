const Crafting = (() => {
    const RECIPES = {
        craft_faser: { id: 'craft_faser', name: 'Pflanzenfaser', emoji: '🧵', category: 'materials', inputs: [{ id: 'res_gras', qty: 3 }], output: { id: 'craft_faser', qty: 1 } },
        craft_stoffballen: { id: 'craft_stoffballen', name: 'Stoffballen', emoji: '📦', category: 'materials', inputs: [{ id: 'craft_faser', qty: 4 }], output: { id: 'craft_stoffballen', qty: 1 } },
        craft_holzstamm: { id: 'craft_holzstamm', name: 'Holzstamm', emoji: '🌲', category: 'materials', inputs: [{ id: 'res_stock', qty: 5 }], output: { id: 'craft_holzstamm', qty: 1 } },
        craft_waffengriff: { id: 'craft_waffengriff', name: 'Waffengriff', emoji: '🦯', category: 'materials', inputs: [{ id: 'res_stock', qty: 1 }, { id: 'craft_faser', qty: 1 }], output: { id: 'craft_waffengriff', qty: 1 } },
        craft_holz_schneide: { id: 'craft_holz_schneide', name: 'Holz-Schneide', emoji: '📏', category: 'materials', inputs: [{ id: 'res_stock', qty: 2 }], output: { id: 'craft_holz_schneide', qty: 1 } },
        craft_geschliffener_stein: { id: 'craft_geschliffener_stein', name: 'Geschliffener Stein', emoji: '🪨', category: 'materials', inputs: [{ id: 'res_stein', qty: 2 }], output: { id: 'craft_geschliffener_stein', qty: 1 } },
        craft_eisenbarren: { id: 'craft_eisenbarren', name: 'Eisenbarren', emoji: '🧱', category: 'materials', inputs: [{ id: 'res_eisenerz', qty: 2 }, { id: 'res_kohle', qty: 1 }], output: { id: 'craft_eisenbarren', qty: 1 } },

        armor_feet_t1: { id: 'armor_feet_t1', name: 'Füße I', emoji: '🥿', category: 'armor_t1', req: { evo: 'Ei' }, inputs: [{ id: 'craft_stoffballen', qty: 1 }, { id: 'craft_faser', qty: 1 }], outputVariants: { light: { id: 'a_light_feet_t1', name: 'Licht-Füße I', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_feet_t1', name: 'Dunkel-Füße I', emoji: '🌑', qty: 1 } } },
        armor_legs_t1: { id: 'armor_legs_t1', name: 'Beine I', emoji: '👖', category: 'armor_t1', req: { evo: 'Ei' }, inputs: [{ id: 'craft_stoffballen', qty: 2 }, { id: 'craft_faser', qty: 2 }], outputVariants: { light: { id: 'a_light_legs_t1', name: 'Licht-Beine I', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_legs_t1', name: 'Dunkel-Beine I', emoji: '🌑', qty: 1 } } },
        armor_head_t1: { id: 'armor_head_t1', name: 'Kopf I', emoji: '🪖', category: 'armor_t1', req: { evo: 'Ei' }, inputs: [{ id: 'craft_stoffballen', qty: 1 }, { id: 'res_kraeuter', qty: 1 }], outputVariants: { light: { id: 'a_light_head_t1', name: 'Licht-Kopf I', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_head_t1', name: 'Dunkel-Kopf I', emoji: '🌑', qty: 1 } } },
        armor_chest_t1: { id: 'armor_chest_t1', name: 'Brust I', emoji: '🎽', category: 'armor_t1', req: { evo: 'Ei' }, inputs: [{ id: 'craft_stoffballen', qty: 3 }, { id: 'craft_faser', qty: 2 }], outputVariants: { light: { id: 'a_light_chest_t1', name: 'Licht-Brust I', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_chest_t1', name: 'Dunkel-Brust I', emoji: '🌑', qty: 1 } } },

        armor_feet_t2: { id: 'armor_feet_t2', name: 'Füße II', emoji: '🥿', category: 'armor_t2', req: { evo: 'Drachenküken' }, inputs: [{ id: 'craft_eisenbarren', qty: 1 }, { id: 'craft_stoffballen', qty: 1 }], outputVariants: { light: { id: 'a_light_feet_t2', name: 'Licht-Füße II', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_feet_t2', name: 'Dunkel-Füße II', emoji: '🌑', qty: 1 } } },
        armor_legs_t2: { id: 'armor_legs_t2', name: 'Beine II', emoji: '👖', category: 'armor_t2', req: { evo: 'Drachenküken' }, inputs: [{ id: 'craft_eisenbarren', qty: 2 }, { id: 'craft_stoffballen', qty: 1 }], outputVariants: { light: { id: 'a_light_legs_t2', name: 'Licht-Beine II', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_legs_t2', name: 'Dunkel-Beine II', emoji: '🌑', qty: 1 } } },
        armor_head_t2: { id: 'armor_head_t2', name: 'Kopf II', emoji: '🪖', category: 'armor_t2', req: { evo: 'Drachenküken' }, inputs: [{ id: 'craft_eisenbarren', qty: 1 }, { id: 'craft_faser', qty: 1 }], outputVariants: { light: { id: 'a_light_head_t2', name: 'Licht-Kopf II', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_head_t2', name: 'Dunkel-Kopf II', emoji: '🌑', qty: 1 } } },
        armor_chest_t2: { id: 'armor_chest_t2', name: 'Brust II', emoji: '🎽', category: 'armor_t2', req: { evo: 'Drachenküken' }, inputs: [{ id: 'craft_eisenbarren', qty: 3 }, { id: 'craft_stoffballen', qty: 2 }], outputVariants: { light: { id: 'a_light_chest_t2', name: 'Licht-Brust II', emoji: '☀️', qty: 1 }, dark: { id: 'a_dark_chest_t2', name: 'Dunkel-Brust II', emoji: '🌑', qty: 1 } } },

        w_holzdolch: { id: 'w_holzdolch', name: 'Holzdolch', emoji: '🗡️', category: 'weapons', inputs: [{ id: 'res_stock', qty: 1 }, { id: 'craft_faser', qty: 1 }], output: { id: 'w_holzdolch', qty: 1 } },
        w_holzschwert: { id: 'w_holzschwert', name: 'Holzschwert', emoji: '⚔️', category: 'weapons', inputs: [{ id: 'craft_waffengriff', qty: 1 }, { id: 'craft_holz_schneide', qty: 1 }, { id: 'craft_faser', qty: 1 }], output: { id: 'w_holzschwert', qty: 1 } },
        w_holzspeer: { id: 'w_holzspeer', name: 'Holzspeer', emoji: '🔱', category: 'weapons', inputs: [{ id: 'craft_waffengriff', qty: 1 }, { id: 'res_stock', qty: 1 }, { id: 'craft_faser', qty: 1 }], output: { id: 'w_holzspeer', qty: 1 } },
        w_holzkeule: { id: 'w_holzkeule', name: 'Holzkeule', emoji: '🪵', category: 'weapons', inputs: [{ id: 'craft_waffengriff', qty: 1 }, { id: 'res_stock', qty: 3 }], output: { id: 'w_holzkeule', qty: 1 } },
        w_bogen_einfach: { id: 'w_bogen_einfach', name: 'Einfacher Bogen', emoji: '🏹', category: 'weapons', inputs: [{ id: 'craft_waffengriff', qty: 1 }, { id: 'craft_faser', qty: 2 }], output: { id: 'w_bogen_einfach', qty: 1 } },
        w_steinspitzhacke: { id: 'w_steinspitzhacke', name: 'Steinspitzhacke', emoji: '⚒️', category: 'weapons', inputs: [{ id: 'craft_waffengriff', qty: 1 }, { id: 'craft_geschliffener_stein', qty: 2 }], output: { id: 'w_steinspitzhacke', qty: 1 } },

        cons_verband: { id: 'cons_verband', name: 'Einfacher Verband', emoji: '🩹', category: 'consumables', inputs: [{ id: 'craft_stoffballen', qty: 1 }], output: { id: 'cons_verband', qty: 1 } },
        cons_heilverband: { id: 'cons_heilverband', name: 'Heilverband', emoji: '✨', category: 'consumables', inputs: [{ id: 'cons_verband', qty: 1 }, { id: 'res_kraeuter', qty: 1 }], output: { id: 'cons_heilverband', qty: 1 } },
        cons_mp_trank: { id: 'cons_mp_trank', name: 'MP-Trank', emoji: '🧪', category: 'consumables', inputs: [{ id: 'res_monsterkern', qty: 1 }, { id: 'res_wasser', qty: 1 }, { id: 'res_kristall', qty: 1 }], output: { id: 'cons_mp_trank', qty: 1 } }
    };

    function getRecipe(id) {
        return RECIPES[id] || null;
    }

    function listRecipes(category) {
        const list = Object.values(RECIPES);
        return category ? list.filter(r => r.category === category) : list;
    }

    function currentRank() {
        const s = (typeof window !== 'undefined' ? window.data : globalThis.data) || {};
        const stats = s.stats || {};
        return stats.className || 'Ei';
    }

    function meetsReq(req) {
        if (!req || !req.evo) return true;
        const rank = currentRank();
        if (req.evo === 'Ei') return true;
        if (req.evo === 'Drachenküken') return rank !== 'Ei';
        return true;
    }

    function hasMaterials(inputs) {
        const inv = (typeof window !== 'undefined' ? window.data : globalThis.data).inventar || {};
        return (inputs || []).every(x => (inv[x.id] || 0) >= (x.qty || 1));
    }

    function removeInputs(inputs) {
        const s = (typeof window !== 'undefined' ? window.data : globalThis.data);
        s.inventar = s.inventar || {};
        (inputs || []).forEach(x => {
            const cur = s.inventar[x.id] || 0;
            const next = Math.max(0, cur - (x.qty || 1));
            if (next === 0) delete s.inventar[x.id]; else s.inventar[x.id] = next;
        });
    }

    function addItem(id, name, emoji, qty) {
        const s = (typeof window !== 'undefined' ? window.data : globalThis.data);
        s.inventar = s.inventar || {};
        s.inventar[id] = (s.inventar[id] || 0) + (qty || 1);
        s.inventarMeta = s.inventarMeta || {};
        s.inventarMeta[id] = { name, emoji };
    }

    function resolveOutput(r, options) {
        if (!r.outputVariants) return r.output;
        const set = (options && options.set) || 'light';
        return r.outputVariants[set] || r.outputVariants.light;
    }

    function canCraft(recipeId) {
        const r = getRecipe(recipeId);
        if (!r) return false;
        if (!meetsReq(r.req)) return false;
        if (!hasMaterials(r.inputs)) return false;
        return true;
    }

    function craft(recipeId, options) {
        const r = getRecipe(recipeId);
        if (!r) return { success: false };
        if (!meetsReq(r.req)) return { success: false };
        if (!hasMaterials(r.inputs)) return { success: false };
        const out = resolveOutput(r, options);
        removeInputs(r.inputs);
        addItem(out.id, out.name || r.name, out.emoji || r.emoji, out.qty || 1);
        if (typeof window !== 'undefined') {
            if (typeof window.save === 'function') window.save();
            if (typeof window.updateUI === 'function') window.updateUI();
            if (window.EventHub && typeof window.EventHub.emit === 'function') {
                try { window.EventHub.emit('craft:success', { recipeId, output: out }); } catch {}
            }
        }
        return { success: true, output: out };
    }

    return { canCraft, craft, getRecipe, listRecipes };
})();

window.Crafting = Crafting;

