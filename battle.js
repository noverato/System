/**
 * THE NEST: OVERLORD EDITION 2026
 * BATTLE ENGINE MODULE (battle.js)
 * Fokus: Globale Daten-Integration, ATB-Präzision & HUD-Sync
 */

const BattleEngine = {
    // --- State Management ---
    active: false,
    isPaused: false,
    player: null,
    enemy: null,
    playerATB: 0,
    enemyATB: 0,
    healsUsed: 0,
    maxHeals: 3,
    animationLock: false,

    // --- Initialisierung ---
    startCombat(enemyData, isMonster, enemyID = null) {
        console.log("⚔️ Kampf-Modus aktiviert...");
        this.resetState();

        // Nutzt direkt das globale 'data' Objekt aus der HTML
        this.player = {
            name: data.name,
            hp: data.hp,
            maxHp: data.maxHp,
            atk: isAdmin ? 999 : (data.stats.atk || 10),
            def: data.stats.def || 5,
            spd: data.stats.spd || 10,
            lvl: data.stats.currentLevel || 1
        };

        if (isMonster) {
            const levelMod = this.player.lvl * 2;
            this.enemy = {
                name: "Waldschleim",
                hp: 50 + levelMod,
                maxHp: 50 + levelMod,
                atk: 15 + levelMod,
                def: 8,
                spd: 8,
                isMonster: true,
                img: 'Monster1.png'
            };
        } else {
            this.enemy = { 
                ...enemyData, 
                id: enemyID, 
                isMonster: false,
                spd: enemyData.stats?.spd || 10 
            };
        }

        this.active = true;
        this.renderArena();
        this.startLoop();
    },

    resetState() {
        this.playerATB = 0;
        this.enemyATB = 0;
        this.healsUsed = 0;
        this.isPaused = false;
        this.animationLock = false;
    },

    // --- ATB Engine (Tick-basiert) ---
    startLoop() {
        const tick = () => {
            if (!this.active) return; // Hardstop wenn Kampf vorbei
            if (!this.isPaused && !this.animationLock) {
                this.updateATB();
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    updateATB() {
        this.playerATB += (this.player.spd * 0.06); // ATB Rate
        this.enemyATB += (this.enemy.spd * 0.06);

        this.updateBars();

        if (this.playerATB >= 100) {
            this.playerATB = 100;
            this.toggleActionButtons(true);
        }

        if (this.enemyATB >= 100) {
            this.enemyATB = 100;
            this.executeEnemyTurn();
        }
    },

    // --- Kampf-Aktionen ---
    executeAction(type) {
        if (this.playerATB < 100 || this.animationLock) return;

        this.animationLock = true;
        this.toggleActionButtons(false);

        if (type === 'attack') {
            this.calculateDamage(this.player, this.enemy, 'player');
        } else if (type === 'heal') {
            this.executeHeal();
        }

        this.playerATB = 0;
        this.checkVictoryCondition();

        // Animation-Cooldown für flüssiges Kampfgefühl
        if (this.active) {
            setTimeout(() => { this.animationLock = false; }, 500);
        }
    },

    executeEnemyTurn() {
        this.animationLock = true;
        setTimeout(() => {
            if (!this.active) return;
            this.calculateDamage(this.enemy, this.player, 'enemy');
            this.enemyATB = 0;
            this.checkVictoryCondition();
            if (this.active) this.animationLock = false;
        }, 800);
    },

    // --- Mathematik-Kern ---
    calculateDamage(attacker, defender, side) {
        const isCrit = Math.random() < 0.15;
        const variance = 0.9 + Math.random() * 0.2;
        
        // Mindestschaden Garantie: Math.max(1, ...)
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.5));
        dmg = Math.max(1, dmg); 

        if (isCrit) {
            dmg = Math.floor(dmg * 1.5);
            this.log(`💥 KRITISCH! ${attacker.name} schlägt heftig zu!`, 'gold');
        }

        defender.hp -= dmg;
        
        // Direkter Sync mit dem globalen data-Objekt bei Schaden
        if (side === 'enemy') data.hp = this.player.hp;

        this.log(`${attacker.name} trifft für ${dmg} Schaden!`, side === 'player' ? '#4ade80' : '#ff4444');
        this.updateBars();
    },

    executeHeal() {
        if (this.healsUsed >= this.maxHeals) return;
        const healAmt = Math.floor(this.player.maxHp * 0.3);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        
        // Globaler Sync
        data.hp = this.player.hp;
        this.healsUsed++;
        
        this.log(`✨ Heilung! +${healAmt} HP`, 'cyan');
        this.updateBars();
    },

    // --- Sieg & Belohnungs-Logik ---
    checkVictoryCondition() {
        if (this.enemy.hp <= 0) {
            this.active = false; // ATB Loop Stop
            this.win();
        } else if (this.player.hp <= 0) {
            this.active = false; // ATB Loop Stop
            this.lose();
        }
    },

    win() {
        this.log("🏆 SIEG! Du stehst siegreich auf dem Schlachtfeld.", "gold");
        
        // Belohnung direkt in globales data schreiben
        data.lxp += 50;

        // Schatzmeister-Link (loot.js)
        if (typeof processLootDrop === 'function') {
            const drop = processLootDrop(); 
            if (drop) {
                // Item in das globale Inventar legen
                const itemKey = drop.name;
                data.inventar[itemKey] = (data.inventar[itemKey] || 0) + 1;
                this.log(`Beute erhalten: ${drop.name}`, "#a855f7");
            }
        }

        // HUD Update sofort ausführen
        if (typeof updateUI === 'function') updateUI();
        
        setTimeout(() => this.endCombat(), 2000);
    },

    lose() {
        this.log("💀 Du wurdest bezwungen...", "#ff4444");
        data.hp = data.maxHp; 
        if (typeof updateUI === 'function') updateUI();
        setTimeout(() => this.endCombat(), 2000);
    },

    // --- UI & Sync ---
    log(msg, color) {
        const logEl = document.getElementById('battleLog');
        if (logEl) logEl.innerHTML = `<div style="color:${color}">${msg}</div>`;
    },

    updateBars() {
        const pFill = document.getElementById('playerHpFill');
        const eFill = document.getElementById('enemyHpFill');
        const pAtbFill = document.getElementById('playerAtbFill');

        if (pFill) pFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (eFill) eFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
        if (pAtbFill) pAtbFill.style.width = `${this.playerATB}%`;
    },

    toggleActionButtons(enabled) {
        const btnAtk = document.getElementById('btnAtk');
        const btnHeal = document.getElementById('btnHeal');
        if (btnAtk) btnAtk.disabled = !enabled;
        if (btnHeal) btnHeal.disabled = (!enabled || this.healsUsed >= this.maxHeals);
    },

    endCombat() {
        this.active = false;
        if (typeof toggleModal === 'function') {
            // Hier nutzen wir die Schließen-Logik deiner HTML
            closeGeneralModal(); 
        } else {
            document.getElementById('gameModal').style.display = 'none';
        }
        
        // Finaler HUD Sync und Save
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
    },

    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.innerHTML = `
            <div id="arenaStage" style="user-select:none;">
                <div class="combat-grid" style="display:flex; justify-content:space-around; padding:20px;">
                    <div class="unit">
                        <img src="${isAdmin ? 'Overlord.png' : 'Hero.png'}" style="width:120px; filter:drop-shadow(0 0 10px gold);">
                        <div class="bar-container" style="width:120px; height:10px; background:#111; border:1px solid #333; margin:10px 0;">
                            <div id="playerHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                        </div>
                        <div class="bar-container" style="width:120px; height:5px; background:#111; margin:5px 0;">
                            <div id="playerAtbFill" style="height:100%; background:var(--mp-color); width:0%;"></div>
                        </div>
                        <div style="color:gold; font-weight:bold;">${this.player.name}</div>
                    </div>
                    
                    <div style="align-self:center; font-size:24px; color:gold; font-style:italic;">VS</div>

                    <div class="unit">
                        <img src="${this.enemy.img}" style="width:120px; filter:drop-shadow(0 0 10px red);">
                        <div class="bar-container" style="width:120px; height:10px; background:#111; border:1px solid #333; margin:10px 0;">
                            <div id="enemyHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                        </div>
                        <div style="color:#ff4444; font-weight:bold;">${this.enemy.name}</div>
                    </div>
                </div>
                
                <div id="battleLog" style="background:rgba(0,0,0,0.5); padding:15px; border-radius:10px; margin:10px; height:50px; text-align:center; border:1px inset gold;">
                    Bereit machen zum Kampf...
                </div>

                <div class="ff-buttons" style="display:flex; gap:10px; justify-content:center; padding:10px;">
                    <button id="btnAtk" class="btn-action" onclick="BattleEngine.executeAction('attack')">⚔️ ANGRIFF</button>
                    <button id="btnHeal" class="btn-action" onclick="BattleEngine.executeAction('heal')">🧪 HEILUNG</button>
                    <button class="btn-action" onclick="BattleEngine.endCombat()" style="background:linear-gradient(135deg, #444, #222);">🏳️ FLUCHT</button>
                </div>
            </div>
        `;
    }
};

/**
 * Hilfsfunktionen für den globalen Zugriff
 */
function startCombat(enemy, isMonster, id) { BattleEngine.startCombat(enemy, isMonster, id); }
function closeGeneralModal() { document.getElementById('gameModal').style.display = 'none'; BattleEngine.active = false; }
