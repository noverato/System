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
    } else {
        // 🌲 Wald-Erkundung
        EventHub.on('encounter:start', (data) => {
            const monsterName = data?.monster?.name || 'etwas Unbekanntes';
            pushMessage(`✨ <i>Ein wildes <b>${monsterName}</b> erscheint im Unterholz!</i>`);
        });

        // 🏆 Sieg / Ende (Wir nutzen arena:close als Joker!)
        EventHub.on('arena:close', () => {
            pushMessage(`🏠 <b>${playerName()}</b> kehrt von der Expedition ins Nest zurück.`);
        });

        // Behalte die anderen für den Fall, dass sie doch feuern:
        EventHub.on('battle:victory', (data) => {
            const name = data?.monster?.name || 'Gegner';
            pushMessage(`🏆 <b>${playerName()}</b> hat <b>${name}</b> glorreich besiegt!`);
        });
    } // <--- Hier wurde die schließende Klammer für das 'else' ergänzt

    /* ==============================
        🔁 API
    ============================== */
    return {
        push: pushMessage
    };

})();

// 🌍 Global verfügbar
window.Ticker = Ticker;
