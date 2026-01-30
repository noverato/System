/**
 * THE NEST – STREAM GATE
 * Autorität: Streamer.bot WebSocket
 * Zustand: ONLINE nur wenn WebSocket verbunden
 */

const StreamGate = {
    socket: null,
    online: false,
    wsUrl: "ws://127.0.0.1:8080", // ⚠️ ggf. Port anpassen

    init() {
        this.connect();
    },

    connect() {
        try {
            console.log("🔌 StreamGate: versuche Verbindung zu Streamer.bot …");

            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                console.log("🟢 StreamGate: Streamer.bot verbunden");
                this.setOnline(true);
            };

            this.socket.onclose = () => {
                console.warn("🔴 StreamGate: Verbindung getrennt");
                this.setOnline(false);
                this.retry();
            };

            this.socket.onerror = () => {
                console.error("❌ StreamGate: WebSocket Fehler");
                this.setOnline(false);
                this.retry();
            };

            this.socket.onmessage = (event) => {
                // Optional für spätere Erweiterungen
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "STREAM_STATE") {
                        this.setOnline(msg.live === true);
                    }
                } catch (e) {
                    // stille Ignorierung
                }
            };

        } catch (err) {
            console.error("❌ StreamGate: Verbindung fehlgeschlagen", err);
            this.setOnline(false);
            this.retry();
        }
    },

    retry() {
        setTimeout(() => {
            this.connect();
        }, 5000); // alle 5 Sekunden neu versuchen
    },

    setOnline(state) {
        this.online = state;

        if (state) {
            this.unlockNest();
        } else {
            this.lockNest();
        }
    },

    lockNest() {
        console.log("🌙 THE NEST SCHLÄFT");

        document.body.classList.add("nest-offline");

        // harte Sperre aller Systeme
        window.NEST_OFFLINE = true;

        if (!document.getElementById("nestOfflineOverlay")) {
            const overlay = document.createElement("div");
            overlay.id = "nestOfflineOverlay";
            overlay.innerHTML = `
                <div style="
                    position:fixed;
                    inset:0;
                    background:rgba(0,0,0,0.85);
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
                        <p style="opacity:0.8;">
                            Der Hüter ist nicht anwesend.<br>
                            Keiner darf handeln, ernten oder kämpfen.
                        </p>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
    },

    unlockNest() {
        console.log("☀️ THE NEST ERWACHT");

        document.body.classList.remove("nest-offline");
        window.NEST_OFFLINE = false;

        const overlay = document.getElementById("nestOfflineOverlay");
        if (overlay) overlay.remove();
    }
};

// automatisch starten
document.addEventListener("DOMContentLoaded", () => {
    StreamGate.init();
});
