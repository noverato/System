(() => {
    const GRID = 64;
    
    let scene = null;
    let camera = null;
    let renderer = null;
    let anim = null;
    let heading = 0;
    let gridX = 0;
    let gridY = 0;
    let avatar = null;
    let collectibles = [];
    let monsters = [];
    
    let velocityY = 0;
    let isGrounded = true;
    const GRAVITY = -0.015;
    const JUMP_FORCE = 0.6;
    let lastTime = performance.now();
    
    let timeOfDay = 0.5; 
    let weatherType = 'sunny';
    let sunLight = null;
    let ambientLight = null;

    const AOI_RADIUS = 10;
    const DORMANT_RADIUS = 15;
    let groundValidated = false;

    function updateEnvironment() {
        if (!scene || !sunLight || !ambientLight) return;
        const env = window.EnvironmentManager;
        if (!env) return;

        const t = env.currentTime;
        const skyColor = new THREE.Color(env.getSkyColor());
        scene.background = skyColor;
        
        if (scene.fog) {
            scene.fog.color.copy(skyColor);
        }

        const intensity = env.getSunIntensity();
        sunLight.intensity = intensity * 1.5;
        
        const angle = (t * Math.PI * 2) - (Math.PI / 2);
        const sunDist = 400;
        const px = avatar ? avatar.position.x : 0;
        const pz = avatar ? avatar.position.z : 0;
        
        sunLight.position.set(px + Math.cos(angle) * sunDist, Math.sin(angle) * sunDist, pz + 100);
        sunLight.target.position.set(px, 0, pz);
        sunLight.target.updateMatrixWorld();

        ambientLight.intensity = Math.max(0.1, intensity * 0.5);
    }

    function spawnMonsters() {
        monsters.forEach(m => scene.remove(m));
        monsters = [];
        
        const count = 15;
        const range = 800;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * range * 2;
            const z = (Math.random() - 0.5) * range * 2;
            
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff0000 }));
            const h = (window.FPGraphics ? FPGraphics.getGPUHeight(x, z) : 0);
            sprite.position.set(x, h + 4, z);
            sprite.scale.set(10, 10, 1);
            
            sprite.userData = { isMonster: true, speed: 0.1 };
            scene.add(sprite);
            monsters.push(sprite);
        }
    }

    function updateMonsters() {
        if (!scene || !avatar) return;
        
        if (!groundValidated) {
            const h = (window.FPGraphics ? FPGraphics.getGPUHeight(avatar.position.x, avatar.position.z) : 0);
            avatar.position.y = h + 4;
            groundValidated = true;
        }

        const px = avatar.position.x;
        const pz = avatar.position.z;

        for (let i = monsters.length - 1; i >= 0; i--) {
            const m = monsters[i];
            const dx = px - m.position.x;
            const dz = pz - m.position.z;
            const dist = Math.hypot(dx, dz);

            if (dist > DORMANT_RADIUS) {
                m.visible = true;
                continue;
            }

            if (dist < 150) {
                const vx = (dx / dist) * m.userData.speed;
                const vz = (dz / dist) * m.userData.speed;
                m.position.x += vx;
                m.position.z += vz;
            }

            const groundH = (window.FPGraphics ? FPGraphics.getGPUHeight(m.position.x, m.position.z) : 0);
            m.position.y = groundH + 4;
        }
    }

    function loop() {
        anim = requestAnimationFrame(loop);
        if (!renderer || !scene || !camera) return;

        const now = performance.now();
        const delta = Math.min((now - lastTime) / 16.6, 3);
        lastTime = now;

        updateEnvironment();
        updateMonsters();
        
        if (window.FPGraphics) {
            FPGraphics.updateClipmap(avatar.position.x, avatar.position.z, renderer);
        }

        renderer.render(scene, camera);
    }

    window.FPWald = {
        init: (s, c, r, a) => {
            scene = s; camera = c; renderer = r; avatar = a;
            spawnMonsters();
            loop();
        },
        unmount: () => {
            if (anim) cancelAnimationFrame(anim);
            if (window.FPGraphics) FPGraphics.cleanup(scene);
        }
    };
})();
