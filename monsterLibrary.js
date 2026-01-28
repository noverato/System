/**
 * monsterLibrary.js
 * * Diese Bibliothek verwaltet die Generierung von Monstern für das Twitch-RPG "Nest Overlord Edition".
 * Sie berechnet dynamisch Werte basierend auf Präfixen, Kernen und dem Spieler-Level.
 */

const MonsterLibrary = {
    // --- DATEN-POOLS ---
    prefixes: [
        { name: "Riesiges", hpMod: 1.5, atkMod: 1.0, lxpMod: 1.0 },
        { name: "Brennendes", hpMod: 1.0, atkMod: 1.2, lxpMod: 1.0 },
        { name: "Gepanzerte", hpMod: 1.2, atkMod: 1.0, lxpMod: 1.0 },
        { name: "Flinker", hpMod: 0.8, atkMod: 1.3, lxpMod: 1.0 },
        { name: "Uralter", hpMod: 2.0, atkMod: 1.1, lxpMod: 1.5 },
        { name: "Schattenhaftes", hpMod: 0.9, atkMod: 1.4, lxpMod: 1.2 },
        { name: "Rasender", hpMod: 1.0, atkMod: 1.5, lxpMod: 1.1 },
        { name: "Giftige", hpMod: 1.1, atkMod: 1.2, lxpMod: 1.0 },
        { name: "Winziger", hpMod: 0.5, atkMod: 1.1, lxpMod: 0.8 },
        { name: "Goldenes", hpMod: 1.0, atkMod: 1.0, lxpMod: 10.0 }
    ],

    wildnisKerne: [
        "Slime", "Goblin", "Skelett", "Waldspinne", "Hornisse", "Schattenwolf", 
        "Moos-Golem", "Grab-Untoter", "Sumpf-Echse", "Wildschwein", "Riesenkäfer", 
        "Waldgeist", "Harpyie", "Kobold", "Irrlicht", "Dunkel-Elf", "Bandit", 
        "Pilz-Kreatur", "Ranken-Monster", "Fledermaus", "Skorpion", "Erdegeler", 
        "Steinbeißer", "Nebel-Panzer", "Blut-Adler", "Reißzahn-Luchs", 
        "Krallenfrosch", "Weiden-Wächter", "Ruinen-Wächter", "Mimic"
    ],

    arenaBosse: [
        "Der Arena-Meister", "Knochen-Gigant", "Mantikor", "Minotaurus-Wächter", 
        "Hydra-Setzling", "Vampir-Lord", "Dämonen-Ritter", "Medusa", 
        "Zerberus", "Der Schatten-Monarch"
    ],

    suffixes: [
        "des Schreckens", "aus dem Steinbruch", "der Finsternis", 
        "der Legenden", "des Abgrunds", "des Nest-Verräters", 
        "der Wildnis", "des alten Waldes"
    ],

    // --- LOGIK-FUNKTIONEN ---

    /**
     * Erstellt ein zufälliges Monster aus dem Wildnis-Pool.
     * @param {number} playerLevel - Das aktuelle Level des Spielers für das Scaling.
     */
    generateWildnisMonster(playerLevel) {
        const prefix = this.prefixes[Math.floor(Math.random() * this.prefixes.length)];
        const kern = this.wildnisKerne[Math.floor(Math.random() * this.wildnisKerne.length)];
        const suffix = this.suffixes[Math.floor(Math.random() * this.suffixes.length)];

        const name = `${prefix.name} ${kern} ${suffix}`;
        return this.createMonsterObject(name, playerLevel, prefix, false);
    },

    /**
     * Erstellt einen festen Boss aus dem Arena-Pool.
     * @param {number} playerLevel - Level des Spielers.
     */
    generateArenaBoss(playerLevel) {
        const kern = this.arenaBosse[Math.floor(Math.random() * this.arenaBosse.length)];
        // Bosse können optional auch Präfixe erhalten, hier nutzen wir ein neutrales "Ewiger"
        const bossPrefix = { name: "Ewiger", hpMod: 1.0, atkMod: 1.0, lxpMod: 1.0 };
        
        const name = `BOSS: ${kern}`;
        return this.createMonsterObject(name, playerLevel, bossPrefix, true);
    },

    /**
     * Kern-Algorithmus zur Berechnung der Stats.
     */
    createMonsterObject(name, level, prefix, isBoss) {
        // 1. Basis-Werte (Tier 1)
        let hp = 75;  // Mittelwert von 50-100
        let atk = 8;   // Mittelwert von 5-10
        let lxp = 75;  // Mittelwert von 50-100

        // 2. Level-Scaling (10% Steigerung pro Level über 1)
        const scaleFactor = 1 + (level - 1) * 0.1;
        hp *= scaleFactor;
        atk *= scaleFactor;
        lxp *= scaleFactor;

        // 3. Präfix-Bonus anwenden
        hp *= prefix.hpMod;
        atk *= prefix.atkMod;
        lxp *= prefix.lxpMod;

        // 4. Boss-Multiplikator
        if (isBoss) {
            hp *= 5;
            atk *= 1.5; // Zusätzlicher Boost für Bosse
            lxp *= 3;
        }

        // 5. Objekt abrunden und zurückgeben
        return {
            name: name,
            level: level,
            hp: Math.round(hp),
            atk: Math.round(atk),
            def: Math.round(atk * 0.8), // DEF ist standardmäßig 80% der ATK
            lxpReward: Math.round(lxp)
        };
    }
};

// Export für die Verwendung in battle.js
// module.exports = MonsterLibrary; // Falls in Node.js genutzt
