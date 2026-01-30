/**
 * monsterLibrary.js
 * Zentrale Monster-Generierung für THE NEST
 * bewusst simpel, robust & browser-sicher
 */

(function () {
    'use strict';

    const prefixes = [
        { name: "Riesiger", hp: 1.5, atk: 1.0, lxp: 1.0 },
        { name: "Flinker", hp: 0.8, atk: 1.3, lxp: 1.0 },
        { name: "Gepanzerter", hp: 1.2, atk: 0.9, lxp: 1.0 },
        { name: "Schattenhafter", hp: 0.9, atk: 1.4, lxp: 1.2 },
        { name: "Uralter", hp: 2.0, atk: 1.1, lxp: 1.5 }
    ];

    const wildMonsters = [
        { name: "Slime", icon: "💧" },
        { name: "Goblin", icon: "👺" },
        { name: "Skelett", icon: "💀" },
        { name: "Waldspinne", icon: "🕷️" },
        { name: "Wildschwein", icon: "🐗" }
    ];

    const arenaBosses = [
        { name: "Arena-Meister", icon: "👑" },
        { name: "Knochen-Gigant", icon: "🦴" },
        { name: "Minotaurus", icon: "🐂" },
        { name: "Schatten-Lord", icon: "🌑" }
    ];

    function rand(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function scale(level) {
        return 1 + (level - 1) * 0.15;
    }

    function createMonster(baseName, icon, level, mods, boss) {
        const s = scale(level);

        let hp = 80 * s * mods.hp;
        let atk = 10 * s * mods.atk;
        let def = atk * 0.7;
        let lxp = 50 * s * mods.lxp;

        if (boss) {
            hp *= 4;
            atk *= 1.5;
            lxp *= 3;
        }

        return {
            name: baseName,
            lvl: level,
            hp: Math.round(hp),
            maxHp: Math.round(hp),
            atk: Math.round(atk),
            def: Math.round(def),
            spd: 10,
            img: icon,
            lxpReward: Math.round(lxp)
        };
    }

    window.MonsterLibrary = {
        generateWildMonster(level) {
            const p = rand(prefixes);
            const m = rand(wildMonsters);
            return createMonster(
                `${p.name} ${m.name}`,
                m.icon,
                level,
                p,
                false
            );
        },

        generateArenaBoss(level) {
            const b = rand(arenaBosses);
            const p = { hp: 1, atk: 1, lxp: 1 };
            return createMonster(
                `BOSS: ${b.name}`,
                b.icon,
                level,
                p,
                true
            );
        }
    };

    console.log("🐉 MonsterLibrary geladen");

})();
