/**
 * THE NEST: OVERLORD EDITION 2026
 * BATTLE ENGINE MODULE (battle.js)
 * "Der Rhythmus des Schmerzes" - Professional ATB System
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
        console.log("⚔️ Kampf initiiert...");
        this.resetState();

        // Spieler-Daten spiegeln
        this.player = {
            name: data.name,
            hp: data.hp,
            maxHp: data.maxHp,
            atk: isAdmin ? 999 : (data.stats.atk || 10),
            def: data.stats.def || 5,
            spd: data.stats.spd || 10,
            lvl: data.stats.currentLevel || 1
        };

        // Gegner-Setup
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

    // --- ATB Heartbeat ---
    startLoop() {
        const tick = () => {
            if (!this.active) return; // Loop-Hardstop
            if (!this.isPaused && !this.animationLock) {
                this.updateATB();
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    updateATB() {
        this.playerATB += (this.player.spd * 0.05);
        this.enemyATB += (this.enemy.spd * 0.05);

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

        // Animation-Reset: Kurze Verzögerung für das "Treffer-Gefühl"
        if (this.active) {
            setTimeout(() => {
                this.animationLock = false;
            }, 500);
        }
    },

    executeEnemyTurn() {
        this.animationLock = true;
        
        setTimeout(() => {
            if (!this.active) return;
            this.calculateDamage(this.enemy, this.player, 'enemy');
            this.enemyATB = 0;
            this.checkVictoryCondition();
            
            // Lock nur aufheben, wenn Kampf weitergeht
            if (this.active) this.animationLock = false;
        }, 800);
    },

    // --- Mathematik & Schadenslogik ---
    calculateDamage(attacker, defender, side) {
        const isCrit = Math.random() < 0.15;
        const variance = 0.9 + Math.random() * 0.2;
        
        // Formel mit Mindestschaden-Garantie (Math.max(1, dmg))
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.5));
        dmg = Math.max(1, dmg); 

        if (isCrit) {
            dmg = Math.floor(dmg * 1.5);
            this.log(`💥 KRITISCH! ${attacker.name} trifft hart!`, 'gold');
        }

        defender.hp -= dmg;
        if (side === 'enemy') data.hp = this.player.hp;

        this.log(`${attacker.name} verursacht ${dmg} Schaden!`, side === 'player' ? '#4ade80' : '#ff4444');
        this.updateBars();
    },

    executeHeal() {
        if (this.healsUsed >= this.maxHeals) return;
        
        const healAmt = Math.floor(this.player.maxHp * 0.3);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        data.hp = this.player.hp;
        this.healsUsed++;
        
        this.log(`✨ Heilung! +${healAmt} HP`, 'cyan');
    },

    // --- Sieg / Niederlage & Hardstop ---
    checkVictoryCondition() {
        if (this.enemy.hp <= 0) {
            this.active = false; // SOFORTIGER STOPP
            this.win();
        } else if (this.player.hp <= 0) {
            this.active = false; // SOFORTIGER STOPP
            this.lose();
        }
    },

    win() {
        this.log("🏆 SIEG! Du hast das Monster zerschmettert.", "gold");
        
        if (typeof processLootDrop === 'function') {
            const drop = processLootDrop(); 
            if (drop) this.log(`Beute: ${drop.name}`, "#a855f7");
        }

        data.lxp += 50;
        setTimeout(() => this.endCombat(), 2000);
    },

    lose() {
        alert("Gefallen im Kampf...");
        data.hp = data.maxHp; 
        this.endCombat();
    },

    // --- UI & Rendering ---
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
        toggleModal('gameModal', false);
        if (typeof save === 'function') save();
    },

    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.innerHTML = `
            <div id="arenaStage">
                <div class="combat-grid" style="display:flex; justify-content:space-around; align-items:center; text-align:center;">
                    <div class="unit">
                        <img src="${isAdmin ? 'Overlord.png' : 'Hero.png'}" class="combatant-img" style="width:80px;">
                        <div class="bar-container" style="width:100px; height:8px; background:#222; margin:5px auto;"><div id="playerHpFill" style="height:100%; background:#4ade80; transition:0.3s;"></div></div>
                        <div class="bar-container" style="width:100px; height:4px; background:#222; margin:2px auto;"><div id="playerAtbFill" style="height:100%; background:#3b82f6; width:0%;"></div></div>
                        <strong style="font-size:12px;">${this.player.name}</strong>
                    </div>
                    <div class="unit">
                        <img src="${this.enemy.img}" class="combatant-img" style="width:80px;">
                        <div class="bar-container" style="width:100px; height:8px; background:#222; margin:5px auto;"><div id="enemyHpFill" style="height:100%; background:#ef4444; transition:0.3s;"></div></div>
                        <strong style="font-size:12px;">${this.enemy.name}</strong>
                    </div>
                </div>
                <div id="battleLog" style="height:40px; margin-top:10px; font-size:14px; text-shadow:1px 1px #000;">Kampf beginnt...</div>
                <div class="ff-buttons" style="margin-top:10px; display:flex; gap:5px; justify-content:center;">
                    <button id="btnAtk" class="btn-action" onclick="BattleEngine.executeAction('attack')">ANGRIFF</button>
                    <button id="btnHeal" class="btn-action" onclick="BattleEngine.executeAction('heal')">HEILUNG</button>
                    <button class="btn-action" onclick="BattleEngine.endCombat()">FLUCHT</button>
                </div>
            </div>
        `;
    }
};

// Aliases für HTML-Aufrufe
function startCombat(enemy, isMonster, id) { BattleEngine.startCombat(enemy, isMonster, id); }
function executeCombatAction(type) { BattleEngine.executeAction(type); }
function endCombat() { BattleEngine.endCombat(); }
