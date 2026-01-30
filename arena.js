/**
 * 🏟️ arena.js – THE NEST
 * Aufgabe:
 * - entscheidet welchen Kampf es gibt
 * - erzeugt Monster
 * - feuert Event an BattleEngine
 * KEINE UI, KEINE Battle-Logik
 */

(function () {
    'use strict';

    function startMonsterFight() {
        console.log("🏟️ Arena: Kampfstart angefordert");

        // 🔐 Sicherheitscheck
        if (!window.isIdentified) {
            console.warn("❌ Arena: Spieler nicht identifiziert");
            return;
        }

        if (typeof MonsterLibrary === 'undefined') {
            console.error("❌ Arena: MonsterLibrary nicht geladen");
            return;
        }

        if (typeof EventHub === 'undefined') {
            console.error("❌ Arena: EventHub nicht geladen");
            return;
        }

        // 📊 Spieler-Level bestimmen
        const level = window.data?.stats?.currentLevel || 1;

        // 🐲 Monster erzeugen
        let monster;
        try {
            monster = MonsterLibrary.generateArenaBoss(level);
        } catch (err) {
            console.error("❌ Arena: Fehler bei Monster-Erzeugung", err);
            monster = generateFallbackMonster(level);
        }

        console.log("⚔️ Arena: Monster erzeugt →", monster.name);

        // 🚨 Battle starten
        EventHub.emitEncounter(monster);
    }

    // 🧯 Notfall-Monster
    function generateFallbackMonster(level) {
        return {
            name: "Arena-Schatten",
            lvl: level,
            hp: 120,
            maxHp: 120,
            atk: 12,
            def: 6,
            spd: 10,
            img: "👹",
            lxpReward: 50
        };
    }

    // 🌍 Öffentliche API
    window.Arena = {
        startMonsterFight
    };

})();
