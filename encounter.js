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
    const BASE_CHANCE = 0.03;        // 3 %
    const CHANCE_GROWTH = 0.015;     // +1.5 % pro Klick
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

        return monster; // ✅ WICHTIG
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

        if (isOnCooldown() || inEncounter) return;

        const chance = getEncounterChance();
        if (chance <= 0) return;

        if (Math.random() < chance) {
            const monster = startEncounter();
            if (monster && window.EventHub) {
                EventHub.emit(EventHub.EVENTS.ENCOUNTER_START,  monster );
            }
        }
    }

    /* ==============================
       📡 EVENT-ANBINDUNG
    ============================== */
    if (window.EventHub) {
        EventHub.on("battle:victory", handleVictory);
        EventHub.on("battle:escape", handleEscape);

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
