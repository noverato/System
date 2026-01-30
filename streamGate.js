/**
 * THE NEST – STREAMGATE
 * Sperrt das Spiel, wenn Streamer.bot offline ist
 * Admin (Hüter) darf IMMER rein
 */

window.NEST_OFFLINE = true;

const StreamGate = {
    socket: null,
    connected: false,

    init() {
        this.connect();
    },

    connect() {
        try {
            this.socket = new WebSocket("ws://127.0.0.1:8080");

            this.socket.onopen = () => {
                console.log("🟢 Streamer.bot verbunden");
                this.connected = true;
                this.unlockNest();
            };

            this.socket.onclose = () => {
                console.log("🔴 Streamer.bot offline");
                this.connected = false;
                this.lockNest();
            };

            this.socket.onerror = () => {
                console.log("⚠️ WebSocket Fehler");
                this.connected = false;
                this.lockNest();
            };
        } catch (e) {
            console.log("❌ Keine Verbindung möglich");
            this.lockNest();
        }
    },

    isAdmin() {
        return (
            window.NEST_USER &&
            window.NEST_USER.loggedIn &&
            window.NEST_USER.role === "admin"
        );
    },

    lockNest() {
        // 🛡️ ADMIN-BYPASS
        if (this.isAdmin()) {
            console.log("🛡️ Hüter anwesend – Nest bleibt offen");
            window.NEST_OFFLINE = false;
            this.removeOverlay();
            return;
        }

        window.NEST_OFFLINE = true;

        if (!document.getElementById("nestOfflineOverlay")) {
            const overlay = document.createElement("div");
            overlay.id = "nestOfflineOverlay";
            overlay.innerHTML = `
                <div style="
                    position:fixed;
                    inset:0;
                    background:rgba(0,0,0,0.88);
                    z-index:99999;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:#c8b36a;
                    font-family:serif;
                    text-align:center;
                ">
                    <div>
                        <h1 style="margin-bottom:10px;">🌙 Das Nest schläft</h1>
                        <p>Der Hüter ist nicht anwesend.</p>
                        <p style="opacity:0.6;">Komm wieder, wenn der Stream erwacht.</p>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
    },

    unlockNest() {
        window.NEST_OFFLINE = false;
        this.removeOverlay();
    },

    removeOverlay() {
        const overlay = document.getElementById("nestOfflineOverlay");
        if (overlay) overlay.remove();
    }
};

// Automatisch starten
document.addEventListener("DOMContentLoaded", () => {
    StreamGate.init();
});
