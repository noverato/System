/**
 * 📰 ticker.js
 * Story-Ticker für THE NEST
 * * Rolle:
 * - Lauscht auf EventHub
 * - Schreibt Story-Meldungen ins Inventar-Infofeld
 */

const Ticker = (() => {
    'use strict';

    const MAX_ENTRIES = 15;

    /* ==============================
       🧩 HILFSFUNKTIONEN
    ============================== */

    function getContainer() {
        return document.getElementById('sideContent');
    }

    function createEntry(html) {
        const div = document.createElement('div');
        div.className = 'ticker-entry';
        div.style.marginBottom = '8px';
        div.style.fontSize = '14px';
        div.style.lineHeight = '1.4';
        div.style.borderLeft = '3px solid #ffd700'; // Isekai-Gold-Akzent
        div.style.paddingLeft = '8px';
        div.innerHTML = html;
        return div;
    }

    function pushMessage(html) {
        const container = getContainer();
        if (!container) return;

        const entry = createEntry(html);
        container.prepend(entry);

        // Limitierung auf 15 Einträge
        while (container.children.length > MAX_ENTRIES) {
            container.removeChild(container.lastChild);
        }
    }

    function playerName() {
        return window.data?.name || 'Spawn2909';
    }

    /* ==============================
       📡 EVENT-LISTENER
    ============================== */

    if (!window.EventHub) {
        console.warn("📰 Ticker: EventHub nicht gefunden.");
        return {};
    }

    // 🌲 NEU: Wald-Erkundung (Wenn ein Monster erscheint)
    EventHub.on('encounter:start', (data) => {
        const monsterName = data?.monster?.name || 'etwas Unbekanntes';
        pushMessage(`✨ <i>Ein wildes <b>${monsterName}</b> erscheint im Unterholz des Nests!</i>`);
    });

    // 🗡️ Kampf – Sieg
    EventHub.on('battle:victory', ({ monster }) => {
        if (!monster?.name) return;
        pushMessage(`🏆 <b>${playerName()}</b> hat <b>${monster.name}</b> glorreich besiegt!`);
    });

    // 🏃 Kampf – Flucht / Niederlage
    EventHub.on('battle:escape', ({ monster }) => {
        if (!monster?.name) return;
        pushMessage(`💨 <b>${playerName()}</b> konnte <b>${monster.name}</b> knapp entkommen.`);
    });

    // 🚪 NEU: Universal-Reset (Wenn die Arena schließt)
    EventHub.on('arena:close', () => {
        pushMessage(`🏠 <b>${playerName()}</b> kehrt von der Expedition zurück ins Nest.`);
    });

    // 🧬 Evolution
    EventHub.on('evolution:stage', ({ from, to }) => {
        if (!from || !to) return;
        pushMessage(`🌟 <b>${playerName()}</b> entwickelt sich weiter: <b>${from}</b> → <b>${to}</b>!`);
    });

    // 👑 Boss-Herausforderung
    EventHub.on('arena:start', ({ boss }) => {
        if (!boss?.name) return;
        pushMessage(`🔥 <b>${playerName()}</b> stellt sich der Prüfung gegen <b>${boss.name}</b>!`);
    });

    // ⚔️ PvP-Herausforderung
    EventHub.on('pvp:challenge', ({ from, to }) => {
        if (!from || !to) return;
        pushMessage(`⚔️ <b>${from}</b> fordert <b>${to}</b> zu einem ehrenhaften Duell heraus!`);
    });

    /* ==============================
       🔁 API
    ============================== */
    return {
        push: pushMessage
    };

})();

// 🌍 Global verfügbar
window.Ticker = Ticker;
