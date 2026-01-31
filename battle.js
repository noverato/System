/**
 * THE NEST: OVERLORD EDITION 2026
 * MODUL: battle.js (Rolle: Battle-Meister)
 */

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

    startCombat(monsterData) {
        if (this.active || !monsterData) return;
        
        this.resetState();
        const weaponPower = (typeof data !== 'undefined' && data.equipment?.weapon?.power) || 0;
        const armorValue = (typeof data !== 'undefined' && data.equipment?.armor?.value) || 0;

        this.player = {
            name: (typeof data !== 'undefined' && data.name) || "Held",
            hp: (typeof data !== 'undefined' && data.hp) || 100,
            maxHp: (typeof data !== 'undefined' && data.maxHp) || 100,
            atk: ((typeof isAdmin !== 'undefined' && isAdmin) ? 999 : ((typeof data !== 'undefined' && data.stats?.atk) || 10)) + weaponPower,
            def: ((typeof data !== 'undefined' && data.stats?.def) || 5) + armorValue,
            spd: (typeof data !== 'undefined' && data.stats?.spd) || 10
        };

        this.enemy = { ...monsterData, hp: monsterData.hp, maxHp: monsterData.maxHp };
        this.active = true;
        
        if (typeof toggleModal === 'function') toggleModal('gameModal', true);
        this.renderArena();
        this.startLoop();
        this.log(`Ein wildes ${this.enemy.name} erscheint!`, "white");
        
        if (typeof EventHub !== 'undefined') {
            EventHub.emit('battle:start', { monster: this.enemy.name });
        }
    },

    resetState() {
        this.playerATB = 0;
        this.enemyATB = 0;
        this.healsUsed = 0;
        this.animationLock = false;
        this.isPaused = false;
    },

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

    executeAction(type) {
        if (!this.active || this.animationLock || this.playerATB < 100) return;
        this.animationLock = true;
        this.toggleActionButtons(false);

        if (type === 'attack') {
            const dmg = Math.max(1, this.player.atk - (this.enemy.def || 0));
            this.enemy.hp -= dmg;
            this.log(`Du triffst ${this.enemy.name} für ${dmg} Schaden!`, "gold");
            if (this.enemy.hp <= 0) {
                this.enemy.hp = 0;
                this.updateBars();
                return this.win();
            }
        } else if (type === 'heal') {
            const heal = Math.floor(this.player.maxHp * 0.3);
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this.healsUsed++;
            this.log(`Du heilst dich um ${heal} HP!`, "#4ade80");
        }

        setTimeout(() => {
            this.playerATB = 0;
            this.animationLock = false;
        }, 800);
    },

    executeEnemyTurn() {
        if (!this.active || this.animationLock) return;
        this.animationLock = true;
        const dmg = Math.max(1, (this.enemy.atk || 5) - this.player.def);
        this.player.hp -= dmg;
        this.log(`${this.enemy.name} greift an: ${dmg} Schaden!`, "#ff4444");

        if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.updateBars();
            return this.lose();
        }

        setTimeout(() => {
            this.enemyATB = 0;
            this.animationLock = false;
        }, 800);
    },

    win() {
        const reward = this.enemy.lxpReward || 50;
        this.log(`🏆 SIEG! +${reward} LXP erhalten!`, "gold");
        if (typeof data !== 'undefined') data.lxp += reward;
        
        if (typeof EventHub !== 'undefined') {
            EventHub.emit('battle:victory', { 
                monster: this.enemy.name, 
                lxp: reward,
                text: `Sieg über ${this.enemy.name}! +${reward} LXP.` 
            });
        }
        setTimeout(() => this.endCombat(), 2000);
    },

    lose() {
        this.log("💀 Du wurdest bezwungen...", "#ff4444");
        if (typeof EventHub !== 'undefined') {
            EventHub.emit('battle:defeat', { monster: this.enemy.name });
        }
        if (typeof data !== 'undefined') data.hp = data.maxHp;
        setTimeout(() => this.endCombat(), 2000);
    },

    endCombat() {
        if (!this.active) return;
        this.active = false;
        if (typeof EventHub !== 'undefined') EventHub.emit('arena:close');
        
        if (typeof closeGeneralModal === 'function') closeGeneralModal();
        else if (typeof toggleModal === 'function') toggleModal('gameModal', false);
        
        const modal = document.getElementById('gameModal');
        if (modal) modal.style.display = 'none';
        const left = document.getElementById('modalLeft');
        if (left) left.style.backgroundImage = "none";
    },

    renderArena() {
        const left = document.getElementById('modalLeft');
        if (!left) return;
        left.style.backgroundImage = "url('./arena_innen.png')";
        left.style.backgroundSize = "cover";
        const myImg = (typeof isAdmin !== 'undefined' && isAdmin) ? 'Overlord.png' : 'Ei.png';

        left.innerHTML = `
            <div id="arenaStage" style="height:100%; display:flex; flex-direction:column; justify-content:space-between; padding:20px; box-sizing:border-box;">
                <div style="display:flex; justify-content:space-around; align-items:flex-end; padding-top:40px;">
                    <div style="text-align:center;">
                        <img src="${myImg}" style="width:120px; filter:drop-shadow(0 0 10px gold);">
                        <div style="width:100px; height:10px; background:#111; border:1px solid gold; margin:5px auto;">
                            <div id="playerHpFill" style="height:100%; background:green; width:100%;"></div>
                        </div>
                        <div id="playerHpText" style="color:white; font-size:10px;"></div>
                    </div>
                    <div style="color:gold; font-size:24px;">VS</div>
                    <div style="text-align:center;">
                        <img src="${this.enemy.img}" style="width:120px; filter:drop-shadow(0 0 10px red);">
                        <div style="width:100px; height:10px; background:#111; border:1px solid red; margin:5px auto;">
                            <div id="enemyHpFill" style="height:100%; background:red; width:100%;"></div>
                        </div>
                        <div id="enemyHpText" style="color:white; font-size:10px;"></div>
                    </div>
                </div>
                <div id="battleLog" style="background:rgba(0,0,0,0.8); color:white; padding:10px; text-align:center; border:1px solid gold;"></div>
                <div style="display:flex; gap:10px; justify-content:center; padding-bottom:20px;">
                    <button id="btnAtk" onclick="BattleEngine.executeAction('attack')" style="padding:10px 20px;">⚔️ ANGRIFF</button>
                    <button id="btnHeal" onclick="BattleEngine.executeAction('heal')" style="padding:10px 20px;">🧪 HEILUNG</button>
                    <button onclick="BattleEngine.endCombat()" style="padding:10px 20px;">🏳️ FLUCHT</button>
                </div>
            </div>`;
    },

    updateBars() {
        const pFill = document.getElementById('playerHpFill');
        const eFill = document.getElementById('enemyHpFill');
        const pTxt = document.getElementById('playerHpText');
        const eTxt = document.getElementById('enemyHpText');
        if (pFill) pFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (eFill) eFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
        if (pTxt) pTxt.innerText = `${Math.ceil(this.player.hp)} HP`;
        if (eTxt) eTxt.innerText = `${Math.ceil(this.enemy.hp)} HP`;
    },

    log(msg, color) {
        const logEl = document.getElementById('battleLog');
        if (logEl) logEl.innerHTML = `<span style="color:${color}">${msg}</span>`;
    },

    toggleActionButtons(enabled) {
        const bA = document.getElementById('btnAtk');
        const bH = document.getElementById('btnHeal');
        if (bA) bA.disabled = !enabled;
        if (bH) bH.disabled = !enabled || this.healsUsed >= this.maxHeals;
    }
};

if (typeof EventHub !== 'undefined') {
    EventHub.on('encounter:start', (p) => BattleEngine.startCombat(p.monster || p));
}

window.BattleEngine = BattleEngine;
