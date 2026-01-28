/**
 * monsterLibrary.js
 * Diese Bibliothek verwaltet die Generierung von Monstern für das Twitch-RPG "Nest Overlord Edition".
 * Inklusive Emoji-System für visuelle Darstellung (img-Feld).
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

    // Wildnis-Kerne als Objekte mit Emojis
    wildnisKerne: [
        { name: "Slime", emoji: "💧" }, { name: "Goblin", emoji: "👺" }, 
        { name: "Skelett", emoji: "💀" }, { name: "Waldspinne", emoji: "🕷️" }, 
        { name: "Hornisse", emoji: "🐝" }, { name: "Schattenwolf", emoji: "🐺" }, 
        { name: "Moos-Golem", emoji: "🗿" }, { name: "Grab-Untoter", emoji: "🧟" }, 
        { name: "Sumpf-Echse", emoji: "🦎" }, { name: "Wildschwein", emoji: "🐗" }, 
        { name: "Riesenkäfer", emoji: "🪲" }, { name: "Waldgeist", emoji: "👻" }, 
        { name: "Harpyie", emoji: "🦅" }, { name: "Kobold", emoji: "🧌" }, 
        { name: "Irrlicht", emoji: "✨" }, { name: "Dunkel-Elf", emoji: "🧝" }, 
        { name: "Bandit", emoji: "🗡️" }, { name: "Pilz-Kreatur", emoji: "🍄" }, 
        { name: "Ranken-Monster", emoji: "🌿" }, { name: "Fledermaus", emoji: "🦇" }, 
        { name: "Skorpion", emoji: "🦂" }, { name: "Erdegeler", emoji: "🐛" }, 
        { name: "Steinbeißer", emoji: "🪨" }, { name: "Nebel-Panzer", emoji: "🌫️" }, 
        { name: "Blut-Adler", emoji: "🩸" }, { name: "Reißzahn-Luchs", emoji: "🐆" }, 
        { name: "Krallenfrosch", emoji: "🐸" }, { name: "Weiden-Wächter", emoji: "🌳" }, 
        { name: "Ruinen-Wächter", emoji: "🏰" }, { name: "Mimic", emoji: "📦" }
    ],

    // Arena-Bosse als Objekte mit Emojis
    arenaBosse: [
        { name: "Der Arena-Meister", emoji: "👑" }, { name: "Knochen-Gigant", emoji: "🦴" }, 
        { name: "Mantikor", emoji: "🦁" }, { name: "Minotaurus-Wächter", emoji: "🐂" }, 
        { name: "Hydra-Setzling", emoji: "🐍" }, { name: "Vampir-Lord", emoji: "🧛" }, 
        { name: "Dämonen-Ritter", emoji: "😈" }, { name: "Medusa", emoji: "🐍" }, 
        { name: "Zerberus", emoji: "🐕‍🦺" }, { name: "Der Schatten-Monarch", emoji: "🌑" }
    ],

    suffixes: [
        "des Schreckens", "aus dem Steinbruch", "der Finsternis", 
        "der Legenden", "des Abgrunds", "des Nest-Verräters", 
        "der Wildnis", "des alten Waldes"
    ],

    // --- LOGIK-FUNKTIONEN ---

    generateWildnisMonster(playerLevel) {
        const prefix = this.prefixes[Math.floor(Math.random() * this.prefixes.length)];
        const kernObj = this.wildnisKerne[Math.floor(Math.random() * this.wildnisKerne.length)];
        const suffix = this.suffixes[Math.floor(Math.random() * this.suffixes.length)];

        const name = `${prefix.name} ${kernObj.name} ${suffix}`;
        return this.createMonsterObject(name, playerLevel, prefix, false, kernObj.emoji);
    },

    generateArenaBoss(playerLevel) {
        const kernObj = this.arenaBosse[Math.floor(Math.random() * this.arenaBosse.length)];
        const bossPrefix = { name: "Ewiger", hpMod: 1.0, atkMod: 1.0, lxpMod: 1.0 };
        
        const name = `BOSS: ${kernObj.name}`;
        return this.createMonsterObject(name, playerLevel, bossPrefix, true, kernObj.emoji);
    },

    createMonsterObject(name, level, prefix, isBoss, emoji) {
        let hp = 75;
        let atk = 8;
        let lxp = 75;

        const scaleFactor = 1 + (level - 1) * 0.1;
        hp *= scaleFactor;
        atk *= scaleFactor;
        lxp *= scaleFactor;

        hp *= prefix.hpMod;
        atk *= prefix.atkMod;
        lxp *= prefix.lxpMod;

        if (isBoss) {
            hp *= 5;
            atk *= 1.5;
            lxp *= 3;
        }

        return {
            name: name,
            level: level,
            hp: Math.round(hp),
            maxHp: Math.round(hp), // Nützlich für Battle-Logik
            atk: Math.round(atk),
            def: Math.round(atk * 0.8),
            lxpReward: Math.round(lxp),
            img: emoji // Hier wird das Emoji gespeichert
        };
    }
};

// module.exports = MonsterLibrary;
