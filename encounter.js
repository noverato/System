/**
 * 🌲 encounter.js
 * Zentrale Begegnungs-Engine für THE NEST
 *
 * Aufgabe:
 * - Klicks zählen (Schritt-System)
 * - Progressive Encounter-Chance (Pity-System)
 * - Monster-Erzeugung (MonsterLibrary)
 * - Kampfstart (battle.js / ATB)
 * - Loot- & Beute-Verknüpfung (loot.js + beute.js)
 * - Cooldown-Management
 *
 * KEINE UI
 * KEINE Battle-Logik
 * KEINE Loot-Tabellen
 */

const Encounter = (() => {
    'use strict';

    /* ==============================
       ⚙️ KONFIGURATION
    ============================== */
    const MIN_STEPS = 12;
    const BASE_CHANCE = 0.03; // 0.8 %
    const CHANCE_GROWTH = 0.015; // +0.25 % pro Klick
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

    function now() {
        return Date.now();
    }

    function isOnCooldown() {
        return now() < cooldownUntil;
    }

    function resetSteps() {
        stepCount = 0;
    }

    function startCooldown() {
        cooldownUntil = now() + COOLDOWN_MS;
    }

    function getEncounterChance() {
        if (stepCount < MIN_STEPS) return 0;
        const extraSteps = stepCount - MIN_STEPS;
        return BASE_CHANCE + extraSteps * CHANCE_GROWTH;
    }

    /* ==============================
       🐲 MONSTER-AUSWAHL
    ============================== */

    function generateMonster() {
        const playerLevel = window.data?.stats?.currentLevel || 1;
        const monsterLevel = playerLevel + 2;

        return MonsterLibrary.generateWildnisMonster(monsterLevel);
    }

    /* ==============================
       ⚔️ KAMPFSTART
    ============================== */

    function startEncounter() {
        if (inEncounter) return;

        inEncounter = true;
        resetSteps();

        const monster = generateMonster();

        console.log(
            `[Encounter] Monster erschienen: ${monster.name} (Lvl ${monster.lvl})`
        );

        // Übergabe an Battle-System
        EventHub.emitEncounter(monster);
    }

    /* ==============================
       🎁 LOOT-NACHBEARBEITUNG
    ============================== */

    function handleVictory(monster) {
        try {
            // 1️⃣ Loot aus loot.js
            const baseItem = LootManager?.getDrop
                ? LootManager.getDrop(monster)
                : null;

            if (!baseItem) return;

            // 2️⃣ Beute-Namens-Sync
            const flavoredItem = Beute.applyBeuteFlavor(baseItem, monster);

            // 3️⃣ Ins Inventar
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
       👣 ÖFFENTLICHER SCHRITT-TRIGGER
    ============================== */

    function registerStep() {
        stepCount++;

        if (isOnCooldown() || inEncounter) return;

        const chance = getEncounterChance();
        if (chance <= 0) return;

        if (Math.random() < chance) {
            startEncounter();
            EventHub.emit(EventHub.EVENTS.ENCOUNTER_START, monster);
        }
    }

    /* ==============================
       📡 EVENT-ANBINDUNG
    ============================== */

    // Battle-System meldet Sieg / Flucht
    if (window.EventHub) {
        EventHub.on("battle:victory", handleVictory);
        EventHub.on("battle:escape", handleEscape);
        if (window.EventHub) {
    // Registriere die Datei beim Hub für Schritte
    EventHub.on(EventHub.EVENTS.ENCOUNTER_STEP, () => registerStep());
    
}
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

// 🌍 Global verfügbar
window.Encounter = Encounter;
