/**
 * THE NEST: OVERLORD EDITION 2026
 * MODUL: battle.js (Rolle: Battle-Meister)
 * Fokus: Event-gesteuerter Kampfstart (Decoupled), ATB-System & Equipment-Sync
 */

const EVO_IMGS = ['Ei.png', 'Schleim.png', 'Skelett.png', 'Goblin.png', 'Oger.png', 'Lich.png', 'HoeheresWesen.png'];

const BattleEngine = {
    active: false,
    isPaused: false,
    player: null,
    enemy: null,
    playerATB: 0,
    enemyATB: 0,
    healsUsed: 0,
    maxHeals: 3,
    animationLock: false,

    // --- 1. INITIALISIERUNG ---
    startCombat(monsterData) {
        // Sicherheits-Check: Nur starten, wenn nicht aktiv und Daten vorhanden
        if (this.active || !monsterData) {
            console.warn("⚔️ Battle-Meister: Kampf-Start abgebrochen (Bereits aktiv oder keine Daten).");
            return;
        }

        console.log("⚔️ Battle-Meister: Kampf wird initialisiert. Monster:", monsterData.name);
        
        this.resetState();

        // Equipment-Check aus globalem data (Frozen Core Rule)
        const weaponPower = data.equipment?.weapon?.power || 0;
        const armorValue = data.equipment?.armor?.value || 0;

        // Lokale Spiegelung der Spieler-Stats für die Kampf-Mathematik
        this.player = {
            name: data.name || "Held",
            hp: data.hp || 100,
            maxHp: data.maxHp || 100,
            mp: data.stats?.mp || 20,
            maxMp: data.stats?.mp || 20,
            // GesamtAtk = (Basis + Waffe)
            atk: (isAdmin ? 999 : (data.stats?.atk || 10)) + weaponPower,
            // GesamtDef = (Basis + Rüstung)
            def: (data.stats?.def || 5) + armorValue,
            spd: data.stats?.spd || 10,
            lvl: data.stats?.currentLevel || 1
        };

        // Monster-Daten übernehmen
        this.enemy = {
            ...monsterData,
            hp: monsterData.hp,
            maxHp: monsterData.maxHp,
            isMonster: true
        };

        // UI-Aktivierung & State-Wechsel
        this.active = true;
        
        // Modal öffnen (via globaler Hilfsfunktion aus index.html)
        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', true);
        } else {
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'flex';
        }

        this.renderArena();
        this.startLoop();
        this.log(`Ein wildes ${this.enemy.name} erscheint!`, "white");
    },

    resetState() {
        this.playerATB = 0;
        this.enemyATB = 0;
        this.healsUsed = 0;
        this.animationLock = false;
        this.isPaused = false;
    },

    // --- 2. ATB ENGINE ---
    startLoop() {
        const tick = () => {
            if (!this.active) return; 
            
            if (!this.isPaused && !this.animationLock) {
                this.playerATB += (this.player.spd * 0.07);
                this.enemyATB += (this.enemy.spd * 0.07);
                
                this.updateBars();

                if (this.playerATB >= 100) {
                    this.playerATB = 100;
                    this.toggleActionButtons(true);
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
        
        if (this.active) {
            setTimeout(() => { this.animationLock = false; }, 600);
        }
    },

    executeEnemyTurn() {
        this.animationLock = true;
        this.toggleActionButtons(false);

        setTimeout(() => {
            if (!this.active) return;
            this.calculateDamage(this.enemy, this.player, 'enemy');
            this.enemyATB = 0;
            this.checkVictoryCondition();
            
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
        
        // Loot-Generierung via LootManager
        if (window.LootManager && typeof window.LootManager.getDrop === 'function') {
            const drop = window.LootManager.getDrop(this.enemy);
            if (drop) {
                if (!data.inventar) data.inventar = {};
                data.inventar[drop.id] = (data.inventar[drop.id] || 0) + 1;
                this.log(`🎒 Beute: ${drop.name}`, "#a855f7");
            }
        }
        
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    lose() {
        this.log("💀 Du wurdest bezwungen...", "#ff4444");
        data.hp = data.maxHp; 
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    // --- 4. UI & RENDERING ---
    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.style.backgroundImage = "url('./arena_innen.png')";
        left.style.backgroundSize = "cover";

        const myImg = isAdmin ? 'Overlord.png' : (typeof EVO_IMGS !== 'undefined' ? EVO_IMGS[data.stats?.totalEvoLevel || 0] : 'Ei.png');
        const barTextStyle = "position:absolute; width:100%; top:0; left:0; text-align:center; color:white; font-size:11px; font-weight:bold; text-shadow: 1px 1px 2px #000; line-height:14px; pointer-events:none; z-index:5;";

        const enemyVisual = this.enemy.img.length < 4 
            ? `<div style="font-size: 100px; filter: drop-shadow(0 0 15px red);">${this.enemy.img}</div>` 
            : `<img src="${this.enemy.img}" style="width:140px; filter:drop-shadow(0 0 15px red);">`;

        left.innerHTML = `            <div id="arenaStage" style="height:100%; display:flex; flex-direction:column; justify-content:space-between; animation: fadeIn 0.5s; padding:20px; box-sizing:border-box;">                 <div class="combat-grid" style="display:flex; justify-content:space-around; align-items:flex-end; padding-top:40px;">                     <div class="unit" style="text-align:center;">                         <img src="${myImg}" style="width:140px; filter:drop-shadow(0 0 15px gold);">                         <div class="bar-container" style="position:relative; width:130px; height:14px; background:#111; border:2px solid gold; margin:10px auto; border-radius:4px; overflow:hidden;">                             <div id="playerHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>                             <div id="playerHpText" style="${barTextStyle}">- / -</div>                         </div>                         <div style="color:gold; font-weight:bold; text-shadow: 1px 1px 5px #000;">${this.player.name}</div>                     </div>                     <div style="font-size:32px; color:gold; text-shadow:0 0 10px red;">VS</div>                     <div class="unit" style="text-align:center;">                         ${enemyVisual}                         <div class="bar-container" style="position:relative; width:130px; height:14px; background:#111; border:2px solid #ff4444; margin:10px auto; border-radius:4px; overflow:hidden;">                             <div id="enemyHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>                             <div id="enemyHpText" style="${barTextStyle}">- / -</div>                         </div>                         <div style="color:#ff4444; font-weight:bold;">${this.enemy.name}</div>                     </div>                 </div>                 <div style="margin-bottom:20px;">                     <div id="battleLog" style="background:rgba(0,0,0,0.8); padding:15px; border-radius:8px; margin:0 40px 15px 40px; text-align:center; border:1px solid gold; font-size:20px; color:white; min-height:40px;">Kampf beginnt!</div>                     <div class="ff-buttons" style="display:flex; gap:15px; justify-content:center;">                         <button id="btnAtk" class="btn-action" onclick="BattleEngine.executeAction('attack')" style="min-width:160px;">⚔️ ANGRIFF</button>                         <button id="btnHeal" class="btn-action" onclick="BattleEngine.executeAction('heal')" style="min-width:160px;">🧪 HEILUNG</button>                         <button class="btn-action" onclick="BattleEngine.endCombat()" style="min-width:120px; background:#444;">🏳️ FLUCHT</button>                     </div>                 </div>             </div>        `;
    },

    updateBars() {
        const pFill = document.getElementById('playerHpFill');
        const eFill = document.getElementById('enemyHpFill');
        const pTxt = document.getElementById('playerHpText');
        const eTxt = document.getElementById('enemyHpText');

        if (pFill) pFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (eFill) eFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
        if (pTxt) pTxt.innerText = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;
        if (eTxt) eTxt.innerText = `${Math.ceil(this.enemy.hp)} / ${this.enemy.maxHp}`;
    },

    log(msg, color) {
        const logEl = document.getElementById('battleLog');
        if (logEl) logEl.innerHTML = `<div style="color:${color}">${msg}</div>`;
    },

    toggleActionButtons(enabled) {
        const btnAtk = document.getElementById('btnAtk');
        const btnHeal = document.getElementById('btnHeal');
        if (btnAtk) btnAtk.disabled = !enabled;
        if (btnHeal) btnHeal.disabled = (!enabled || this.healsUsed >= this.maxHeals);
    },

    endCombat() {
        this.active = false;
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
