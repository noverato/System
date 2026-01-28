/**
 * THE NEST: OVERLORD EDITION 2026
 * BATTLE ENGINE MODULE (battle.js)
 * Rolle: Battle-Meister
 * Fokus: Arena-Matchmaking, Hintergrund-Wechsel & UI-Präzision
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

    // --- ARENA MATCHMAKING (Einstiegs-Menü) ---
    renderArenaMatchmaking() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        // Hintergrund auf die Arena-Ansicht setzen
        left.style.backgroundImage = "url('./arena.png')";
        left.style.backgroundSize = "cover";
        left.style.backgroundPosition = "center";

        left.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(0,0,0,0.4); backdrop-filter:blur(2px);">
                <h2 style="color:var(--gold); font-size:42px; text-shadow:0 0 20px black;">🛡️ PvP ARENA</h2>
                <div style="background:var(--fantasy-bg); padding:30px; border:var(--border); border-radius:15px; text-align:center; box-shadow:var(--shadow);">
                    <p style="font-size:18px; margin-bottom:20px;">Wähle deine Herausforderung, Krieger!</p>
                    <button class="btn-action" style="font-size:22px; padding:15px 30px; width:100%;" onclick="startMonsterFight()">
                        ⚔️ GEGEN MONSTER KÄMPFEN
                    </button>
                    <br><br>
                    <button class="btn-action" style="width:100%; opacity:0.5;" disabled>
                        👥 PvP DUELL (Bald verfügbar)
                    </button>
                </div>
            </div>
        `;
    },

    // --- Initialisierung ---
    startCombat(enemyData, isMonster, enemyID = null) {
        console.log("⚔️ Battle-Meister: Kampf-Initialisierung...");
        this.resetState();

        // Ausrüstung prüfen
        const weaponPower = data.equipment?.weapon?.power || 0;
        const armorValue = data.equipment?.armor?.value || 0;

        // Spieler-Stats skalieren
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

        // Monster-Integration mit Emoji-Fallback
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
        this.renderArena(); // Wechselt auf arena_innen.png
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

    // --- Kampf-Logik ---
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

    calculateDamage(attacker, defender, side) {
        const variance = 0.9 + Math.random() * 0.2;
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.7));
        dmg = Math.max(1, dmg); 

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

    // --- UI Sync & Rendering ---
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
        
        // Zwingende HP-Zahlen Anzeige
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
        closeGeneralModal();
    },

    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        // --- HINTERGRUND-WECHSEL ZU INNEN ---
        left.style.backgroundImage = "url('./arena_innen.png')";
        
        const myImg = isAdmin ? 'Overlord.png' : (typeof EVO_IMGS !== 'undefined' ? EVO_IMGS[data.stats?.totalEvoLevel || 0] : 'Ei.png');
        const barTextStyle = "position:absolute; width:100%; top:0; left:0; text-align:center; color:white; font-size:11px; font-weight:bold; text-shadow: 1px 1px 2px #000; line-height:14px; pointer-events:none; z-index:5;";

        // Emoji-Fallback-Logik
        const enemyVisual = this.enemy.img.length < 4 
            ? `<div style="font-size: 100px; filter: drop-shadow(0 0 15px red);">${this.enemy.img}</div>` 
            : `<img src="${this.enemy.img}" style="width:140px; filter:drop-shadow(0 0 15px red);">`;

        left.innerHTML = `
            <div id="arenaStage" style="height:100%; display:flex; flex-direction:column; justify-content:space-between; animation: fadeIn 0.5s; padding:20px; box-sizing:border-box;">
                <div class="combat-grid" style="display:flex; justify-content:space-around; align-items:flex-end; padding-top:40px;">
                    <div class="unit" style="text-align:center;">
                        <img src="${myImg}" style="width:140px; filter:drop-shadow(0 0 15px gold);">
                        <div class="bar-container" style="position:relative; width:130px; height:14px; background:#111; border:2px solid gold; margin:10px auto; border-radius:4px; overflow:hidden;">
                            <div id="playerHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                            <div id="playerHpText" style="${barTextStyle}">- / -</div>
                        </div>
                        <div class="bar-container" style="width:130px; height:6px; background:#111; margin:5px auto; border:1px solid #555; border-radius:2px;">
                            <div id="playerAtbFill" style="height:100%; background:var(--mp-color); width:0%;"></div>
                        </div>
                        <div style="color:gold; font-weight:bold;">${this.player.name}</div>
                    </div>

                    <div style="font-size:32px; color:gold; text-shadow:0 0 10px red; font-style:italic;">VS</div>

                    <div class="unit" style="text-align:center;">
                        ${enemyVisual}
                        <div class="bar-container" style="position:relative; width:130px; height:14px; background:#111; border:2px solid #ff4444; margin:10px auto; border-radius:4px; overflow:hidden;">
                            <div id="enemyHpFill" style="height:100%; background:var(--hp-color); width:100%; transition:0.3s;"></div>
                            <div id="enemyHpText" style="${barTextStyle}">- / -</div>
                        </div>
                        <div style="color:#ff4444; font-weight:bold;">${this.enemy.name}</div>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <div id="battleLog" style="background:rgba(0,0,0,0.8); padding:15px; border-radius:8px; margin:0 40px 15px 40px; text-align:center; border:1px solid gold; font-size:20px; min-height:30px;">Bereit machen!</div>
                    <div class="ff-buttons" style="display:flex; gap:15px; justify-content:center;">
                        <button id="btnAtk" class="btn-action" onclick="BattleEngine.executeAction('attack')" style="min-width:160px;">⚔️ ANGRIFF</button>
                        <button id="btnHeal" class="btn-action" onclick="BattleEngine.executeAction('heal')" style="min-width:160px;">🧪 HEILUNG</button>
                        <button class="btn-action" onclick="BattleEngine.endCombat()" style="min-width:120px; background:#444;">🏳️ FLUCHT</button>
                    </div>
                </div>
            </div>
        `;
    }
};

/**
 * Globale Schnittstellen für HTML-Aufrufe
 */
function renderArenaMatchmaking() { BattleEngine.renderArenaMatchmaking(); }
function startMonsterFight() { BattleEngine.startCombat(null, true); }
function executeCombatAction(type) { BattleEngine.executeAction(type); }
function closeGeneralModal() { 
    const left = document.getElementById('modalLeft');
    if (left) left.style.backgroundImage = "none";
    document.getElementById('gameModal').style.display = 'none'; 
    BattleEngine.active = false; 
}
