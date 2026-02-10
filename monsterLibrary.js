/**
 * 🐲 monsterLibrary.js
 * Zentrale Monster-Datenbank für THE NEST
 * Verantwortlich NUR für Monster-Erzeugung
 * Keine Battle-Logik, keine UI
 */

// 🔹 Prefixe (Modifikatoren)
const MONSTER_PREFIXES = [
    { name: "Riesiges", hpMod: 1.5, atkMod: 1.0, lxpMod: 1.0 },
    { name: "Brennendes", hpMod: 1.0, atkMod: 1.2, lxpMod: 1.0 },
    { name: "Gepanzertes", hpMod: 1.2, atkMod: 1.0, lxpMod: 1.0 },
    { name: "Flinkes", hpMod: 0.8, atkMod: 1.3, lxpMod: 1.0 },
    { name: "Uraltes", hpMod: 2.0, atkMod: 1.1, lxpMod: 1.5 },
    { name: "Schattenhaftes", hpMod: 0.9, atkMod: 1.4, lxpMod: 1.2 }
];

// 🔹 Wildnis-Monster
const WILDNIS_MONSTER = [
    { name: "Slime", emoji: "💧", img: "Schleim.png" },
    { name: "Goblin", emoji: "👺", img: "Goblin.png" },
    { name: "Skelett", emoji: "💀", img: "Skelett.png" },
    { name: "Waldspinne", emoji: "🕷️", img: "Goblin.png" }, // Fallback
    { name: "Moos-Golem", emoji: "🗿", img: "Oger.png" },
    { name: "Schattenwolf", emoji: "🐺", img: "Goblin.png" }, // Fallback
    { name: "Bandit", emoji: "🗡️", img: "Skelett.png" }, // Fallback
    { name: "Waldgeist", emoji: "👻", img: "Lich.png" },
    { name: "Oger", emoji: "👹", img: "Oger.png" }
];

// 🔹 Arena-Bosse
const ARENA_BOSSE = [
    { name: "Der Arena-Meister", emoji: "👑", img: "Overlord.png" },
    { name: "Knochen-Gigant", emoji: "🦴", img: "Skelett.png" },
    { name: "Minotaurus", emoji: "🐂", img: "Oger.png" },
    { name: "Vampir-Lord", emoji: "🧛", img: "Lich.png" },
    { name: "Der Schatten-Monarch", emoji: "🌑", img: "Lich.png" }
];

// 🔹 Suffixe
const MONSTER_SUFFIXES = [
    "des Schreckens",
    "der Finsternis",
    "der Wildnis",
    "des alten Waldes",
    "aus dem Nest"
];

// 🔹 Hilfsfunktionen
function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// 🔹 Monster-Erstellung
function createMonster(name, level, emoji, isBoss, prefix, core) {
    let baseHp = 80 + level * 20;
    let baseAtk = 8 + level * 4;
    let baseLxp = 50 + level * 15;

    if (prefix) {
        baseHp *= prefix.hpMod;
        baseAtk *= prefix.atkMod;
        baseLxp *= prefix.lxpMod;
    }

    if (isBoss) {
        baseHp *= 4;
        baseAtk *= 1.5;
        baseLxp *= 3;
    }

    return {
        name,
        lvl: level,
        hp: Math.round(baseHp),
        maxHp: Math.round(baseHp),
        atk: Math.round(baseAtk),
        def: Math.round(baseAtk * 0.8),
        spd: 10,
        lxpReward: Math.round(baseLxp),
        img: core.img || emoji // Nutze Bild wenn vorhanden, sonst Emoji
    };
}

// 🔹 Öffentliche API
const MonsterLibrary = {

    generateWildnisMonster(level = 1) {
        const prefix = random(MONSTER_PREFIXES);
        const core = random(WILDNIS_MONSTER);
        const suffix = random(MONSTER_SUFFIXES);

        const name = `${prefix.name} ${core.name} ${suffix}`;
        return createMonster(name, level, core.emoji, false, prefix, core);
    },

    generateArenaBoss(level = 1) {
        const boss = random(ARENA_BOSSE);
        const prefix = { name: "Ewiger", hpMod: 1, atkMod: 1, lxpMod: 1 };

        const name = `BOSS: ${boss.name}`;
        return createMonster(name, level, boss.emoji, true, prefix, boss);
    }
};

// 🔥 GLOBALER EXPORT
window.MonsterLibrary = MonsterLibrary;
window.MONSTER_PREFIXES = MONSTER_PREFIXES;
window.MONSTER_SUFFIXES = MONSTER_SUFFIXES;