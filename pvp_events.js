/**
 * THE NEST: OVERLORD EDITION 2026
 * MODUL: pvp_events.js
 * Fokus: PvP-Logik, Boss-Events und Evolutions-Power-Schübe
 */

console.log("⚔️ pvp_events.js wird vom Browser gelesen...");

// Sofort global registrieren - Ohne IIFE oder komplexe Struktur
window.PvPEvents = {
    EVO_STAGES: {
        0: { name: "Ei", boost: 0, css: "evo-egg", aura: "none" },
        1: { name: "Drachen-Küken", boost: 0.05, css: "evo-hatchling", aura: "glitter", desc: "Kleiner Sprite, leichtes Glitzern" },
        2: { name: "Königlicher Drache", boost: 0.15, css: "evo-royal", aura: "gold-contour", desc: "Großer Sprite, goldene Kontur" },
        3: { name: "Skelett-Monarch", boost: 0.30, css: "evo-skeleton", aura: "purple-aura", desc: "Knöcherne Krone, lila Aura" },
        4: { name: "Goblin-König", boost: 0.50, css: "evo-goblin", aura: "green-shimmer", desc: "Zepter, grüner Schimmer" },
        5: { name: "Oger-Warlord", boost: 0.80, css: "evo-oger", aura: "red-tremor", desc: "Riesige Statur, rotes Beben" },
        6: { name: "Astral-Figur", boost: 1.20, css: "evo-astral", aura: "blue-glow", desc: "Halb-transparent, blaues Leuchten" },
        7: { name: "Göttlicher Avatar", boost: 2.00, css: "evo-avatar", aura: "divine-aura", desc: "Weiß-Goldene Aura, Partikel" }
    },

    // Diese Daten werden jetzt dynamisch aus window.onlinePlayers (Firebase) gespeist
    ONLINE_PLAYERS: {
        follower: [],
        sub: []
    },

    // Hilfsfunktion: Holt echte Online-Spieler aus window.onlinePlayers
    refreshOnlineData: function() {
        const players = window.onlinePlayers || {};
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        
        this.ONLINE_PLAYERS.follower = [];
        this.ONLINE_PLAYERS.sub = [];

        Object.keys(players).forEach(id => {
            const p = players[id];
            // Nur Spieler anzeigen, die innerhalb der letzten 5 Minuten aktiv waren
            // Und nicht man selbst (verifiedID)
            if (p && p.name && (now - (p.lastSeen || 0) < FIVE_MINUTES) && id !== window.verifiedID) {
                const playerData = {
                    id: id, // Firebase ID speichern für Herausforderungen
                    name: p.name,
                    level: (p.stats && p.stats.currentLevel) ? p.stats.currentLevel : 1,
                    evo: (p.stats && p.stats.totalEvoLevel) ? p.stats.totalEvoLevel : 0,
                    isSub: p.isSub || false
                };

                if (playerData.isSub) {
                    this.ONLINE_PLAYERS.sub.push(playerData);
                } else {
                    this.ONLINE_PLAYERS.follower.push(playerData);
                }
            }
        });

        // Fallback: Wenn niemand online ist, füge einen "Geist" hinzu, damit die Liste nicht leer ist (optional)
        if (this.ONLINE_PLAYERS.follower.length === 0) {
            this.ONLINE_PLAYERS.follower.push({ name: "Waldgeist (NPC)", level: 5, evo: 0, isSub: false });
        }
    },

    injectStyles: function() {
        if (document.getElementById('pvp-evo-styles')) return;
        const style = document.createElement('style');
        style.id = 'pvp-evo-styles';
        style.textContent = `
            .evo-glitter { filter: drop-shadow(0 0 5px #fff); animation: pvp-pulse 2s infinite alternate; }
            .evo-gold-contour { filter: drop-shadow(0 0 8px gold); }
            .evo-purple-aura { filter: drop-shadow(0 0 12px #a855f7); }
            .evo-green-shimmer { filter: drop-shadow(0 0 10px #4ade80); }
            .evo-red-tremor { filter: drop-shadow(0 0 15px #ff4444); animation: pvp-shake 0.5s infinite; }
            .evo-astral { opacity: 0.7; filter: drop-shadow(0 0 20px #3b82f6); }
            .evo-divine-aura { filter: drop-shadow(0 0 25px #fbbf24) brightness(1.2); }
            @keyframes pvp-pulse { from { opacity: 0.8; } to { opacity: 1; } }
            @keyframes pvp-shake { 
                0% { transform: translate(1px, 1px) rotate(0deg); }
                20% { transform: translate(-1px, -2px) rotate(-1deg); }
                40% { transform: translate(-3px, 0px) rotate(1deg); }
                60% { transform: translate(3px, 2px) rotate(0deg); }
                80% { transform: translate(1px, -1px) rotate(1deg); }
                100% { transform: translate(-1px, 2px) rotate(-1deg); }
            }
        `;
        document.head.appendChild(style);
    },

    getEvoData: function(level) {
        return this.EVO_STAGES[level] || this.EVO_STAGES[0];
    },

    openMenu: function() {
        console.log("PvPEvents.openMenu aufgerufen!");
        this.injectStyles();
        
        const gameModal = document.getElementById('gameModal');
        if (gameModal) {
            gameModal.style.zIndex = '30000';
            gameModal.style.display = 'flex';
        }

        const left = document.getElementById('modalLeft');
        const sideContent = document.getElementById('sideContent');
        if (!left || !sideContent) {
            console.error("Arena-Modal-Elemente nicht gefunden!", { left, sideContent });
            return;
        }

        // Left Panel Setup
        left.style.backgroundImage = "url('./arena_innen.png')";
        left.style.backgroundSize = "cover";
        left.style.backgroundPosition = "center";
        left.style.backgroundBlendMode = "multiply";
        left.style.backgroundColor = "rgba(0,0,0,0.4)";

        const isSub = (window.data && window.data.isSub) ? true : false;
        const currentEvo = (window.data && window.data.stats) ? (window.data.stats.totalEvoLevel || 0) : 0;
        const startEvo = isSub ? Math.max(1, currentEvo) : currentEvo;
        const evoInfo = this.getEvoData(startEvo);

        left.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:30px; text-align:center; color:white; background: radial-gradient(circle, rgba(26,26,46,0.7) 0%, rgba(22,33,62,0.9) 100%);">
                <h1 style="color:gold; text-shadow:0 0 15px rgba(255,215,0,0.8); font-size:42px; margin-bottom:10px;">⚔️ ELITE ARENA ⚔️</h1>
                
                <div style="background:rgba(0,0,0,0.6); padding:20px; border:2px solid gold; border-radius:15px; min-width:350px;">
                    <h3 style="margin:0; color:#4ade80;">Dein Status: ${isSub ? '🌟 Abonnent (Sub)' : '👤 Follower'}</h3>
                    <p style="margin:10px 0; color:#aaa;">Aktuelle Form: <span style="color:white; font-weight:bold;">${evoInfo.name}</span></p>
                    <div style="font-size:14px; color:gold;">${evoInfo.desc || ''}</div>
                    <div style="margin-top:10px; font-size:18px; color:#4ade80;">Power-Schub: +${(evoInfo.boost * 100).toFixed(0)}%</div>
                </div>

                <div style="display:flex; gap:20px;">
                    <button class="btn-action" onclick="PvPEvents.showOnlineList('follower')" style="min-width:220px; background:#3b82f6;">👤 Follower vs Follower</button>
                    <button class="btn-action" onclick="PvPEvents.showOnlineList('sub')" style="min-width:220px; background:#a855f7;">🌟 Sub vs Sub</button>
                </div>

                <button class="btn-action" onclick="PvPEvents.startBossEvent()" style="min-width:300px; background:linear-gradient(90deg, #933, #f44);">👑 BOSS-EVENT STARTEN</button>
                
                <button class="btn-action" onclick="PvPEvents.close()" style="background:#444; margin-top:20px;">❌ Schließen</button>
            </div>
        `;

        // Right Panel Setup (Nutzt existierendes sideContent)
        sideContent.innerHTML = `
            <div id="arena-info-content" style="color:white;">
                <p style="color:#aaa; font-style:italic;">Wähle einen Modus links, um verfügbare Herausforderer zu sehen.</p>
            </div>
        `;
    },

    showOnlineList: function(mode) {
        this.refreshOnlineData(); // Daten vor dem Anzeigen frisch aus Firebase/window ziehen
        
        const rightContent = document.getElementById('arena-info-content');
        if (!rightContent) return;

        const isSub = (window.data && window.data.isSub) ? true : false;
        if (mode === 'sub' && !isSub) {
            alert("❌ Nur Abonnenten können an Sub-Kämpfen teilnehmen!");
            return;
        }

        const players = this.ONLINE_PLAYERS[mode];
        let html = `<h3 style="color:${mode === 'sub' ? '#a855f7' : '#3b82f6'}; margin-top:0;">${mode === 'sub' ? '🌟 Online Subs' : '👤 Online Follower'}</h3>`;
        html += `<div style="display:flex; flex-direction:column; gap:10px;">`;

        if (players.length === 0) {
            html += `<p style="color:#666; font-style:italic;">Gerade niemand in dieser Kategorie online...</p>`;
        } else {
            players.forEach(p => {
                const evo = this.getEvoData(p.evo);
                html += `
                    <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:8px; border-left:4px solid ${mode === 'sub' ? '#a855f7' : '#3b82f6'}; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:bold; color:white;">${p.name}</div>
                            <div style="font-size:12px; color:#aaa;">Form: <span style="color:gold;">${evo.name}</span> | Lvl: ${p.level}</div>
                        </div>
                        <button onclick="PvPEvents.challengePlayer('${p.id}', '${p.name}', ${p.evo}, ${p.level})" 
                                style="background:transparent; border:1px solid gold; color:gold; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:12px; transition:0.3s;"
                                onmouseover="this.style.background='gold'; this.style.color='black';"
                                onmouseout="this.style.background='transparent'; this.style.color='gold';">
                            Fordern
                        </button>
                    </div>
                `;
            });
        }

        html += `</div>`;
        rightContent.innerHTML = html;
    },

    challengePlayer: function(targetId, name, evoLevel, level) {
        if (!targetId || targetId.includes('NPC')) {
            this.startDirectCombat(name, evoLevel, level);
            return;
        }

        console.log(`⚔️ Herausforderung an ${name} (${targetId}) gesendet...`);
        
        if (window.db) {
            const challengeId = window.verifiedID + "_" + targetId;
            const challengePath = 'pvp_battles/' + challengeId;
            
            this.currentBattleId = challengeId;
            this.isHost = true;

            window.db.ref(challengePath).set({
                hostId: window.verifiedID,
                guestId: targetId,
                hostName: window.data?.name || "Unbekannt",
                guestName: name,
                hostLevel: window.data?.stats?.currentLevel || 1,
                guestLevel: level || 1,
                hostEvo: window.data?.stats?.totalEvoLevel || 0,
                guestEvo: evoLevel || 0,
                status: 'pending',
                timestamp: Date.now(),
                hostAction: null,
                guestAction: null,
                hostHP: 100 + ((window.data?.stats?.currentLevel || 1) * 10),
                guestHP: 100 + (level * 10),
                turn: 1,
                activePlayer: window.verifiedID // Host fängt an
            });

            // Listener für die Antwort und den Kampfverlauf
            window.db.ref(challengePath).on('value', (snapshot) => {
                const data = snapshot.val();
                if (!data) return;

                if (data.status === 'accepted' && !BattleEngine.active) {
                    this.startDirectCombat(data, challengeId);
                } else if (data.status === 'rejected') {
                    window.db.ref(challengePath).off();
                    window.db.ref(challengePath).remove();
                    alert(`❌ ${name} hat die Herausforderung abgelehnt.`);
                } else if (data.status === 'finished') {
                    window.db.ref(challengePath).off();
                }
            });

            // Den Gast über die Challenge informieren (via altem Pfad für Kompatibilität oder neuen Listener)
            window.db.ref('challenges/' + targetId).set({
                fromId: window.verifiedID,
                battleId: challengeId,
                status: 'pending'
            });

            alert(`Herausforderung an ${name} gesendet! Warte auf Antwort...`);
        } else {
            this.startDirectCombat(name, evoLevel, level);
        }
    },

    startDirectCombat: function(battleData, battleId = null) {
        // Falls battleData nur ein Name ist (Fallback für alte Aufrufe)
        if (typeof battleData === 'string') {
            const name = battleData;
            const evoLevel = arguments[1] || 0;
            const level = arguments[2] || 1;
            battleId = arguments[3] || null;
            
            battleData = {
                guestName: name,
                hostName: window.data?.name || "Held",
                guestEvo: evoLevel,
                hostEvo: window.data?.stats?.totalEvoLevel || 0,
                guestLevel: level,
                hostLevel: window.data?.stats?.currentLevel || 1,
                guestHP: 100 + (level * 10),
                hostHP: 100 + ((window.data?.stats?.currentLevel || 1) * 10)
            };
        }

        console.log(`🚀 Starte PvP-Kampf... BattleID: ${battleId}`);
            const isHost = this.isHost;
            
            // WICHTIG: PvPManager initialisieren BEVOR BattleEngine.startCombat aufgerufen wird
            if (window.PvPManager && battleId) {
                console.log("🛠️ PvPManager manuell vorstarten...");
                window.PvPManager.init(battleId, isHost);
            } else {
                console.error("❌ PvPManager oder BattleID fehlt!", { battleId, hasManager: !!window.PvPManager });
            }

            const opponentName = isHost ? battleData.guestName : battleData.hostName;
        const opponentEvo = isHost ? battleData.guestEvo : battleData.hostEvo;
        const opponentLevel = isHost ? battleData.guestLevel : battleData.hostLevel;
        const opponentMaxHP = isHost ? battleData.guestHP : battleData.hostHP;
        
        const sideContent = document.getElementById('sideContent');
        if (sideContent) sideContent.innerHTML = '';
        
        const left = document.getElementById('modalLeft');
        if (left) {
            Array.from(left.childNodes).forEach(node => {
                if (node.tagName !== 'CANVAS' && node.id !== 'audio-ctrl' && node.id !== 'battleUIOverlay') {
                    left.removeChild(node);
                }
            });
        }

        const opponent = {
                name: opponentName,
                hp: opponentMaxHP,
                maxHp: opponentMaxHP,
                atk: (10 + (opponentLevel * 2)) * (1 + this.getEvoData(opponentEvo).boost),
                def: 5 + Math.floor(opponentLevel / 2),
                spd: 12,
                evoLevel: opponentEvo,
                lxpReward: 100 + (opponentEvo * 50),
                isPvP: true,
                battleId: battleId,
                cssClass: this.getEvoData(opponentEvo).css
            };

            if (window.BattleEngine) {
                BattleEngine.startCombat(opponent);
            }
    },

    initChallengeListener: function() {
        if (!window.db || !window.verifiedID) return;
        
        console.log("📡 PvP-Challenge-Listener wird aktiviert...");
        
        // Listener für neue Challenges
        window.db.ref('challenges/' + window.verifiedID).on('value', (snapshot) => {
            const challenge = snapshot.val();
            if (challenge && challenge.status === 'pending' && challenge.battleId) {
                // Details aus dem Battle-Node holen
                window.db.ref('pvp_battles/' + challenge.battleId).once('value').then(snap => {
                    const battleData = snap.val();
                    if (battleData) {
                        this.showChallengeNotification(battleData, challenge.battleId);
                    }
                });
            }
        });
    },

    showChallengeNotification: function(battleData, battleId) {
        const notificationId = 'pvp-notify-' + battleData.hostId;
        if (document.getElementById(notificationId)) return;

        const notify = document.createElement('div');
        notify.id = notificationId;
        notify.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.95); border: 3px solid gold; border-radius: 15px;
            padding: 30px; z-index: 50000; color: white; text-align: center;
            box-shadow: 0 0 50px rgba(255,215,0,0.5); min-width: 300px;
        `;

        notify.innerHTML = `
            <h2 style="color:gold; margin-top:0;">⚔️ HERAUSFORDERUNG! ⚔️</h2>
            <p style="font-size:18px;"><span style="color:#4ade80; font-weight:bold;">${battleData.hostName}</span> fordert dich zum Duell!</p>
            <p style="font-size:14px; color:#aaa;">Level: ${battleData.hostLevel} | Form: ${this.getEvoData(battleData.hostEvo).name}</p>
            <div style="display:flex; gap:15px; justify-content:center; margin-top:20px;">
                <button id="accept-challenge" style="background:#4ade80; color:black; border:none; padding:10px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">ANNEHMEN</button>
                <button id="reject-challenge" style="background:#ff4444; color:white; border:none; padding:10px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">ABLEHNEN</button>
            </div>
        `;

        document.body.appendChild(notify);

        document.getElementById('accept-challenge').onclick = () => {
            this.isHost = false;
            this.currentBattleId = battleId;
            this.handleChallengeResponse(battleId, 'accepted');
            document.body.removeChild(notify);
            
            // Sofort Kampf starten
            this.startDirectCombat(battleData, battleId);
        };

        document.getElementById('reject-challenge').onclick = () => {
            this.handleChallengeResponse(battleId, 'rejected');
            document.body.removeChild(notify);
        };
    },

    handleChallengeResponse: function(battleId, response) {
        if (window.db) {
            window.db.ref('pvp_battles/' + battleId).update({ status: response });
            window.db.ref('challenges/' + window.verifiedID).remove();
        }
    },

    close: function() {
        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', false);
        } else {
            const m = document.getElementById('gameModal');
            if (m) m.style.display = 'none';
        }
    },

    startBossEvent: function() {
        const boss = {
            name: "👑 DER WELTENFRESSER",
            hp: 1500,
            maxHp: 1500,
            atk: 45,
            def: 25,
            spd: 8,
            evoLevel: 7,
            lxpReward: 1000,
            isBoss: true,
            cssClass: "evo-avatar"
        };
        if (window.BattleEngine) {
            BattleEngine.startCombat(boss);
        }
    }
};

// Automatischer Start des Challenge-Listeners
(function startPvPListener() {
    const checkReady = setInterval(() => {
        if (window.db && window.verifiedID) {
            PvPEvents.initChallengeListener();
            clearInterval(checkReady);
        }
    }, 1000);
})();

console.log("⚔️ PvPEvents erfolgreich global unter window.PvPEvents registriert!");
