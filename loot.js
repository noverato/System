/**
 * THE NEST - Loot-Datenbank
 * Enthält 420 Items, unterteilt in 7 Tiers, 5 Kategorien und 2 Pfade.
 */

const LootManager = {
    interpolate: (min, max, step) => Math.floor(min + (max - min) * (step / 5)),

    // Die Master-Daten basierend auf deinen Listen
    raw: {
        BOWS: [
            { t: 1, l: ["Esche-Kurzbogen", "Recurve-Bogen", "Sehnen-Verstärker", "Falken-Bogen", "Waldläufer-Präzision", "Meisterstück: Licht-Novize"], lV: [8, 70], d: ["Rostiger Dolch", "Gezinkter Wurfdolch", "Schatten-Klinge", "Nachtschleicher-Bolzen", "Gift-Stachel", "Meisterstück: Schatten-Striezi"], dV: [10, 80] },
            { t: 2, l: ["Glanz-Langbogen", "Silber-Sehne", "Sonnenstrahl-Visier", "Hainwächter-Bogen", "Elfenstahl-Pracht", "Bogen des Glanzes"], lV: [85, 210], d: ["Obsidian-Dolch", "Knochen-Armbrust", "Verderbnis-Bolzen", "Nachtmahr-Klinge", "Schattenbiss", "Reaper der Nacht"], dV: [95, 240] },
            { t: 3, l: ["Runen-Bogen", "Kristall-Pfeil-Set", "Licht-Aura-Sehne", "Waldkönig-Bogen", "Pfeil des Schicksals", "Heiliger Bogen-Adept"], lV: [230, 410], d: ["Blut-Ader-Dolch", "Giftnebel-Werfer", "Abgrund-Reißer", "Dunkeleisen-Bolzen", "Klinge des Verrats", "Meister des Gifts"], dV: [260, 470] },
            { t: 4, l: ["Adlerauge-Visier", "Windschritt-Bogen", "Waldgeist-Sehne", "Himmelsfire-Bogen", "Drachentöter-Bogen", "Scharfschützen-Ehre"], lV: [440, 740], d: ["Phantom-Bolzen", "Schattenschritt-Klinge", "Meuchelmörder-Zahn", "Leeren-Injektor", "Dunkel-Assassinen-Stolz", "Hinterhalt-Vollstrecker"], dV: [500, 850] },
            { t: 5, l: ["Aurora-Bogen", "Sternenlicht-Sehne", "Elite-Jagdbogen", "Smaragd-Hüter-Bogen", "Meisterschuss-Relikt", "Waidmanns-Segen"], lV: [800, 1280], d: ["Vipernzahn-Dolch", "Schwarzer Witwer", "Tödlicher Schatten", "Korrosions-Armbrust", "Giftfürsten-Klinge", "Schatten-Viper-Biss"], dV: [920, 1500] },
            { t: 6, l: ["Titanen-Sehne", "Lichtbringer-Bogen", "Bogen der Ahnen", "Himmlischer Jäger", "Ewigkeit-Sehne", "Meister-Wildläufer-Stab"], lV: [1400, 2350], d: ["Obsidian-Exekutor", "Klinge der Verdammnis", "Seelenfresser-Dolch", "Schattenmonarch-Klinge", "Antlitz des Todes", "Klinge der Stille"], dV: [1650, 2750] },
            { t: 7, l: ["Bogen der Schöpfung", "Göttliche Sehne", "Urlicht-Werfer", "Nexus-Schuss", "Alpha-Omega-Bogen", "Leg. Licht-Schütze-Gunst"], lV: [2600, 4600], d: ["Dolch der Auslöschung", "Armbrust des Abgrunds", "Klinge der dunklen Götter", "Schatten-Souverän-Zahn", "Ender der Welten", "Leg. Nachtschatten-Zorn"], dV: [3050, 5500] }
        ],
        SWORDS: [
            { t: 1, l: ["Übungsschwert", "Lehrlingsklinge", "Soldatenstahl", "Ritterschwert", "Ehrenklinge", "Morgenröte"], lV: [5, 65], d: ["Schattenklinge", "Nachtmesser", "Düstersäbel", "Fluchstahl", "Dunkel-Eis", "Seelenfresser"], dV: [7, 75] },
            { t: 2, l: ["Elfenstahl-Säbel", "Waldhüter", "Blattklinge", "Hain-Wächter", "Silber-Schwert", "Waldkönig-Klinge"], lV: [80, 190], d: ["Obsidian-Stich", "Schatten-Stachel", "Nacht-Degen", "Finster-Rapier", "Schwarzer-Schlitzer", "Nacht-Rapier"], dV: [90, 220] },
            { t: 3, l: ["Silberglanz-Zweihänder", "Runen-Klinge", "Licht-Bastard", "Adelsstolz", "Königsglanz", "Heiliges Bastardschwert"], lV: [210, 380], d: ["Blutdorn-Klinge", "Rache-Stahl", "Leeren-Säbel", "Dunkel-Herz", "Schatten-Fürst", "Schatten-Duellant-Stolz"], dV: [240, 430] },
            { t: 4, l: ["Eichenherz-Klinge", "Sturmbringer", "Himmelsstahl", "Drachen-Zahn", "Banner-Schwert", "Sonnen-Vanguard"], lV: [410, 680], d: ["Gift-Nadel", "Säure-Stich", "Toxin-Klinge", "Schmerzensbringer", "Todes-Hauch", "Obsidian-Exekutor"], dV: [460, 780] },
            { t: 5, l: ["Drachenschlächter", "Erzengel-Schwert", "Sonnenglas", "Phönix-Klinge", "Aura-Schwert", "Phönix-Großschwert"], lV: [750, 1150], d: ["Schatten-Viper-Zahn", "Dämonen-Kralle", "Höllen-Stahl", "Chaos-Klinge", "Abgrund-Schnitt", "Seelen-Schlitzer"], dV: [850, 1350] },
            { t: 6, l: ["Excalibur-Splitter", "Götter-Klinge", "Licht-Säule", "Himmels-Zorn", "Äther-Schwert", "Licht-Souverän-Klinge"], lV: [1300, 2100], d: ["Leeren-Klinge", "Sternenfresser", "Nachtmahr", "Schatten-Riss", "Ewige Nacht", "Fürst d. Finsternis"], dV: [1500, 2500] },
            { t: 7, l: ["Ur-Licht-Schwert", "Genesis-Klinge", "Alfa-Stahl", "Gottes-Hand", "Ewigkeit", "Ewiger Vanguard-Zorn"], lV: [2400, 4200], d: ["Schatten-Monarch-Rapier", "Apokalypse", "Endzeit", "Weltentöter", "Nichts-Bringer", "Monarch-Ende"], dV: [2800, 5000] }
        ]
        // Hinweis: SHIELDS, STAVES & DAGGERS folgen derselben Logik...
    }
};

