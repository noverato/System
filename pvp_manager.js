/**
 * PvPManager - Das zentrale "Gehirn" für PvP-Sequenzen und Synchronisation.
 * Verwaltet Firebase-Status, Turn-Taking und Kommunikation zwischen Spielern.
 */
window.PvPManager = {
    currentBattleId: null,
    isHost: false,
    battleRef: null,
    active: false,
    animationLock: false,
    lastKnownData: null,
    currentResolvingAction: null, 
    actionQueue: [], // Warteschlange für eintreffende Aktionen
    lastResolvedActionTimestamp: 0, // Verhindert doppelte Auflösung derselben Aktion
    watchdogInterval: null,

    init(battleId, isHost) {
        if (!battleId) {
            console.error("❌ PvPManager.init: Keine BattleID übergeben!");
            return;
        }
        console.log(`🛡️ PvPManager wird initialisiert: BattleID=${battleId}, Host=${isHost}`);
        
        this.currentBattleId = battleId;
        this.isHost = isHost;
        this.active = true;
        this.animationLock = false;
        this.lastKnownData = null;
        this.currentResolvingAction = null;
        this.actionQueue = [];
        this.lastResolvedActionTimestamp = 0;
        
        if (window.db) {
            // Alte Listener entfernen, falls vorhanden
            if (this.battleRef) this.battleRef.off();
            
            this.battleRef = window.db.ref('pvp_battles/' + battleId);
            this.setupListeners();
            this.startWatchdog();
            console.log("✅ PvPManager: Firebase-Referenz gesetzt und Watchdog gestartet.");
        } else {
            console.error("❌ PvPManager: window.db ist nicht definiert!");
        }

        // Cleanup bei Seitenwechsel/Schließen
        window.addEventListener('beforeunload', () => this.endBattle('finished'));
    },

    startWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        
        // Der Watchdog ist jetzt nur noch eine letzte Rettung, falls ein DB-Event verloren geht
        this.watchdogInterval = setInterval(() => {
            if (!this.active || !this.battleRef || this.animationLock) return;
            
            if (this.lastKnownData) {
                const currentAction = this.lastKnownData.hostAction || this.lastKnownData.guestAction;
                // Nur wenn die Aktion wirklich neu ist und nicht schon in der Queue oder verarbeitet
                if (currentAction && currentAction.timestamp > this.lastResolvedActionTimestamp) {
                    const isAlreadyInQueue = this.actionQueue.some(a => a.action.timestamp === currentAction.timestamp);
                    if (!isAlreadyInQueue) {
                        console.log("🔍 Watchdog hat hängende Aktion gefunden und eingereiht!");
                        this.actionQueue.push({ bData: this.lastKnownData, action: currentAction });
                        this.processQueue();
                    }
                }
            }
        }, 500); // Entschärft auf 500ms
    },

    setupListeners() {
        if (!this.battleRef) return;

        this.battleRef.on('value', (snapshot) => {
            const bData = snapshot.val();
            if (!bData) {
                console.error("❌ PvPManager: Keine Daten von Firebase erhalten!");
                return;
            }
            if (!this.active) {
                console.warn("⚠️ PvPManager: Empfange Daten, aber Manager ist inaktiv.");
                return;
            }
            
            console.log("📥 PvPManager DB-Update:", {
                activePlayer: bData.activePlayer,
                hostAction: bData.hostAction ? bData.hostAction.type : 'null',
                guestAction: bData.guestAction ? bData.guestAction.type : 'null',
                turn: bData.turn,
                animationLock: this.animationLock
            });

            this.lastKnownData = bData; // Daten für Watchdog speichern

            // 1. Kampf-Ende prüfen
            if (bData.status === 'finished') {
                console.log("🏳️ Kampf als beendet markiert.");
                this.handleBattleEnd();
                return;
            }

            // 2. HP-Synchronisation (Event an BattleEngine)
            if (window.EventHub) {
                EventHub.emit('pvp:sync:hp', {
                    playerHP: this.isHost ? bData.hostHP : bData.guestHP,
                    enemyHP: this.isHost ? bData.guestHP : bData.hostHP
                });
            }

            // 3. Turn-Steuerung
            const isMyTurn = String(bData.activePlayer) === String(window.verifiedID);
            console.log(`🕒 Turn-Check: isMyTurn=${isMyTurn} (DB:${bData.activePlayer} vs Me:${window.verifiedID})`);
            
            if (window.EventHub) {
                EventHub.emit('pvp:turn:update', {
                    isMyTurn: isMyTurn,
                    activePlayer: bData.activePlayer
                });
            }

            // 4. Aktionen verarbeiten
            const currentAction = bData.hostAction || bData.guestAction;
            if (currentAction) {
                // Nur hinzufügen, wenn der Zeitstempel neu ist
                if (currentAction.timestamp > this.lastResolvedActionTimestamp) {
                    const isAlreadyInQueue = this.actionQueue.some(a => a.action.timestamp === currentAction.timestamp);
                    if (!isAlreadyInQueue) {
                        console.log("� Neue Aktion in Warteschlange eingereiht:", currentAction.type);
                        this.actionQueue.push({ bData, action: currentAction });
                    }
                }
            }

            // Warteschlange verarbeiten, falls möglich
            this.processQueue();
        });
    },

    processQueue() {
        if (this.animationLock || this.actionQueue.length === 0) return;

        const next = this.actionQueue.shift();
        console.log("🚀 Verarbeite nächste Aktion aus Warteschlange...");
        this.resolveAction(next.bData, next.action);
    },

    submitAction(type) {
        if (!this.active || !this.battleRef) {
            console.error("❌ submitAction abgelehnt: Manager inaktiv oder keine Ref.");
            return;
        }

        // Sicherstellen, dass wir wirklich dran sind
        const isMyTurn = this.lastKnownData && String(this.lastKnownData.activePlayer) === String(window.verifiedID);
        if (!isMyTurn) {
            console.warn("⚠️ submitAction abgelehnt: Nicht dein Zug!", {
                activeInDB: this.lastKnownData ? this.lastKnownData.activePlayer : 'unknown',
                myID: window.verifiedID
            });
            return;
        }

        const role = this.isHost ? 'hostAction' : 'guestAction';
        console.log(`📤 Sende PvP Aktion: ${type} als ${role}`);

        this.battleRef.update({
            [role]: { type: type, timestamp: Date.now() }
        }).then(() => {
            console.log("✅ Aktion erfolgreich an Firebase gesendet.");
        }).catch(err => console.error("❌ PvP Action Firebase Error:", err));
    },

    resolveAction(bData, action) {
        if (this.animationLock) return;
        this.animationLock = true;
        this.lastResolvedActionTimestamp = action.timestamp; // Zeitstempel merken
        
        // WICHTIG: Merken, wer die Aktion ausgeführt hat, bevor sie gelöscht wird
        const isHostAction = !!bData.hostAction;
        this.currentResolvingAction = {
            type: action.type,
            isHost: isHostAction,
            hostId: bData.hostId,
            guestId: bData.guestId
        };

        console.log("🎬 Starte Action-Auflösung:", action.type, "von", isHostAction ? "Host" : "Guest");

        // Event an BattleEngine senden, um Animationen zu starten
        if (window.EventHub) {
            const actingPlayerName = isHostAction ? bData.hostName : bData.guestName;
            const isMyAction = (this.isHost && isHostAction) || (!this.isHost && !isHostAction);

            EventHub.emit('pvp:action:resolve', {
                action: action,
                actingPlayerName: actingPlayerName,
                isMyAction: isMyAction,
                bData: bData
            });
        }
    },

    // Wird von BattleEngine aufgerufen, wenn Animation fertig ist
    completeAction(bData) {
        if (!this.active) {
            console.warn("⚠️ completeAction: Manager ist nicht aktiv.");
            return;
        }
        
        // WICHTIG: Wir brauchen actionInfo, um zu wissen, wer gerade agiert hat
        const actionInfo = this.currentResolvingAction;
        if (!actionInfo) {
            console.error("❌ completeAction: Keine currentResolvingAction gefunden! Abbruch um Desync zu verhindern.");
            this.animationLock = false;
            return;
        }

        console.log("🏁 --- Animation beendet. Starte Firebase-Switch ---");

        const isHostAction = actionInfo.isHost;
        const nextPlayer = isHostAction ? actionInfo.guestId : actionInfo.hostId;
        
        if (!nextPlayer) {
            console.error("❌ completeAction: Nächster Spieler konnte nicht ermittelt werden!", { actionInfo, bData });
            this.animationLock = false;
            this.currentResolvingAction = null;
            return;
        }

        console.log(`🔄 Turn-Wechsel: Von ${isHostAction ? 'Host' : 'Guest'} zu ${nextPlayer}`);
        
        // Nur der Host aktualisiert den globalen Status in Firebase
        const amITheOneWhoShouldUpdate = this.isHost; 

        if (amITheOneWhoShouldUpdate) {
            const updateData = {
                activePlayer: nextPlayer,
                turn: bData.turn + (!isHostAction ? 1 : 0)
            };

            // HP-Autorität bleibt beim Host (bData wurde in battle.js aktualisiert)
            updateData.hostHP = bData.hostHP;
            updateData.guestHP = bData.guestHP;
            
            // Verbrauchte Aktionen löschen
            updateData.hostAction = null;
            updateData.guestAction = null;

            console.log(`🗳️ Host sendet Turn-Abschluss an Firebase. Nächster: ${nextPlayer}`, updateData);

            if (this.battleRef) {
                this.battleRef.update(updateData).then(() => {
                    console.log(`✅ Firebase-Update erfolgreich.`);
                    this.animationLock = false;
                    this.currentResolvingAction = null;
                    this.processQueue(); // Nächste Aktion aus der Queue verarbeiten
                }).catch(err => {
                    console.error("❌ Firebase-Update Fehler:", err);
                    this.animationLock = false;
                    this.currentResolvingAction = null;
                    this.processQueue();
                });
            }
        } else {
            console.log("⏳ Guest wartet auf Host für Turn-Update...");
            this.animationLock = false;
            this.currentResolvingAction = null;
            this.processQueue(); // Nächste Aktion aus der Queue verarbeiten
        }
    },

    handleBattleEnd() {
        this.active = false;
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        if (this.battleRef) this.battleRef.off();
        if (window.EventHub) EventHub.emit('pvp:battle:end');
    },

    endBattle(status = 'finished') {
        if (this.battleRef) {
            this.battleRef.update({ status: status });
        }
        this.handleBattleEnd();
    }
};
