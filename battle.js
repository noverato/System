/**
 * THE NEST: OVERLORD EDITION 2026
 * BATTLE ENGINE MODULE (battle.js)
 * Rolle: Battle-Meister
 * Fokus: Emoji-Fallback-Logik, Arena-Hintergrund & ATB-Präzision
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
        console.log("⚔️ Battle-Meister: Kampf-Initialisierung...");
        this.resetState();

        const weaponPower = data.equipment?.weapon?.power || 0;
        const armorValue = data.equipment?.armor?.value || 0;

        this.player = {
            name: data.name,
            hp: data.hp,
            maxHp: data.maxHp,
            mp: data.stats.mp || 20,
            maxMp: data.stats.mp || 20,
            atk: (isAdmin ? 999 : (data.stats.atk || 10)) + weaponPower,
            def: (data.stats.def || 5) + armorValue,
            spd: data.stats.spd || 10,
            lvl: data.stats.currentLevel || 1
        };

        if (isMonster) {
            if (typeof MonsterLibrary !== 'undefined') {
                this.enemy = MonsterLibrary.generateMonster(this.player.lvl);
                this.enemy.isMonster = true; 
            } else {
                this.enemy = { name: "Fehler-Schleim", hp: 50, maxHp: 50, atk: 10, def: 5, spd: 5, lxpReward: 10, img: '💧', isMonster: true };
            }
        } else {
            this.enemy = { ...enemyData, id: enemyID, isMonster: false, spd: enemyData.stats?.spd || 10, lxpReward: 100 };
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

    // --- ATB Engine ---
    startLoop() {
        const tick = () => {
            if (!this.active) return; 
            if (!this.isPaused && !this.animationLock) {
                this.updateATB();
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    updateATB() {
        this.playerATB += (this.player.spd * 0.06);
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

    // --- Aktionen ---
    executeAction(type) {
        if (this.playerATB < 100 || this.animationLock) return;
        this.animationLock = true;
        this.toggleActionButtons(false);

        if (type === 'attack') this.calculateDamage(this.player, this.enemy, 'player');
        else if (type === 'heal') this.executeHeal();

        this.playerATB = 0;
        this.checkVictoryCondition();
        if (this.active) setTimeout(() => { this.animationLock = false; }, 500);
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

    // --- Mathematik ---
    calculateDamage(attacker, defender, side, attackType = 'physical') {
        const isCrit = Math.random() < 0.15;
        const variance = 0.9 + Math.random() * 0.2;
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.7));

        if (attackType === 'fire' && defender.name.includes("Brennend")) dmg = Math.floor(dmg * 0.8);
        dmg = Math.max(1, dmg); 

        if (isCrit) {
            dmg = Math.floor(dmg * 1.5);
            this.log(`💥 KRITISCH!`, 'gold');
        }

        defender.hp -= dmg;
        if (side === 'enemy') data.hp = this.player.hp;

        this.log(`${attacker.name}: -${dmg} HP`, side === 'player' ? '#4ade80' : '#ff4444');
        this.updateBars();
    },

    executeHeal() {
        if (this.healsUsed >= this.maxHeals) return;
        const healAmt = Math.floor(this.player.maxHp * 0.3);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        data.hp = this.player.hp;
        this.healsUsed++;
        this.log(`✨ Heilung! +${healAmt} HP`, 'cyan');
        this.updateBars();
    },

    checkVictoryCondition() {
        if (this.enemy.hp <= 0) { this.enemy.hp = 0; this.active = false; this.win(); }
        else if (this.player.hp <= 0) { this.player.hp = 0; this.active = false; this.lose(); }
    },

    win() {
        const reward = this.enemy.lxpReward || 50;
        this.log(`🏆 SIEG! +${reward} LXP`, "gold");
        data.lxp += reward;
        if (typeof processLootDrop === 'function') {
            const drop = processLootDrop(); 
            if (drop) {
                const itemKey = drop.name;
                data.inventar[itemKey] = (data.inventar[itemKey] || 0) + 1;
                this.log(`🎒 Beute: ${drop.name}`, "#a855f7");
            }
        }
        if (typeof updateUI === 'function') updateUI();
        setTimeout(() => this.endCombat(), 2000);
    },

    lose() {
        this.log("💀 Gefallen...", "#ff4444");
        data.hp = data.maxHp; 
        if (typeof updateUI === 'function') updateUI();
        setTimeout(() => this.endCombat(), 2000);
    },

    log(msg, color) {
        const logEl = document.getElementById('battleLog');
        if (logEl) logEl.innerHTML = `<div style="color:${color}">${msg}</div>`;
    },

    updateBars() {
        const pFill = document.getElementById('playerHpFill');
        const eFill = document.getElementById('enemyHpFill');
        const pAtbFill = document.getElementById('playerAtbFill');
        const pTxt = document.getElementById('playerHpText');
        const eTxt = document.getElementById('enemyHpText');

        if (pFill) pFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (eFill) eFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
        if (pAtbFill) pAtbFill.style.width = `${this.playerATB}%`;
        if (pTxt) pTxt.innerText = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;
        if (eTxt) eTxt.innerText = `${Math.ceil(this.enemy.hp)} / ${this.enemy.maxHp}`;
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
        if (typeof closeGeneralModal === 'function') closeGeneralModal(); 
        else document.getElementById('gameModal').style.display = 'none';
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
    },

    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.style.backgroundImage = "url('./arena_innen.png')";
        left.style.backgroundSize = "cover";
        left.style.backgroundPosition = "center";

        const myImg = isAdmin ? 'Overlord.png' : (typeof EVO_IMGS !== 'undefined' ? EVO_IMGS[data.stats?.totalEvoLevel || 0] : 'Ei.png');
        const barTextStyle = "position:absolute; width:100%; top:0; left:0; text-align:center; color:white; font-size:10px; font-weight:bold; text-shadow: 1px 1px 2px #000; line-height:12px; pointer-events:none;";

        // --- DER EMOJI-TRICK ---
        const enemyVisual = this.enemy.img.length < 4 
            ? `<div style="font-size: 100px; text-align: center; filter: drop-shadow(0 0 15px red);">${this.enemy.img}</div>` 
            : `<img src="${this.enemy.img}" style="width:140px; filter:drop-shadow(0 0 15px red);">`;

        left.innerHTML = `
            <div id="arenaStage" style="user-select:none; height:100%; display:flex; flex-direction:column; justify-content:space-between; animation: fadeIn 0.5s;">
                <div class="combat-grid" style="display:flex; justify-content:space-around; align-items:flex-end; padding:40px 20px;">
                    <div class="unit">
                        <img src="${myImg}" style="width:140px; filter:drop-shadow(0 0 15px gold);">
                        <div class="bar-container" style="position:relative; width:120px; height:12px; background:#111; border:2px solid gold; margin:10px auto; overflow:hidden;">
                            <div id="playerHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                            <div id="playerHpText" style="${barTextStyle}">0 / 0</div>
                        </div>
                        <div class="bar-container" style="width:120px; height:6px; background:#111; margin:2px auto; border:1px solid #555;">
                            <div id="playerAtbFill" style="height:100%; background:var(--mp-color); width:0%;"></div>
                        </div>
                        <div style="color:gold; font-weight:bold; text-align:center; text-shadow: 2px 2px 4px #000;">${this.player.name}</div>
                    </div>

                    <div class="unit">
                        ${enemyVisual}
                        <div class="bar-container" style="position:relative; width:120px; height:12px; background:#111; border:2px solid #ff4444; margin:10px auto; overflow:hidden;">
                            <div id="enemyHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                            <div id="enemyHpText" style="${barTextStyle}">0 / 0</div>
                        </div>
                        <div style="color:#ff4444; font-weight:bold; text-align:center; text-shadow: 2px 2px 4px #000;">${this.enemy.name}</div>
                    </div>
                </div>

                <div style="padding-bottom:30px;">
                    <div id="battleLog" style="background:rgba(0,0,0,0.8); padding:10px; border-radius:8px; margin:0 40px 15px 40px; text-align:center; border:1px solid gold; font-size:20px; color:white; min-height:30px;">Kampf beginnt!</div>
                    <div class="ff-buttons" style="display:flex; gap:15px; justify-content:center;">
                        <button id="btnAtk" class="btn-action" onclick="BattleEngine.executeAction('attack')" style="min-width:160px; font-size:18px;">⚔️ ANGRIFF</button>
                        <button id="btnHeal" class="btn-action" onclick="BattleEngine.executeAction('heal')" style="min-width:160px; font-size:18px;">🧪 HEILUNG</button>
                        <button class="btn-action" onclick="BattleEngine.endCombat()" style="min-width:120px; background:linear-gradient(135deg, #444, #222);">🏳️ FLUCHT</button>
                    </div>
                </div>
            </div>
        `;
    }
};

function startMonsterFight() {
    BattleEngine.startCombat(null, true);
}

function startCombat(enemy, isMonster, id) { BattleEngine.startCombat(enemy, isMonster, id); }
function executeCombatAction(type) { BattleEngine.executeAction(type); }
function closeGeneralModal() { 
    const left = document.getElementById('modalLeft');
    if (left) left.style.backgroundImage = "none";
    document.getElementById('gameModal').style.display = 'none'; 
    BattleEngine.active = false; 
}
