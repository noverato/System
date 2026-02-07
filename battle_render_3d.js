(() => {
    let scene = null;
    let camera = null;
    let renderer = null;
    let anim = null;
    let host = null;
    let shaking = 0;
    let playerGroup = null;
    let enemyGroup = null;
    let actionTimer = 0;
    let actionActor = null;
    let bursts = [];
    let audioCtx = null;
    function onResize() {
        if (!host || !renderer || !camera) return;
        const nw = host.clientWidth;
        const nh = host.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
    }
    function audioLevel() {
        const s = window.AudioSettings || { muted: false, volume: 0.8 };
        return s.muted ? 0 : Math.max(0, Math.min(1, s.volume || 0.8));
    }
    // --- KAMERA & PERSPEKTIVE EINSTELLUNGEN ---
    // Hier kannst du die Ansicht anpassen, falls das Ei den Gegner verdeckt
    const CAM = { 
        idleYaw: 0, 
        actionDist: 15, 
        idleDist: 26,    // ABSTAND: Größer = weiter weg (Standard: 26)
        height: 8.5,     // HÖHE: Größer = weiter oben (Standard: 8.5)
        pitch: -0.42,    // NEIGUNG: Steiler nach unten (Standard: -0.42)
        offsetX: 3.2     // SEITLICH: Höher = mehr Schulterblick rechts (Standard: 3.2)
    };

    // --- WAFFEN-KONFIGURATION KAMPF ---
    let bWeaponOffsetX = -0.6;  
    let bWeaponOffsetY = 0.2;   
    let bWeaponOffsetZ = 0.4;   
    let bWeaponScale   = 0.6;  
    let bWeaponRotDeg  = 30;    
    function ensureThree() {
        if (window.THREE) return Promise.resolve(true);
        return new Promise(resolve => {
            const el = document.createElement('script');
            el.src = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';
            el.onload = () => resolve(true);
            el.onerror = () => resolve(false);
            document.head.appendChild(el);
        });
    }
    function createTransition(type = 'swirl') {
        const overlay = document.createElement('div');
        overlay.id = 'battle-transition';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        overlay.style.background = 'radial-gradient(circle at 50% 50%, rgba(20,35,50,0.0) 0%, rgba(14,31,46,0.8) 55%, rgba(10,20,30,1) 100%)';
        const styleEl = document.createElement('style');
        styleEl.textContent = `@keyframes swirlIn { 0% { transform: scale(0.2) rotate(0deg); opacity: 0; } 50% { transform: scale(1.1) rotate(120deg); opacity: 0.9; } 100% { transform: scale(1.0) rotate(180deg); opacity: 0.8; } } @keyframes fadeOut { 0% { opacity: 0.8; } 100% { opacity: 0; } }`;
        document.head.appendChild(styleEl);
        overlay.style.transformOrigin = '50% 50%';
        overlay.style.animation = 'swirlIn 600ms ease-out forwards';
        document.body.appendChild(overlay);
        return overlay;
    }
    function hideTransition() {
        const el = document.getElementById('battle-transition');
        if (!el) return;
        el.style.animation = 'fadeOut 500ms ease-in forwards';
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 520);
    }
    function exitTransition() {
        const overlay = document.createElement('div');
        overlay.id = 'battle-exit';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        overlay.style.background = 'radial-gradient(circle at 50% 50%, rgba(10,20,30,1) 0%, rgba(14,31,46,0.8) 60%, rgba(20,35,50,0.0) 100%)';
        const styleEl = document.createElement('style');
        styleEl.textContent = `@keyframes exitFade { 0% { opacity: 0; } 30% { opacity: 0.9; } 100% { opacity: 0; } }`;
        document.head.appendChild(styleEl);
        overlay.style.animation = 'exitFade 700ms ease-in-out forwards';
        document.body.appendChild(overlay);
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 740);
    }
    let isMounting = false;
    function mount() {
        if (isMounting) return false;
        if (renderer && scene) {
            console.log("⚠️ BattleRenderer3D: Bereits aktiv, spawne nur Einheiten neu...");
            spawnUnits();
            return true;
        }
        isMounting = true;
        
        console.log("🏗️ BattleRenderer3D: Mounting...");
        host = document.getElementById('modalLeft');
        if (!host) {
            console.error("❌ BattleRenderer3D: modalLeft nicht gefunden!");
            isMounting = false;
            return false;
        }
        if (!window.THREE) {
            console.error("❌ BattleRenderer3D: THREE.js nicht geladen!");
            isMounting = false;
            return false;
        }
        
        // Renderer-Cleanup & DOM-Bereinigung
        if (renderer) {
            console.log("🧹 BattleRenderer3D: Altes Renderer-Cleanup");
            if (renderer.domElement && renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
            renderer.dispose();
        }
        
        // Sicherstellen, dass keine alten Canvas-Leichen im Host sind
        const oldCanvases = host.querySelectorAll('canvas');
        oldCanvases.forEach(c => c.remove());

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0e1f2e);
        scene.fog = new THREE.FogExp2(0x0e1f2e, 0.008); 
        
        const w = host.clientWidth || 900;
        const h = host.clientHeight || 600;
        camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        const pr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h);
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.zIndex = '0';
        renderer.domElement.style.pointerEvents = 'none';
        
        host.appendChild(renderer.domElement);
        
        const amb = new THREE.AmbientLight(0xffffff, 0.6); 
        scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 1.0); 
        dir.position.set(12, 20, 8);
        scene.add(dir);
        
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(40, 24, 1, 1),
            new THREE.MeshLambertMaterial({ color: 0x1b2b38 })
        );
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        
        const railGeo = new THREE.BoxGeometry(38, 0.6, 0.6);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x203040 });
        const rail1 = new THREE.Mesh(railGeo, railMat);
        rail1.position.set(0, 0.31, -4);
        const rail2 = rail1.clone();
        rail2.position.z = 4;
        scene.add(rail1);
        scene.add(rail2);
        
        camera.position.set(0, CAM.height, CAM.idleDist);
        camera.rotation.x = CAM.pitch;

        console.log("✅ BattleRenderer3D: Mount abgeschlossen.");
        isMounting = false;

        // Wenn der Kampf bereits läuft, Einheiten sofort spawnen
        if (window.BattleEngine && window.BattleEngine.active) {
            console.log("⚔️ BattleEngine aktiv, spawne Einheiten direkt...");
            setTimeout(() => spawnUnits(), 50);
        }
        
        window.addEventListener('resize', onResize);
        function loop() {
            if (!renderer || !scene || !camera) return;
            anim = requestAnimationFrame(loop);
            
            // ... rest of loop ...
            
            // Over-the-Shoulder Perspektive
            const targetPosZ = enemyGroup ? enemyGroup.position.z : -10;
            camera.position.set(CAM.offsetX, CAM.height, CAM.idleDist);
            camera.lookAt(0, 1.8, targetPosZ);

            if (shaking > 0) {
                camera.position.x += (Math.random() - 0.5) * shaking;
                camera.position.y += (Math.random() - 0.5) * shaking * 0.5;
                shaking *= 0.9;
            }
            const t = Date.now() * 0.002;
            if (playerGroup) playerGroup.position.y = Math.sin(t) * 0.1;
            if (enemyGroup) enemyGroup.position.y = Math.cos(t) * 0.15;
            
            // Billboarding: Monster schaut immer die Kamera an
            if (enemyGroup) {
                enemyGroup.lookAt(camera.position.x, enemyGroup.position.y, camera.position.z);
            }
            // Spieler schaut zum Monster (Z-Achse)
            if (playerGroup && enemyGroup) {
                playerGroup.lookAt(enemyGroup.position.x, playerGroup.position.y, enemyGroup.position.z);
            }

            if (actionTimer > 0 && actionActor) {
                const g = actionActor === 'player' ? playerGroup : enemyGroup;
                const dir = actionActor === 'player' ? -1 : 1; 
                const phase = Math.min(1, actionTimer / 300);
                const dash = Math.sin(phase * Math.PI) * 10 * dir;
                
                if (g) {
                    g.position.z = (actionActor === 'player' ? 10 : -10) + dash;
                }
                
                if (g && Math.random() < 0.2) {
                    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xbdd9ff, opacity: 0.7 }));
                    sp.scale.set(2.5, 2.5, 1);
                    sp.position.copy(g.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
                    scene.add(sp);
                    bursts.push({ sp, life: 180, max: 180, dir: new THREE.Vector3(0, 0.01, -0.02 * dir) });
                }
                actionTimer -= 16;
                if (actionTimer <= 0) { 
                    actionActor = null; 
                    if (playerGroup) playerGroup.position.z = 10; 
                    if (enemyGroup) enemyGroup.position.z = -10; 
                }
            }
            if (bursts.length) {
                for (let i = bursts.length - 1; i >= 0; i--) {
                    const b = bursts[i];
                    b.life -= 16;
                    if (b.sp) {
                        const p = 1 - Math.max(0, b.life) / b.max;
                        b.sp.material.opacity = 0.9 * (1 - p);
                        b.sp.scale.set(6 + p * 8, 6 + p * 8, 1);
                        b.sp.position.add(b.dir);
                    }
                    if (b.life <= 0) {
                        if (b.sp && scene) scene.remove(b.sp);
                        bursts.splice(i, 1);
                    }
                }
            }
            renderer.render(scene, camera);
        }
        loop();
        isMounting = false;
        return true;
    }
    function unmount() {
        isMounting = false;
        window.removeEventListener('resize', onResize);
        if (anim) cancelAnimationFrame(anim);
        anim = null;
        if (renderer) renderer.dispose();
        renderer = null;
        scene = null;
        camera = null;
        if (host) host.innerHTML = '';
        host = null;
    }
    function actionFocus(side) {
        // Bei Fokus-Aktion (Angriff) lassen wir die Kamera fest, 
        // da die Charaktere sich jetzt auf der Z-Achse aufeinander zu bewegen.
        actionActor = side;
        actionTimer = 300;
    }
    function idleCam() {
        if (!camera) return;
        camera.position.set(CAM.offsetX, CAM.height, CAM.idleDist);
        camera.lookAt(0, 2, 0);
    }
    function impact(side) { shaking = 0.8; spawnBurst(side); playImpact(side); }
    function spawnUnits() {
        console.log("🎲 BattleRenderer3D: spawnUnits aufgerufen. Scene vorhanden:", !!scene);
        if (!scene) return;

        // Cleanup alter Einheiten falls vorhanden
        if (playerGroup) {
            scene.remove(playerGroup);
            playerGroup = null;
        }
        if (enemyGroup) {
            scene.remove(enemyGroup);
            enemyGroup = null;
        }

        playerGroup = makeUnit('player');
        enemyGroup = makeUnit('enemy');
        
        if (playerGroup) {
            playerGroup.position.set(0, 0, 10);
            scene.add(playerGroup);
        }
        if (enemyGroup) {
            enemyGroup.position.set(0, 0, -10);
            scene.add(enemyGroup);
        }
        console.log("👥 Einheiten gespawnt:", { player: !!playerGroup, enemy: !!enemyGroup });
    }
    function start() {
        createTransition('swirl');
        ensureThree().then(() => { mount(); });
    }
    function stop() { unmount(); }
    function spawnBurst(side) {
        if (!scene) return;
        const target = side === 'enemy' ? playerGroup : enemyGroup;
        if (!target) return;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: side === 'enemy' ? 0xff6666 : 0x66ff88, opacity: 0.9 }));
        sp.scale.set(6, 6, 1);
        sp.position.copy(target.position.clone().add(new THREE.Vector3(0, 2.5, 0)));
        scene.add(sp);
        const dirs = [
            new THREE.Vector3(0.06, 0.02, 0),
            new THREE.Vector3(-0.05, 0.03, 0),
            new THREE.Vector3(0.02, 0.05, 0),
            new THREE.Vector3(-0.03, 0.02, 0)
        ];
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        bursts.push({ sp, life: 260, max: 260, dir: d });
    }
    function playImpact(side) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = side === 'enemy' ? 'square' : 'sawtooth';
            osc.frequency.value = side === 'enemy' ? 240 : 320;
            const lv = audioLevel();
            gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.12 * lv, audioCtx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
        } catch {}
    }
    function healBurst(side) {
        if (!scene) return;
        const target = side === 'player' ? playerGroup : enemyGroup;
        if (!target) return;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x66c2ff, opacity: 0.9 }));
        sp.scale.set(5, 5, 1);
        sp.position.copy(target.position.clone().add(new THREE.Vector3(0, 2.5, 0)));
        scene.add(sp);
        bursts.push({ sp, life: 300, max: 300, dir: new THREE.Vector3(0, 0.04, 0) });
    }
    function playHeal(side) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = 480;
            const lv = audioLevel();
            gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1 * lv, audioCtx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.26);
        } catch {}
    }
    function playBeep(side) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 600;
            const lv = audioLevel();
            gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08 * lv, audioCtx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.16);
        } catch {}
    }
    function ensureAudioOverlay() {
        const left = document.getElementById('modalLeft');
        if (!left) return;
        if (!window.AudioSettings) window.AudioSettings = { muted: false, volume: 0.8 };
        let box = document.getElementById('audio-ctrl');
        if (box) return;
        box = document.createElement('div');
        box.id = 'audio-ctrl';
        box.style.position = 'absolute';
        box.style.top = '10px';
        box.style.right = '10px';
        box.style.display = 'flex';
        box.style.gap = '8px';
        box.style.alignItems = 'center';
        box.style.background = 'rgba(0,0,0,0.4)';
        box.style.border = '1px solid gold';
        box.style.padding = '6px 8px';
        box.style.borderRadius = '6px';
        const muteBtn = document.createElement('button');
        muteBtn.className = 'btn-action';
        muteBtn.textContent = window.AudioSettings.muted ? '🔇' : '🔊';
        const vol = document.createElement('input');
        vol.type = 'range';
        vol.min = '0'; vol.max = '100'; vol.value = String(Math.floor((window.AudioSettings.volume || 0.8) * 100));
        vol.style.width = '120px';
        muteBtn.onclick = () => { window.AudioSettings.muted = !window.AudioSettings.muted; muteBtn.textContent = window.AudioSettings.muted ? '🔇' : '🔊'; };
        vol.oninput = () => { const v = Math.max(0, Math.min(1, Number(vol.value) / 100)); window.AudioSettings.volume = v; };
        box.appendChild(muteBtn);
        box.appendChild(vol);
        left.appendChild(box);
    }
    function spawnVictorySparkles() {
        if (!scene) return;
        const N = 14;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd700, opacity: 0.95 }));
            sp.scale.set(3.5, 3.5, 1);
            sp.position.set(Math.cos(a) * 3, 2.2, Math.sin(a) * 2);
            scene.add(sp);
            bursts.push({ sp, life: 500, max: 500, dir: new THREE.Vector3(Math.cos(a) * 0.02, 0.03, Math.sin(a) * 0.015) });
        }
    }
    function spawnEscapeTrail() {
        if (!scene) return;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x99aaff, opacity: 0.9 }));
        sp.scale.set(5, 5, 1);
        sp.position.set(0, 2.2, 0);
        scene.add(sp);
        bursts.push({ sp, life: 400, max: 400, dir: new THREE.Vector3(0.02, 0.02, 0) });
    }
    function texSprite(path, isPlayer = false) {
        if (!path) return null;
        const tex = new THREE.TextureLoader().load(path);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sp = new THREE.Sprite(mat);
        // Spieler (Ei) im Vordergrund deutlich kleiner, Monster im Hintergrund größer
        const s = isPlayer ? 3.8 : 8.5; 
        sp.scale.set(s, s, 1);
        sp.position.y = isPlayer ? 1.9 : 4.2;
        return sp;
    }
    function makeUnit(side) {
        console.log(`🔨 makeUnit aufgerufen für: ${side}`);
        const g = new THREE.Group();
        const isPlayer = side === 'player';
        let sprite = null;
        if (isPlayer) {
            let path = 'Ei.png';
            if (typeof window.EVO_IMGS !== 'undefined') {
                let idx = window.data?.stats?.totalEvoLevel || 0;
                // Subs starten immer mindestens als Drachen-Küken (Stufe 1)
                if (window.data?.isSub && idx < 1) idx = 1;
                path = window.EVO_IMGS[idx] || 'Ei.png';
            }
            console.log(`👤 Player Path: ${path}`);
            sprite = texSprite(path, true);
        } else {
            const e = window.BattleEngine?.enemy;
            let path = e?.img || '';
            
            // PvP-Support: Nutze Evolution-Sprites für Gegner
            if (e?.isPvP || e?.isBoss) {
                if (typeof window.EVO_IMGS !== 'undefined') {
                    const idx = e.evoLevel || 0;
                    path = window.EVO_IMGS[idx] || 'Ei.png';
                }
            }

            console.log(`👹 Enemy Path: ${path} (isPvP: ${e?.isPvP}, isBoss: ${e?.isBoss})`);
            if (path && path.length > 4 && path.indexOf('.png') !== -1) {
                sprite = texSprite(path, false);
            }
        }
        if (sprite) {
            console.log(`✅ Sprite erstellt für ${side}`);
            g.add(sprite);

            // --- NEU: Aura-Effekte basierend auf Evo-Level (PvP Rules 2026) ---
            let evoLevel = 0;
            if (isPlayer) {
                evoLevel = window.data?.stats?.totalEvoLevel || 0;
                if (window.data?.isSub && evoLevel < 1) evoLevel = 1;
            } else {
                evoLevel = parseInt(window.BattleEngine?.enemy?.evoLevel || 0);
            }

            if (evoLevel > 0) {
                const auraColors = [
                    0xffffff, // 1: Drachen-Küken (Weißes Glitzern)
                    0xffd700, // 2: Königlicher Drache (Gold)
                    0xa855f7, // 3: Skelett-Monarch (Lila)
                    0x4ade80, // 4: Goblin-König (Grün)
                    0xff4444, // 5: Oger-Warlord (Rot)
                    0x3b82f6, // 6: Astral-Figur (Blau)
                    0xfbbf24  // 7: Göttlicher Avatar (Weiß-Gold)
                ];
                const colorHex = auraColors[evoLevel - 1] || 0xffffff;
                
                // 1. PointLight für dynamisches Leuchten
                const pLight = new THREE.PointLight(colorHex, isPlayer ? 5 : 10, isPlayer ? 8 : 15);
                pLight.position.set(0, 3, 0);
                g.add(pLight);

                // 2. Boden-Glow (Ring)
                const glowCanvas = document.createElement('canvas');
                glowCanvas.width = 64; glowCanvas.height = 64;
                const ctx = glowCanvas.getContext('2d');
                const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                const c = new THREE.Color(colorHex);
                grad.addColorStop(0, `rgba(${Math.floor(c.r*255)}, ${Math.floor(c.g*255)}, ${Math.floor(c.b*255)}, 0.6)`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 64, 64);

                const glowTex = new THREE.CanvasTexture(glowCanvas);
                const glowGeo = new THREE.PlaneGeometry(isPlayer ? 8 : 15, isPlayer ? 8 : 15);
                const glowMat = new THREE.MeshBasicMaterial({ 
                    map: glowTex, 
                    transparent: true, 
                    blending: THREE.AdditiveBlending, 
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const glowMesh = new THREE.Mesh(glowGeo, glowMat);
                glowMesh.rotation.x = -Math.PI / 2;
                glowMesh.position.y = 0.05;
                g.add(glowMesh);
                
                // Spezial-Animationen für hohe Stufen
                if (evoLevel >= 5) { // Oger, Astral, Avatar
                    const anim = () => {
                        if (!g.parent) return;
                        glowMesh.rotation.z += 0.02;
                        glowMesh.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.1);
                        requestAnimationFrame(anim);
                    };
                    anim();
                }
            }

            if (isPlayer && window.data?.equipment) {
                const createWepMesh = (itemId) => {
                    const itemData = (typeof window.getItemById === 'function') ? window.getItemById(itemId) : null;
                    if (!itemData) return null;
                    const canvas = document.createElement('canvas');
                    canvas.width = 128; canvas.height = 128;
                    const ctx = canvas.getContext('2d');
                    ctx.font = '80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(itemData.emoji || '⚔️', 64, 64);
                    const tex = new THREE.CanvasTexture(canvas);
                    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 });
                    const geo = new THREE.PlaneGeometry(bWeaponScale * 6, bWeaponScale * 6);
                    return new THREE.Mesh(geo, mat);
                };
                if (window.data.equipment.weapon) {
                    const wMesh = createWepMesh(window.data.equipment.weapon);
                    if (wMesh) {
                        wMesh.rotation.z = (bWeaponRotDeg * Math.PI) / 180;
                        wMesh.position.set(bWeaponOffsetX, 3 + bWeaponOffsetY, bWeaponOffsetZ + 0.1);
                        g.add(wMesh);
                    }
                }
                if (window.data.equipment.offhand) {
                    const oMesh = createWepMesh(window.data.equipment.offhand);
                    if (oMesh) {
                        oMesh.rotation.z = -(bWeaponRotDeg * Math.PI) / 180;
                        oMesh.position.set(-bWeaponOffsetX, 3 + bWeaponOffsetY, bWeaponOffsetZ + 0.1);
                        g.add(oMesh);
                    }
                }
            }
        } else {
            const geo = isPlayer ? new THREE.SphereGeometry(2.5, 32, 32) : new THREE.IcosahedronGeometry(3, 0);
            const mat = new THREE.MeshLambertMaterial({ color: isPlayer ? 0x00ff88 : 0xff3333, emissive: isPlayer ? 0x004422 : 0x441111 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = 3;
            g.add(mesh);
        }
        return g;
    }

    // --- API & EVENTS ---
    const BattleRenderer3D = { 
        start, 
        stop, 
        actionFocus, 
        idleCam, 
        impact, 
        spawnUnits 
    };
    window.BattleRenderer3D = BattleRenderer3D;
    
    if (window.EventHub) {
        // 1. Kampf startet (Modal öffnet sich)
        EventHub.on(EventHub.EVENTS.BATTLE_START, () => { 
            BattleRenderer3D.start(); 
        });

        // 2. Arena-UI ist bereit -> Units spawnen
        EventHub.on(EventHub.EVENTS.BATTLE_STAGE_READY, () => { 
            hideTransition(); 
            // Kleiner Timeout damit das DOM stabil ist
            setTimeout(() => {
                BattleRenderer3D.spawnUnits();
                ensureAudioOverlay();
            }, 100);
        });

        // 3. Kampf-Aktionen
        EventHub.on(EventHub.EVENTS.BATTLE_ACTION_START, ({ side }) => { 
            BattleRenderer3D.actionFocus(side); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_IMPACT, ({ side }) => { 
            BattleRenderer3D.impact(side); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_RESOLVE, () => { 
            BattleRenderer3D.idleCam(); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_HEAL, ({ side }) => { 
            healBurst(side); 
            playHeal(side); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_ACTIONLOCK, ({ side }) => { 
            playBeep(side); 
        });

        // 4. Kampf-Ende
        EventHub.on(EventHub.EVENTS.BATTLE_VICTORY, () => { 
            spawnVictorySparkles(); 
            setTimeout(() => { 
                exitTransition(); 
                BattleRenderer3D.stop(); 
            }, 2500); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_ESCAPE, () => { 
            spawnEscapeTrail(); 
            setTimeout(() => { 
                exitTransition(); 
                BattleRenderer3D.stop(); 
            }, 1000); 
        });
        EventHub.on(EventHub.EVENTS.BATTLE_LOSE, () => { 
            setTimeout(() => { 
                exitTransition(); 
                BattleRenderer3D.stop(); 
            }, 2500); 
        });
    }
})();
