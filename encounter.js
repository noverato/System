/**
 * 🌲 encounter.js
 * Zentrale Begegnungs-Engine für THE NEST
 */

const Encounter = (() => {
    'use strict';

    /* ==============================
       ⚙️ KONFIGURATION
    ============================== */
    const MIN_STEPS = 12;
    const BASE_CHANCE = 0.05;        // 5 %
    const CHANCE_GROWTH = 0.025;     // +2.5 % pro Klick
    const COOLDOWN_MS = 30 * 1000;

    /* ==============================
       📊 ZUSTAND
    ============================== */
    let stepCount = 0;
    let cooldownUntil = 0;
    let inEncounter = false;

    /* ==============================
       🕒 HILFSFUNKTIONEN
    ============================== */
    const now = () => Date.now();
    const isOnCooldown = () => now() < cooldownUntil;
    const resetSteps = () => stepCount = 0;
    const startCooldown = () => cooldownUntil = now() + COOLDOWN_MS;

    function getEncounterChance() {
        if (stepCount < MIN_STEPS) return 0;
        return BASE_CHANCE + (stepCount - MIN_STEPS) * CHANCE_GROWTH;
    }

    /* ==============================
       🐲 MONSTER-ERZEUGUNG
    ============================== */
    function generateMonster() {
        const playerLevel = window.data?.stats?.currentLevel || 1;
        return MonsterLibrary.generateWildnisMonster(playerLevel + 2);
    }

    /* ==============================
       ⚔️ ENCOUNTER-START
       (ERZEUGT NUR – SENDET NICHT)
    ============================== */
    function startEncounter() {
        if (inEncounter) return null;

        inEncounter = true;
        resetSteps();

        const monster = generateMonster();

        console.log(
            `[Encounter] Monster erschienen: ${monster.name} (Lvl ${monster.lvl})`
        );

        return monster;
    }

    /* ==============================
       🎁 ENDE / BELOHNUNG
    ============================== */
    function handleVictory(monster) {
        try {
            const baseItem = LootManager?.getDrop
                ? LootManager.getDrop(monster)
                : null;

            if (!baseItem) return;

            const flavoredItem = Beute.applyBeuteFlavor(baseItem, monster);

            if (!window.data.inventar) window.data.inventar = {};
            window.data.inventar[flavoredItem.id] =
                (window.data.inventar[flavoredItem.id] || 0) + 1;

            console.log(
                `[Encounter] Beute erhalten: ${flavoredItem.display_name}`
            );
        } finally {
            endEncounter();
        }
    }

    function handleEscape() {
        console.log("[Encounter] Kampf beendet (Flucht).");
        endEncounter();
    }

    function endEncounter() {
        inEncounter = false;
        startCooldown();
    }

    /* ==============================
       👣 SCHRITT-TRIGGER
    ============================== */
    function registerStep() {
        stepCount++;
        
if (inEncounter) {
    // Wir prüfen aktiv, ob das Arena-Fenster noch offen ist
    const arenaVisible = document.querySelector('#arena-container')?.style.display !== 'none';
    
    if (!arenaVisible) {
        console.log("WILDNIS-LOG: Arena nicht aktiv. Setze Status zurück...");
        inEncounter = false;
        // Jetzt darf der Klick weitergehen
    } else {
        console.log("System blockiert: Kampf läuft noch laut Logik.");
        return;
    }
}
        if (isOnCooldown()) {
        console.log("System blockiert: Cooldown aktiv.");
        return;
    }
        
        if (isOnCooldown() || inEncounter) return;

        const chance = getEncounterChance();
        if (chance <= 0) return;

        if (Math.random() < chance) {
            const monster = startEncounter();
            if (monster && window.EventHub) {
                EventHub.emit(EventHub.EVENTS.ENCOUNTER_START, monster);
            }
        }
    }

    /* ==============================
       📡 EVENT-ANBINDUNG
    ============================== */
     if (window.EventHub) {
         // Universal-Reset: Sobald die Arena schließt, wird der Wald frei!
    if (window.Arena) {
        EventHub.on("arena:close", () => {
        console.log("Wald-Reset: Arena geschlossen.");
        inEncounter = false;
        startCooldown();
    });
}
        //EventHub.on("battle:victory", handleVictory);
        //EventHub.on("battle:escape", handleEscape);

        EventHub.on(
            EventHub.EVENTS.ENCOUNTER_STEP,
            () => registerStep()
        );
    }

    /* ==============================
       🔁 API
    ============================== */
    return {
        registerStep,
        _debug: () => ({
            stepCount,
            cooldownUntil,
            chance: getEncounterChance(),
            inEncounter
        })
    };
})();

window.Encounter = Encounter;


/* =========================================================
   🔒 INTERCEPTOR FÜR FROZEN HTML
   (NICHT Teil des Encounter-Moduls)
========================================================= */

document.addEventListener('click', function(event) {
    const worldMap = document.getElementById('world');
    if (!worldMap) return;

    const rect = worldMap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {

        const isSafeZone = (x > 400 && x < 1500 && y > 150 && y < 700);

        if (!isSafeZone) {
            console.log("Wildnis betreten! Suche nach Monstern...");
            if (typeof Encounter !== 'undefined' && Encounter.registerStep) {
                Encounter.registerStep();
            }
        } else {
            console.log("Sicheres Nest. Keine Monster hier.");
        }
    }
});


/* =========================================================
   🔧 FIX FÜR EVENT-HUB (GLOBALER FALLBACK)
========================================================= */

function startEncounter() {
    console.log("Kampf wird vorbereitet...");
    const playerLevel = window.gameState?.playerLevel || 1;

    const monster = window.MonsterLibrary.generateWildnisMonster(playerLevel + 2);

    if (monster) {
        console.log("Monster gefunden: " + monster.name);
        EventHub.emit(EventHub.EVENTS.ENCOUNTER_START, monster);
        return monster;
    }
    return null;
}
