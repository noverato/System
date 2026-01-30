/**
 * THE NEST – STREAM GATEKEEPER
 * Entscheidet, ob das Spiel aktiv sein darf.
 */

(function () {
    'use strict';

    // 🔑 Zentrale Wahrheit
    window.IS_STREAM_LIVE = false;

    /**
     * Wird von Streamer.Bot / OBS gesetzt
     * @param {boolean} state
     */
    window.setStreamLiveState = function (state) {
        window.IS_STREAM_LIVE = !!state;
        console.log("🔒 Stream-Gate:", state ? "LIVE" : "OFFLINE");

        if (!state) {
            showOfflineOverlay();
        } else {
            hideOfflineOverlay();
        }
    };

    function showOfflineOverlay() {
        if (document.getElementById('offlineOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'offlineOverlay';
        overlay.innerHTML = `
            <div style="
                position:fixed;
                inset:0;
                background:rgba(0,0,0,0.85);
                z-index:99999;
                display:flex;
                align-items:center;
                justify-content:center;
                text-align:center;
                color:#f5f5f5;
                font-family:serif;
                padding:20px;
            ">
                <div>
                    <h1 style="color:gold;">🌙 Das Nest schläft</h1>
                    <p style="max-width:420px;">
                        Der Stream ist aktuell offline.<br>
                        Aktionen sind nur möglich, wenn Spawn2909 live ist.
                    </p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function hideOfflineOverlay() {
        const overlay = document.getElementById('offlineOverlay');
        if (overlay) overlay.remove();
    }
// 🔒 Sicherheit: Standardmäßig IMMER offline starten
window.addEventListener('load', () => {
    window.setStreamLiveState(false);
});

