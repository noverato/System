/**
 * SPAWN2909 - CRAFTING UI
 * Ermöglicht das Herstellen von Gegenständen basierend auf Rezepten in crafting.js
 */

const CraftingUI = (() => {
    function render(targetId = "modalLeft") {
        const display = document.getElementById(targetId);
        if (!display) return;

        display.innerHTML = `
            <div style="padding:20px; color:#fdf5e6;">
                <div style="display:flex; justify-content:space-between; border-bottom:2px solid #8b4513; padding-bottom:10px;">
                    <h2 style="color:#deb887;">Dorfschmiede & Handwerk</h2>
                    <div>💰 <span id="craftingLXP">${data.lxp}</span> LXP</div>
                </div>

                <p style="color:#aaa; font-style:italic; margin-top:10px;">
                    „Geduld und ein ruhiges Händchen formen die stärksten Klingen.“
                </p>

                <div style="display:flex; gap:10px; margin-top:15px; border-bottom:1px solid #444; padding-bottom:10px; overflow-x:auto;">
                    <button class="btn-action" style="white-space:nowrap;" onclick="CraftingUI.filter('materials')">🧵 MATERIALIEN</button>
                    <button class="btn-action" style="white-space:nowrap;" onclick="CraftingUI.filter('weapons')">⚔️ WAFFEN</button>
                    <button class="btn-action" style="white-space:nowrap;" onclick="CraftingUI.filter('armor_t1')">🛡️ RÜSTUNG T1</button>
                    <button class="btn-action" style="white-space:nowrap;" onclick="CraftingUI.filter('consumables')">🧪 TRÄNKE</button>
                </div>

                <div id="craftingList" 
                     style="margin-top:20px; display:grid; 
                     grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); 
                     gap:15px;">
                </div>
            </div>
        `;

        filter('materials');
    }

    function filter(category) {
        const list = document.getElementById('craftingList');
        if (!list) return;
        list.innerHTML = "";

        const recipes = Crafting.listRecipes(category);

        if (recipes.length === 0) {
            list.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#666;">Keine Rezepte in dieser Kategorie gefunden.</p>`;
            return;
        }

        recipes.forEach(recipe => {
            const canCraft = Crafting.canCraft(recipe.id);
            const inputsHtml = recipe.inputs.map(input => {
                const item = getItemById(input.id) || { name: input.id, emoji: '📦' };
                const owned = (data.inventar && data.inventar[input.id]) || 0;
                const color = owned >= input.qty ? '#4ade80' : '#f87171';
                return `<div style="font-size:12px; color:${color};">${item.emoji} ${item.name}: ${owned}/${input.qty}</div>`;
            }).join('');

            list.innerHTML += `
                <div style="background:rgba(40,30,20,0.5); padding:15px; border-radius:10px; border:1px solid #5d4037; position:relative;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span style="font-size:2.5em;">${recipe.emoji}</span>
                        <div>
                            <div style="color:#deb887; font-weight:bold;">${recipe.name}</div>
                            <div style="font-size:11px; color:#aaa;">${recipe.category.toUpperCase()}</div>
                        </div>
                    </div>
                    
                    <div style="margin:10px 0; padding:8px; background:rgba(0,0,0,0.3); border-radius:5px;">
                        <div style="font-size:11px; color:#888; margin-bottom:4px;">BENÖTIGT:</div>
                        ${inputsHtml}
                    </div>

                    <button class="btn-action" 
                            style="width:100%; ${canCraft ? '' : 'opacity:0.5; cursor:not-allowed;'}" 
                            onclick="${canCraft ? `CraftingUI.doCraft('${recipe.id}')` : ''}">
                        HERSTELLEN
                    </button>
                </div>
            `;
        });
    }

    function doCraft(recipeId) {
        const result = Crafting.craft(recipeId);
        if (result.success) {
            // UI Feedback
            const lxpDisp = document.getElementById('craftingLXP');
            if (lxpDisp) lxpDisp.innerText = data.lxp;
            
            // Re-render current filter
            const recipe = Crafting.getRecipe(recipeId);
            if (recipe) filter(recipe.category);
            
            // Optional: Kleiner Sound oder Effekt
            console.log("Crafting erfolgreich:", result.output.name);
        } else {
            alert("Herstellung fehlgeschlagen! Materialien fehlen oder Anforderungen nicht erfüllt.");
        }
    }

    return { render, filter, doCraft };
})();

window.CraftingUI = CraftingUI;
