
/**
 * THE NEST - Loot-Datenbank (Master-Datei)
 * Generiert und verwaltet ca. 420+ Items aus 7 Tiers und 5 Kategorien.
 */

const LootManager = {
    // Hilfsfunktion zur gleichmäßigen Verteilung der Stats (Interpolation)
    interpolate: (min, max, step) => {
        return Math.floor(min + (max - min) * (step / 5));
    },

    // Rohdaten der Tiers (Min-Max Werte für Level 5 bis 30)
    data: {
        SWORDS: [
            { t: 1, lName: ["Übungsschwert", "Lehrlingsklinge", "Soldatenstahl", "Ritterschwert", "Ehrenklinge", "Morgenröte"], lVal: [5, 65], dName: ["Schattenklinge", "Düsterdolch", "Nachtschneide", "Fluchstahl", "Finsterklinge", "Seelenfresser"], dVal: [7, 75] },
            { t: 2, lName: ["Elfenstahl-Säbel", "Waldhüter", "Blattklinge", "Hain-Wächter", "Silber-Schwert", "Waldkönig-Klinge"], lVal: [80, 190], dName: ["Obsidian-Stich", "Knochen-Degen", "Vipern-Zahn", "Schatten-Säbel", "Grauen-Klinge", "Nacht-Rapier"], dVal: [90, 220] },
            { t: 3, lName: ["Silberglanz-Zweihänder", "Runen-Klinge", "Licht-Bastard", "Adelsstolz", "Königsglanz", "Heiliges Bastardschwert"], lVal: [210, 380], dName: ["Blutdorn-Klinge", "Rache-Stahl", "Leeren-Säbel", "Dunkel-Herz", "Schatten-Fürst", "Schatten-Duellant-Stolz"], dVal: [240, 430] },
            { t: 4, lName: ["Eichenherz-Klinge", "Sturmbringer", "Himmelsstahl", "Drachen-Zahn", "Banner-Schwert", "Sonnen-Vanguard"], lVal: [410, 680], dName: ["Gift-Nadel", "Säure-Stich", "Toxin-Klinge", "Schmerzensbringer", "Todes-Hauch", "Obsidian-Exekutor"], dVal: [460, 780] },
            { t: 5, lName: ["Drachenschlächter", "Erzengel-Schwert", "Sonnenglas", "Phönix-Klinge", "Aura-Schwert", "Phönix-Großschwert"], lVal: [750, 1150], dName: ["Schatten-Viper-Zahn", "Dämonen-Kralle", "Höllen-Stahl", "Chaos-Klinge", "Abgrund-Schnitt", "Seelen-Schlitzer"], dVal: [850, 1350] },
            { t: 6, lName: ["Excalibur-Splitter", "Götter-Klinge", "Licht-Säule", "Himmels-Zorn", "Äther-Schwert", "Licht-Souverän-Klinge"], lVal: [1300, 2100], dName: ["Leeren-Klinge", "Sternenfresser", "Nachtmahr", "Schatten-Riss", "Ewige Nacht", "Fürst d. Finsternis"], dVal: [1500, 2500] },
            { t: 7, lName: ["Ur-Licht-Schwert", "Genesis-Klinge", "Alfa-Stahl", "Gottes-Hand", "Ewigkeit", "Ewiger Vanguard-Zorn"], lVal: [2400, 4200], dName: ["Schatten-Monarch-Rapier", "Apokalypse", "Endzeit", "Weltentöter", "Nichts-Bringer", "Monarch-Ende"], dVal: [2800, 5000] }
        ],
        SHIELDS: [
            { t: 1, lName: ["Holzschild", "Verstärktes Holz", "Rundschild", "Eisen-Buckler", "Ritterschild", "Eisenwall"], lVal: [10, 80], dName: ["Stachel-Platte", "Rostiger Dorn", "Knochenschild", "Splitterwall", "Blut-Buckler", "Dornen-Ramme"], dVal: [8, 70] },
            { t: 2, lName: ["Stahlschild", "Wächter-Wall", "Glanz-Platte", "Hain-Schutz", "Silber-Aegis", "Turmschild d. Wacht"], lVal: [90, 200], dName: ["Obsidian-Buckler", "Schatten-Schutz", "Dunkel-Platte", "Teer-Wall", "Raben-Schild", "Schwarzer Panzer"], dVal: [80, 180] }
            // ... (Hier folgen STAVES, DAGGERS und BOWS analog zur SWORDS-Struktur)
        ]
    },

    // Generiert den fertigen Loot-Pool
    generatePool: function() {
        const pool = {};
        for (const [cat, tiers] of Object.entries(this.data)) {
            pool[cat] = {};
            tiers.forEach(tier => {
                pool[cat][tier.t] = { light: [], dark: [] };
                for (let i = 0; i < 6; i++) {
                    const level = 5 + (i * 5);
                    
                    // Light Path
                    const lStat = this.interpolate(tier.lVal[0], tier.lVal[1], i);
                    pool[cat][tier.t].light.push({
                        id: `${cat[0]}${tier.t}_L${level}`,
                        name: tier.lName[i],
                        tier: tier.t,
                        levelReq: level,
                        stats: lStat,
                        lxp: Math.floor(lStat * 0.1),
                        path: "light"
                    });

                    // Dark Path
                    const dStat = this.interpolate(tier.dVal[0], tier.dVal[1], i);
                    pool[cat][tier.t].dark.push({
                        id: `${cat[0]}${tier.t}_D${level}`,
                        name: tier.dName[i],
                        tier: tier.t,
                        levelReq: level,
                        stats: dStat,
                        lxp: Math.floor(dStat * 0.1),
                        path: "dark"
                    });
                }
            });
        }
        return pool;
    }
};

const FullLootPool = LootManager.generatePool();

// Export-Funktion für die Engine
function getRandomItem(category, tier, path) {
    const items = FullLootPool[category][tier][path];
    return items[Math.floor(Math.random() * items.length)];
}
