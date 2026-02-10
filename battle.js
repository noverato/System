/**
 * THE NEST: OVERLORD EDITION 2026
 * MODUL: battle.js (Rolle: Battle-Meister)
 * Fokus: Event-gesteuerter Kampfstart (Decoupled), ATB-System & Equipment-Sync
 */

window.EVO_IMGS = ['Ei.png', 'drache.png', 'Schleim.png', 'Skelett.png', 'Goblin.png', 'Oger.png', 'Lich.png', 'HoeherWesen.png'];

window.BattleEngine = {
    active: false,
    isPaused: false,
    player: null,
    enemy: null,
    playerATB: 0,
    enemyATB: 0,
    healsUsed: 0,
    maxHeals: 3,
    animationLock: false,
    pvpListenersAttached: false,

    // --- 1. INITIALISIERUNG ---
    startCombat(monsterData) {
        if (this.active || !monsterData) return;

        this.active = true;
        console.log("⚔️ Battle-Meister: Kampf wird initialisiert. Monster:", monsterData.name);
        
        this.wasInForest = (window.FPWald && document.getElementById('fpModal').style.display === 'flex');
        if (window.FPWald && typeof window.FPWald.close === 'function') window.FPWald.close();

        this.resetState();
        this.playEncounterSound();

        if (window.EventHub) EventHub.emit(EventHub.EVENTS.BATTLE_START, {});

        const weaponPower = data.equipment?.weapon?.power || 0;
        const armorValue = data.equipment?.armor?.value || 0;
        let evoLevel = data.stats?.totalEvoLevel || 0;
        if (data.isSub && evoLevel < 1) evoLevel = 1;
        
        const evoBoosts = [0, 0.05, 0.15, 0.30, 0.50, 0.80, 1.20, 2.00];
        const currentBoost = evoBoosts[evoLevel] || 0;

        const adminPowerLevel = localStorage.getItem('adminPowerLevel') || 'god';
        let adminAtkBonus = 1;
        let adminDefBonus = 1;
        let baseAtk = data.stats?.atk || 10;

        if (window.isAdmin) {
            switch(adminPowerLevel) {
                case 'easy': 
                    adminAtkBonus = 1.0; 
                    break;
                case 'normal': 
                    adminAtkBonus = 1.5; 
                    adminDefBonus = 1.2;
                    break;
                case 'hard': 
                    adminAtkBonus = 3.0; 
                    adminDefBonus = 2.0;
                    break;
                case 'god': 
                    baseAtk = 999; 
                    break;
            }
        }

        this.player = {
            name: data.name || "Held",
            hp: data.hp || 100,
            maxHp: data.maxHp || 100,
            mp: data.stats?.mp || 20,
            maxMp: data.stats?.mp || 20,
            atk: Math.floor(((baseAtk + weaponPower) * (1 + currentBoost)) * adminAtkBonus),
            def: Math.floor(((data.stats?.def || 5) + armorValue) * (1 + currentBoost) * adminDefBonus),
            spd: data.stats?.spd || 10,
            lvl: data.stats?.currentLevel || 1,
            evoName: (window.PvPEvents && window.PvPEvents.getEvoData) ? window.PvPEvents.getEvoData(evoLevel).name : "Held"
        };

        this.enemy = {
            ...monsterData,
            hp: monsterData.hp,
            maxHp: monsterData.maxHp,
            isMonster: !monsterData.isPvP && !monsterData.isBoss,
            isPvP: monsterData.isPvP || false,
            isBoss: monsterData.isBoss || false,
            battleId: monsterData.battleId || null
        };
        
        // PvP-Sync initialisieren (Event-basiert via PvPManager)
        if (this.enemy.isPvP && window.EventHub) {
            this.setupPvPListeners();
        }

        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', true);
        } else {
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'flex';
        }

        const gameModal = document.getElementById('gameModal');
        const modalPanel = document.querySelector('#gameModal .mmo-panel');
        const modalLeft = document.getElementById('modalLeft');
        const modalSide = document.querySelector('#gameModal .panel-side');
        
        if (gameModal) gameModal.classList.add('fullscreen');
        if (modalPanel) modalPanel.classList.add('fullscreen');
        if (modalLeft) modalLeft.classList.add('fullscreen');
        if (modalSide) modalSide.classList.add('fullscreen');

        const left = document.getElementById('modalLeft');
        if (left) {
            Array.from(left.childNodes).forEach(node => {
                if (node.tagName !== 'CANVAS' && node.id !== 'audio-ctrl') {
                    left.removeChild(node);
                }
            });
        }

        this.renderArena();
        if (window.EventHub) EventHub.emit(EventHub.EVENTS.BATTLE_STAGE_READY, {});
        this.startLoop();
        
        this.initLog();
        this.log(`PvP-Duell gegen ${this.enemy.name} beginnt!`, "gold");
        if (this.enemy.isPvP) this.log("Warte auf ATB und simultane Aktionen...", "white");
    },

    playEncounterSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(110, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
            
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        } catch(e) { console.warn("Audio Error:", e); }
    },

    resetState() {
        this.playerATB = 0;
        this.enemyATB = 0;
        this.healsUsed = 0;
        this.animationLock = false;
        this.isPaused = false;
    },

    initLog() {
        const sideContent = document.getElementById('sideContent');
        if (!sideContent) return;

        // Container für den Battlelog im SideContent erstellen
        sideContent.innerHTML = `
            <div id="battleLog" style="
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 5px;
                font-family: 'Arial', sans-serif;
                font-size: 14px;
                overflow-y: auto;
                padding: 10px;
                background: rgba(0,0,50,0.6);
                border-radius: 8px;
                border: 2px solid #fff;
                box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
                color: #fff;
                text-shadow: 1px 1px 2px #000;
            "></div>
        `;
    },

    log(msg, color = "white") {
        const logBox = document.getElementById('battleLog');
        if (!logBox) return;

        const entry = document.createElement('div');
        entry.style.color = color;
        entry.style.padding = "2px 0";
        entry.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        entry.innerHTML = `<span style="color:rgba(255,255,255,0.3); margin-right:8px;">[${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span> ${msg}`;
        
        logBox.appendChild(entry);
        logBox.scrollTop = logBox.scrollHeight;

        // Limitiere Logs auf 50 Einträge
        while (logBox.children.length > 50) {
            logBox.removeChild(logBox.firstChild);
        }
    },

    // --- 2. ATB ENGINE ---
    startLoop() {
        this.playerActionNotified = false; // Flag für Beep-Control
        const tick = () => {
            if (!this.active) return; 
            
            // Im PvP gibt es kein ATB, wir warten auf den aktiven Spieler
            if (this.enemy.isPvP) {
                this.updateBars();
                requestAnimationFrame(tick);
                return;
            }

            if (!this.isPaused && !this.animationLock) {
                this.playerATB += (this.player.spd * 0.07);
                this.enemyATB += (this.enemy.spd * 0.07);
                
                this.updateBars();

                if (this.playerATB >= 100) {
                    this.playerATB = 100;
                    this.toggleActionButtons(true);
                    
                    // Sound nur einmal triggern, wenn ATB voll wird
                    if (!this.playerActionNotified && window.EventHub) { 
                        this.playerActionNotified = true;
                        EventHub.emit('battle:actionlock', { side: 'player' }); 
                    }
                }

                if (this.enemyATB >= 100) {
                    this.enemyATB = 100;
                    this.executeEnemyTurn();
                }
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    // --- 3. KAMPF-LOGIK & MATHEMATIK ---
    executeAction(type) {
        if (this.animationLock) return;
        
        // PvP-Logik: Aktion an PvPManager delegieren
        if (this.enemy.isPvP && window.PvPManager) {
            this.animationLock = true;
            this.toggleActionButtons(false);
            this.log("Aktion wird ausgeführt...", "orange");
            window.PvPManager.submitAction(type);
            return;
        }

        if (this.playerATB < 100) return;
        
        this.animationLock = true;
        this.toggleActionButtons(false);
        this.playerActionNotified = false; // Reset für den nächsten Turn

        if (type === 'attack') {
            if (window.EventHub) { EventHub.emit('battle:action:start', { side: 'player' }); }
            this.calculateDamage(this.player, this.enemy, 'player');
            if (window.EventHub) { EventHub.emit('battle:impact', { side: 'player' }); }
        } else if (type === 'heal') {
            this.executeHeal();
        }

        this.playerATB = 0;
        this.checkVictoryCondition();
        if (window.EventHub) { EventHub.emit('battle:resolve', { side: 'player' }); }
        
        if (this.active) {
            setTimeout(() => { this.animationLock = false; }, 600);
        }
    },

    // --- PvP EVENT LISTENERS ---
    setupPvPListeners() {
        if (this.pvpListenersAttached) return;
        this.pvpListenersAttached = true;
        
        console.log("📡 BattleEngine: PvP-Event-Listener werden einmalig registriert.");

        // 1. HP Sync
        EventHub.on('pvp:sync:hp', (data) => {
            if (!this.active) return;
            if (Math.abs(this.player.hp - data.playerHP) > 0.5 || Math.abs(this.enemy.hp - data.enemyHP) > 0.5) {
                this.player.hp = data.playerHP;
                this.enemy.hp = data.enemyHP;
                window.data.hp = Math.ceil(this.player.hp);
                this.updateBars();
            }
        });

        // 2. Turn Update
        EventHub.on('pvp:turn:update', (data) => {
            if (!this.active) return;
            this.lastPvPTurnData = data; // Zustand merken für Ende der Animation
            
            if (data.isMyTurn) {
                if (!this.animationLock) {
                    this.toggleActionButtons(true);
                    this.playerATB = 100;
                } else {
                    console.log("⏳ Turn-Wechsel empfangen, aber Animation läuft noch...");
                }
            } else {
                this.toggleActionButtons(false);
                this.playerATB = 0;
                this.log("Warte auf Gegner...", "gray");
            }
        });

        // 3. Action Resolve
        EventHub.on('pvp:action:resolve', (data) => {
            this.resolvePvPAction(data.bData, data.action);
        });

        // 4. Battle End
        EventHub.on('pvp:battle:end', () => {
            if (this.active) {
                this.log("Der Kampf wurde beendet.", "gray");
                this.active = false;
                setTimeout(() => this.endCombat(), 2000);
            }
        });
    },

    // Neue Methode für sequenzielle PvP-Rundenauflösung
    resolvePvPAction(bData, action) {
        if (!this.active || !action) return;
        
        this.animationLock = true;
        this.toggleActionButtons(false);

        const isHost = window.PvPManager.isHost;
        const actingPlayerName = (bData.hostAction) ? bData.hostName : bData.guestName;
        const isMyAction = (isHost && bData.hostAction) || (!isHost && bData.guestAction);

        this.log(`--- Aktion von ${actingPlayerName} ---`, "gold");

        // 1. Aktion visualisieren
        setTimeout(() => {
            if (action.type === 'attack') {
                if (window.EventHub) EventHub.emit('battle:action:start', { side: isMyAction ? 'player' : 'enemy' });
                this.log(`${actingPlayerName} greift an!`, isMyAction ? "#4ade80" : "#ff4444");
            } else {
                this.log(`${actingPlayerName} heilt sich!`, "cyan");
            }

                // 2. Schaden/Heilung berechnen
                setTimeout(() => {
                    let dmg = 0;
                    let heal = 0;

                    if (action.type === 'attack') {
                        // Wir nutzen die echten Stats der BattleEngine
                        const attacker = isMyAction ? this.player : this.enemy;
                        const defender = isMyAction ? this.enemy : this.player;
                        
                        // Schaden berechnen (Host berechnet, Guest übernimmt falls möglich)
                        // Um Desyncs zu vermeiden: Wenn wir Guest sind, nehmen wir den Schaden, der in bData steht (falls der Host ihn schon berechnet hat)
                        // Aber am sichersten ist: Wir berechnen ihn hier lokal, und der Host-Sync korrigiert ihn später.
                        const variance = 0.85 + Math.random() * 0.3;
                        dmg = Math.max(1, Math.floor((attacker.atk * variance) - (defender.def * 0.7)));
                    } else {
                        heal = Math.floor(this.player.maxHp * 0.25);
                    }

                    // HP im bData-Objekt für den PvPManager-Transfer aktualisieren
                    if (isHost) {
                        // Host-Logik: Berechne finalen Stand für die DB
                        if (isMyAction) { // Host greift an
                            if (dmg > 0) bData.guestHP -= dmg;
                            if (heal > 0) bData.hostHP += heal;
                        } else { // Guest greift an
                            if (dmg > 0) bData.hostHP -= dmg;
                            if (heal > 0) bData.guestHP += heal;
                        }
                    }

                    // Lokale Anzeige aktualisieren (unabhängig von Host/Guest für flüssiges Gefühl)
                    if (isMyAction) {
                        if (dmg > 0) this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
                        if (heal > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
                    } else {
                        if (dmg > 0) this.player.hp = Math.max(0, this.player.hp - dmg);
                        if (heal > 0) this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + heal);
                    }
                    
                    this.updateBars();

                    if (dmg > 0) this.log(`${dmg} Schaden!`, isMyAction ? "#4ade80" : "#ff4444");
                    if (heal > 0) this.log(`${heal} HP geheilt!`, "cyan");

                    if (window.EventHub && dmg > 0) {
                        EventHub.emit('battle:impact', { side: isMyAction ? 'player' : 'enemy' });
                    }

                    // 3. Abschluss an PvPManager melden
                    setTimeout(() => {
                        this.checkVictoryCondition();
                        if (this.active) {
                            this.animationLock = false; // BattleEngine Lock lösen
                            
                            // WICHTIG: Falls während der Animation ein Turn-Wechsel kam, jetzt Buttons aktivieren
                            if (this.lastPvPTurnData && this.lastPvPTurnData.isMyTurn) {
                                console.log("✅ Animation beendet, aktiviere Buttons für eigenen Turn.");
                                this.toggleActionButtons(true);
                                this.playerATB = 100;
                            }

                            if (window.PvPManager) {
                                window.PvPManager.completeAction(bData);
                            }
                        } else {
                            // Kampf ist beendet - PvPManager informieren für Firebase-Sync
                            if (window.PvPManager && window.PvPManager.active) {
                                window.PvPManager.endBattle('finished');
                            }
                        }
                    }, 1000);

                }, 800);
        }, 500);
    },

    executeEnemyTurn() {
        this.animationLock = true;
        this.toggleActionButtons(false);

        setTimeout(() => {
            if (!this.active) return;
            if (window.EventHub) { EventHub.emit('battle:action:start', { side: 'enemy' }); }
            this.calculateDamage(this.enemy, this.player, 'enemy');
            if (window.EventHub) { EventHub.emit('battle:impact', { side: 'enemy' }); }
            this.enemyATB = 0;
            this.checkVictoryCondition();
            if (window.EventHub) { EventHub.emit('battle:resolve', { side: 'enemy' }); }
            
            if (this.active) {
                this.animationLock = false;
            }
        }, 900);
    },

    calculateDamage(attacker, defender, side) {
        const variance = 0.85 + Math.random() * 0.3;
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.7));
        dmg = Math.max(1, dmg); 

        defender.hp -= dmg;
        
        if (side === 'enemy') {
            data.hp = Math.max(0, Math.ceil(this.player.hp));
        }

        this.log(`${attacker.name} trifft für ${dmg} Schaden!`, side === 'player' ? '#4ade80' : '#ff4444');
        this.updateBars();
    },

    executeHeal() {
        if (this.healsUsed >= this.maxHeals) return;
        const healAmt = Math.floor(this.player.maxHp * 0.25);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        data.hp = this.player.hp;
        this.healsUsed++;
        this.log(`✨ Heilung! +${healAmt} HP`, 'cyan');
        this.updateBars();
        if (window.EventHub) { EventHub.emit('battle:heal', { side: 'player', amount: healAmt }); }
    },

    checkVictoryCondition() {
        if (this.enemy.hp <= 0) {
            this.enemy.hp = 0;
            this.active = false;
            this.win();
        } else if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.active = false;
            this.lose();
        }
    },

    win() {
        const reward = this.enemy.lxpReward || 50;
        this.log(`🏆 SIEG! +${reward} LXP erhalten!`, "gold");
        data.lxp += reward;
        
        // Loot-Generierung (Lokal für UI-Feedback)
        if (window.LootManager && typeof window.LootManager.getDrop === 'function') {
            const drop = window.LootManager.getDrop(this.enemy);
            if (drop) {
                // Beute-Flavor anwenden (falls vorhanden)
                const finalItem = (window.Beute && typeof Beute.applyBeuteFlavor === 'function') 
                    ? Beute.applyBeuteFlavor(drop, this.enemy) 
                    : drop;

                if (!data.inventar) data.inventar = {};
                data.inventar[finalItem.id] = (data.inventar[finalItem.id] || 0) + 1;
                data.inventarMeta = data.inventarMeta || {};
                data.inventarMeta[finalItem.id] = { emoji: finalItem.emoji || '📦', name: finalItem.display_name || finalItem.name };
                const lootEmoji = finalItem.emoji || '📦';
                this.log(`🎒 Beute: ${lootEmoji} ${finalItem.display_name || finalItem.name}`, "#a855f7");
            }
        }
        
        // Event senden (für Cooldown-Reset in Encounter.js)
        if (window.EventHub) {
            EventHub.emit('battle:victory', { monster: this.enemy });
        }

        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    lose() {
        this.log("💀 Du wurdest bezwungen...", "#ff4444");
        data.hp = data.maxHp; 
        
        if (window.EventHub) {
            EventHub.emit('battle:lose', { monster: this.enemy });
        }

        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    // --- 4. UI & RENDERING ---
    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.style.backgroundImage = "none";
        left.style.backgroundColor = "#0e1f2e";

        const data = window.data || {};
        const isAdmin = window.isAdmin || false;
        const myImg = isAdmin ? 'Overlord.png' : (typeof EVO_IMGS !== 'undefined' ? EVO_IMGS[data.stats?.totalEvoLevel || 0] : 'Ei.png');
        const barTextStyle = "position:absolute; width:100%; top:0; left:0; text-align:center; color:white; font-size:11px; font-weight:bold; text-shadow: 1px 1px 2px #000; line-height:14px; pointer-events:none; z-index:5;";

        // UI-Container erstellen, um 3D-Canvas nicht zu überschreiben
        let uiOverlay = document.getElementById('battleUIOverlay');
        if (!uiOverlay) {
            uiOverlay = document.createElement('div');
            uiOverlay.id = 'battleUIOverlay';
            uiOverlay.style.position = 'absolute';
            uiOverlay.style.inset = '0';
            uiOverlay.style.zIndex = '1000'; 
            uiOverlay.style.pointerEvents = 'none';
            uiOverlay.style.display = 'flex';
            uiOverlay.style.flexDirection = 'column';
            uiOverlay.style.padding = '0'; 
            left.appendChild(uiOverlay);
            
            if (!document.getElementById('battle-ui-styles')) {
                const style = document.createElement('style');
                style.id = 'battle-ui-styles';
                style.textContent = `
                    @keyframes battleFadeIn { 
                        from { opacity: 0; transform: translateY(20px); } 
                        to { opacity: 1; transform: translateY(0); } 
                    }
                    .battle-unit { animation: battleFadeIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
                    .battle-vs { animation: battleFadeIn 1s ease-out 0.3s both; }
                    .battle-actions { animation: battleFadeIn 0.5s ease-out 0.6s both; }
                    .btn-action:disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(1); }
                    .btn-action:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 0 15px var(--gold); }
                    .btn-action { pointer-events: auto !important; position: relative; z-index: 1001; }

                    /* FF7 Style UI Overrides */
                    .fullscreen .ff7-box {
                        background: rgba(0, 0, 150, 0.85);
                        border: 3px solid #fff;
                        border-radius: 8px;
                        box-shadow: inset 0 0 15px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.8);
                        padding: 12px;
                        color: #fff;
                        font-family: 'Arial', sans-serif;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        pointer-events: auto;
                    }
                    .fullscreen .ff7-bar-bg {
                        background: #111;
                        border: 1px solid #aaa;
                        height: 10px;
                        border-radius: 2px;
                        overflow: hidden;
                    }
                    .fullscreen .ff7-split-footer {
                        display: flex;
                        gap: 20px;
                        width: 100%;
                        max-width: 1200px;
                        margin: 0 auto;
                        align-items: stretch;
                    }
                    .fullscreen .ff7-actions-column {
                        flex: 0 0 200px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    .fullscreen .ff7-stats-column {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .fullscreen .btn-action.ff7-box {
                        height: 45px !important;
                        min-width: unset !important;
                        font-size: 16px !important;
                        text-align: left;
                        padding-left: 20px;
                        cursor: pointer;
                        transition: all 0.2s;
                        margin: 0 !important;
                    }
                    .fullscreen .btn-action.ff7-box:hover {
                        background: rgba(0, 0, 255, 0.9);
                        padding-left: 30px;
                    }
                `;
                document.head.appendChild(style);
            }
        }

        const isFullscreen = left.classList.contains('fullscreen');
        const boxClass = isFullscreen ? 'ff7-box' : '';
        const barBgClass = isFullscreen ? 'ff7-bar-bg' : '';

        uiOverlay.innerHTML = `
            <div id="arenaStage" style="position:relative; width:100%; height:100%; pointer-events:none; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                
                <!-- Header: VS Anzeige -->
                <div class="battle-vs" style="text-align:center; padding-top: ${isFullscreen ? '40px' : '20px'};">
                    <div style="font-size: ${isFullscreen ? '48px' : '32px'}; color:gold; font-weight:bold; text-shadow:0 0 15px rgba(255,215,0,0.8); letter-spacing:10px;">VS</div>
                    
                    <div style="display:flex; justify-content:center; align-items:center; gap:30px; margin-top:10px;">
                        <!-- Player Info -->
                        <div style="background:rgba(0,0,0,0.6); padding:5px 15px; border-radius:10px; border:1px solid #4ade80; color:white;">
                            <div style="font-size:12px; color:#4ade80;">DU</div>
                            <div style="font-weight:bold;">${this.player.name}</div>
                            <div style="font-size:11px; color:gold;">${this.player.evoName}</div>
                        </div>

                        <div style="color:gold; font-size:24px;">⚔️</div>

                        <!-- Opponent Info -->
                        <div style="background:rgba(0,0,0,0.6); padding:5px 15px; border-radius:10px; border:1px solid #ff4444; color:white;">
                            <div style="font-size:12px; color:#ff4444;">GEGNER</div>
                            <div style="font-weight:bold;">${this.enemy.name}</div>
                            <div style="font-size:11px; color:gold;">${this.enemy.isPvP || this.enemy.isBoss ? (window.PvPEvents?.getEvoData(this.enemy.evoLevel)?.name || '') : 'Monster'}</div>
                        </div>
                    </div>
                </div>

                <!-- Mittlerer Bereich: Leer für 3D-Modelle -->
                <div style="flex:1;"></div>

                <!-- Footer: Aktionen & Bars (FF7 Split Layout) -->
                <div class="battle-actions-container" style="padding: 0 40px 40px 40px; pointer-events:none;">
                    ${isFullscreen ? `
                        <div class="ff7-split-footer">
                            <!-- Linke Spalte: Aktionen -->
                            <div class="ff7-actions-column">
                                <button class="btn-action ff7-box" id="btn-attack" data-action="executeCombatAction" data-args='["attack"]'>⚔️ Angriff</button>
                                <button class="btn-action ff7-box" id="btn-heal" data-action="executeCombatAction" data-args='["heal"]'>✨ Heilung</button>
                                <button class="btn-action ff7-box" data-action="escapeCombat">🏃 Flucht</button>
                            </div>
                            
                            <!-- Rechte Spalte: Stats -->
                            <div class="ff7-stats-column ff7-box">
                                <!-- Enemy HP -->
                                <div style="margin-bottom:8px;">
                                    <div style="display:flex; justify-content:space-between; color:#fff; font-size:14px; margin-bottom:4px; font-weight:bold;">
                                        <span>${this.enemy.name}</span>
                                        <span id="enemyHPText">${this.enemy.hp} / ${this.enemy.maxHp} HP</span>
                                    </div>
                                    <div class="ff7-bar-bg">
                                        <div id="enemyHPBar" style="width:100%; height:100%; background:linear-gradient(90deg, #933, #f44); transition:width 0.3s ease-out;"></div>
                                    </div>
                                </div>

                                <!-- Player HP -->
                                <div style="margin-bottom:8px;">
                                    <div style="display:flex; justify-content:space-between; color:white; font-size:14px; margin-bottom:4px; font-weight:bold;">
                                        <span>${this.player.name}</span>
                                        <span id="playerHPText">${this.player.hp} / ${this.player.maxHp} HP</span>
                                    </div>
                                    <div class="ff7-bar-bg">
                                        <div id="playerHPBar" style="width:100%; height:100%; background:linear-gradient(90deg, #f44, #f66); transition:width 0.3s ease-out;"></div>
                                    </div>
                                </div>

                                <!-- Player ATB -->
                                <div>
                                    <div style="display:flex; justify-content:space-between; color:#aaa; font-size:12px; margin-bottom:4px; font-weight:bold;">
                                        <span>ATB</span>
                                    </div>
                                    <div class="ff7-bar-bg">
                                        <div id="playerATBBar" style="width:0%; height:100%; background:linear-gradient(90deg, #3366ff, #66ccff); transition:width 0.1s linear;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="battle-actions" style="display:flex; justify-content:center; gap:25px; margin-bottom:30px;">
                            <button class="btn-action" id="btn-attack" data-action="executeCombatAction" data-args='["attack"]' style="min-width:160px; height:60px; font-size:20px;">⚔️ Angriff</button>
                            <button class="btn-action" id="btn-heal" data-action="executeCombatAction" data-args='["heal"]' style="min-width:160px; height:60px; font-size:20px; background:linear-gradient(135deg, #1b4d3e, #0b2d24);">✨ Heilung</button>
                            <button class="btn-action" data-action="escapeCombat" style="min-width:160px; height:60px; font-size:20px; background:linear-gradient(135deg, #4a4a4a, #2b2b2b);">🏃 Flucht</button>
                        </div>

                        <div style="max-width:600px; margin:0 auto; background:rgba(0,0,0,0.7); padding:15px; border-radius:12px; border:1px solid rgba(255,215,0,0.3); backdrop-filter:blur(5px);">
                            <!-- Enemy HP -->
                            <div style="margin-bottom:12px;">
                                <div style="display:flex; justify-content:space-between; color:#ff6666; font-size:16px; margin-bottom:6px; font-weight:bold;">
                                    <span>${this.enemy.name}</span>
                                    <span id="enemyHPText">${this.enemy.hp} / ${this.enemy.maxHp} HP</span>
                                </div>
                                <div style="width:100%; height:12px; background:#333; border-radius:6px; overflow:hidden; border:1px solid #000;">
                                    <div id="enemyHPBar" style="width:100%; height:100%; background:linear-gradient(90deg, #993333, #ff4444); transition:width 0.3s ease-out;"></div>
                                </div>
                            </div>

                            <!-- Player HP -->
                            <div style="margin-bottom:12px;">
                                <div style="display:flex; justify-content:space-between; color:white; font-size:16px; margin-bottom:6px; font-weight:bold;">
                                    <span>${this.player.name}</span>
                                    <span id="playerHPText">${this.player.hp} / ${this.player.maxHp} HP</span>
                                </div>
                                <div style="width:100%; height:12px; background:#333; border-radius:6px; overflow:hidden; border:1px solid #000;">
                                    <div id="playerHPBar" style="width:100%; height:100%; background:linear-gradient(90deg, #ff4444, #ff6666); transition:width 0.3s ease-out;"></div>
                                </div>
                            </div>

                            <!-- Player ATB -->
                            <div>
                                <div style="display:flex; justify-content:space-between; color:#aaa; font-size:12px; margin-bottom:6px; font-weight:bold;">
                                    <span>ATB</span>
                                </div>
                                <div style="width:100%; height:8px; background:#222; border-radius:4px; overflow:hidden; border:1px solid #000;">
                                    <div id="playerATBBar" style="width:0%; height:100%; background:linear-gradient(90deg, #3366ff, #66ccff); transition:width 0.1s linear;"></div>
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            </div>`;
    },

    updateBars() {
        const pFill = document.getElementById('playerHPBar');
        const eFill = document.getElementById('enemyHPBar');
        const aFill = document.getElementById('playerATBBar');
        const pTxt = document.getElementById('playerHPText');
        const eTxt = document.getElementById('enemyHPText');

        if (pFill) pFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (eFill) eFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
        if (aFill) aFill.style.width = `${this.playerATB}%`;
        if (pTxt) pTxt.innerText = `${Math.ceil(this.player.hp)} / ${this.player.maxHp} HP`;
        if (eTxt) eTxt.innerText = `${Math.ceil(this.enemy.hp)} / ${this.enemy.maxHp} HP`;
    },

    toggleActionButtons(enabled) {
        const btnAtk = document.getElementById('btn-attack');
        const btnHeal = document.getElementById('btn-heal');
        if (btnAtk) btnAtk.disabled = !enabled;
        if (btnHeal) btnHeal.disabled = (!enabled || this.healsUsed >= this.maxHeals);
    },

    escape() {
        if (this.animationLock) return;
        this.log("Du versuchst zu fliehen...", "white");
        this.active = false;
        if (window.EventHub) { EventHub.emit('battle:escape', {}); }
        setTimeout(() => this.endCombat(), 1000);
    },

    endCombat() {
        this.active = false;
        
        // PvP-Cleanup
        if (this.enemy && this.enemy.isPvP) {
            if (window.PvPManager && window.PvPManager.active) {
                window.PvPManager.handleBattleEnd();
            }
            
            if (this.enemy.battleId && window.db) {
                const battleRef = window.db.ref('pvp_battles/' + this.enemy.battleId);
                battleRef.off(); 
                
                // Nur Host löscht den Node nach dem Kampf
                if (window.PvPManager && window.PvPManager.isHost) {
                    setTimeout(() => {
                        battleRef.remove();
                    }, 5000);
                }
            }
        }

        // Fullscreen-Modus deaktivieren
        const modalPanel = document.querySelector('#gameModal .mmo-panel');
        const modalLeft = document.getElementById('modalLeft');
        const modalSide = document.querySelector('#gameModal .panel-side');
        if (modalPanel) modalPanel.classList.remove('fullscreen');
        if (modalLeft) modalLeft.classList.remove('fullscreen');
        if (modalSide) modalSide.classList.remove('fullscreen');

        const left = document.getElementById('modalLeft');
        if (left) left.style.backgroundImage = "none";
        
        if (typeof closeGeneralModal === 'function') {
            closeGeneralModal();
        } else if (typeof toggleModal === 'function') {
            toggleModal('gameModal', false);
        } else {
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'none';
        }

        // Automatisch zum Wald zurückkehren, wenn wir dort waren
        if (this.wasInForest && window.FPWald) {
            setTimeout(() => {
                FPWald.open();
            }, 500);
        }
        this.wasInForest = false;
    }
};

/**
 * --- EVENT-SYSTEM INTEGRATION ---
 * Korrekte Anbindung an EventHub
 */
if (typeof EventHub !== 'undefined') {
    EventHub.on(EventHub.EVENTS.ENCOUNTER_START, ({ monster }) => {
        if (monster) {
            BattleEngine.startCombat(monster);
        }
    });
} else {
    console.error("❌ Battle-Meister: EventHub nicht gefunden!");
}

/** GLOBALE EXPORTS */
function executeCombatAction(type) { BattleEngine.executeAction(type); }
function escapeCombat() { BattleEngine.escape(); }
window.executeCombatAction = executeCombatAction;
window.escapeCombat = escapeCombat;