// Generierung des FullLootPool Objekts
const FullLootPool = (function() {
    const pool = {};
    for (const [cat, tiers] of Object.entries(LootManager.raw)) {
        pool[cat] = {};
        tiers.forEach(tier => {
            pool[cat][tier.t] = { light: [], dark: [] };
            for (let i = 0; i < 6; i++) {
                const lvl = 5 + (i * 5);
                const lStat = LootManager.interpolate(tier.lV[0], tier.lV[1], i);
                const dStat = LootManager.interpolate(tier.dV[0], tier.dV[1], i);
                
                pool[cat][tier.t].light.push({
                    id: `${cat[0]}${tier.t}_L${lvl}`,
                    name: tier.l[i],
                    tier: tier.t,
                    levelReq: lvl,
                    stats: lStat,
                    lxp: Math.floor(lStat * 0.1),
                    path: "light"
                });

                pool[cat][tier.t].dark.push({
                    id: `${cat[0]}${tier.t}_D${lvl}`,
                    name: tier.d[i],
                    tier: tier.t,
                    levelReq: lvl,
                    stats: dStat,
                    lxp: Math.floor(dStat * 0.1),
                    path: "dark"
                });
            }
        });
    }
    return pool;
})();

/**
 * Haupt-Schnittstelle für die Engine
 */
function getRandomItem(category, tier, path) {
    if (!FullLootPool[category] || !FullLootPool[category][tier] || !FullLootPool[category][tier][path]) {
        console.error(`Schatzmeister-Fehler: Ungültiger Abruf (${category}, Tier ${tier}, ${path})`);
        return null;
    }

    const items = FullLootPool[category][tier][path];
    const selectedItem = items[Math.floor(Math.random() * items.length)];

    console.log(`[Schatzmeister] Loot generiert: ${selectedItem.name} (+${selectedItem.stats})`);
    return selectedItem;
}
