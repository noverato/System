/**
 * 🏟️ arena.js - The Nest: Overlord Edition 2026
 * * ZWECK: Entscheidet WELCHER Kampf stattfindet und initialisiert diesen.
 * ARCHITEKTUR: Lose Kopplung via EventHub. Keine UI, kein Firebase, keine Logik.
 */

const Arena = (function() {
    'use strict';

    /**
     * Startet einen Kampf in der Arena.
     * Prüft Voraussetzungen und sendet das Monster an den EventHub.
     */
    function startMonsterFight() {
        console.log("🏟️ Arena-Meister: Initialisiere Kampf-Check...");

        // 1. Identifikations-Check (Sicherheitsbarriere)
        if (!window.isIdentified) {
            console.error("❌ Arena-Abbruch: Spieler ist nicht identifiziert.");
            return;
        }

        // 2. Monster-Generierung
        let monster;
        
        try {
            // Versuche Boss aus der Library zu laden
            if (typeof MonsterLibrary !== 'undefined' && MonsterLibrary.generateArenaBoss) {
                monster = MonsterLibrary.generateArenaBoss();
            } else {
                // Fallback, falls Library nicht geladen oder Funktion fehlt
                monster = _generateFallbackMonster();
            }
        } catch (error) {
            console.warn("⚠️ Arena: Fehler bei Monster-Generierung, nutze Fallback.", error);
            monster = _generateFallbackMonster();
        }

        // 3. Event via EventHub feuern
        // Die battle.js hört auf ENCOUNTER_START und übernimmt die Ausführung
        if (typeof EventHub !== 'undefined' && EventHub.emitEncounter) {
            console.log(`⚔️ Arena: Sende Encounter für "${monster.name}" an EventHub.`);
            EventHub.emitEncounter(monster);
        } else {
            console.error("❌ Arena-Fehler: EventHub.emitEncounter nicht gefunden!");
        }
    }

    /**
     * Erzeugt ein standardisiertes Monster-Objekt als Fallback.
     * Entspricht dem Pflicht-Format für das Projekt.
     * @private
     */
    function _generateFallbackMonster() {
        const currentLvl = window.data?.stats?.currentLevel || 1;
        
        return {
            name: "Arena Schatten",
            hp: 120,
            maxHp: 120,
            atk: 12,
            def: 6,
            spd: 10,
            lvl: currentLvl,
            img: "👹",
            lxpReward: 50
        };
    }

    // Öffentliche API
    return {
        startMonsterFight: startMonsterFight
    };

})();

// Globaler Zugriff für UI-Trigger (ohne Inline-Events in HTML)
window.Arena = Arena;
