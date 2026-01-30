/**
 * arena.js – Kampf-Initialisierung
 */

(function () {
    'use strict';

    function startMonsterFight() {
        if (!window.isIdentified) {
            console.warn("Arena blockiert: Spieler nicht identifiziert");
            return;
        }

        if (!window.MonsterLibrary || !window.EventHub) {
            console.error("Arena Fehler: Abhängigkeiten fehlen");
            return;
        }

        const lvl = window.data?.stats?.currentLevel || 1;
        const monster = MonsterLibrary.generateArenaBoss(lvl);

        console.log("⚔️ Arena startet Kampf gegen:", monster.name);
        EventHub.emitEncounter(monster);
    }

    window.Arena = {
        startMonsterFight
    };

})();
