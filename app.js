const SB_URL = "https://yuxcjrzzjsyzdjrftezb.supabase.co";
const SB_KEY = "sb_publishable_lE_J5fElNPX8AU6IvjJBUA_h_Lywrgo";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let ingredientsMaster = [];
let stationsMaster = [];
let recipesMaster = [];
let allRecipeCards = [];
let mermaidInstance = null;

const assetBaseUrl = `${SB_URL}/storage/v1/object/public/game-assets/website`;
document.getElementById('game-logo-img').src = `${assetBaseUrl}/IR_Logo_Main_01.png`;
document.getElementById('guild-logo-img').src = `${assetBaseUrl}/knoc-logo-colour.png`;
document.getElementById('discord-icon').src = `${assetBaseUrl}/discord-mark-white.webp`;

function buildImgUrl(imagePath) {
	return `${SB_URL}/storage/v1/object/public/game-assets/${imagePath}`;
}

// Recursively collects all edges for a recipe and its sub-recipes into a Set
function collectRecipeEdges(recipe, edges = new Set()) {
	const outputItem = ingredientsMaster.find(i => i.id === recipe.output_item_id);
	if (!outputItem) return edges;

	const outID = outputItem.name.replace(/\s+/g, '_').replace(/[()\[\]]/g, '');
	const outName = outputItem.name.replace(/[()\[\]]/g, '');

	Object.entries(recipe.ingredients_required).forEach(([slug, qty]) => {
		const ingredientData = ingredientsMaster.find(i => i.slug === slug);
		const ingName = (ingredientData?.name || slug).replace(/[()\[\]]/g, '');
		const ingID = ingName.replace(/\s+/g, '_');

		edges.add(`  ${ingID}("${ingName}"):::goldBorder -- "${qty}x" --> ${outID}("${outName}"):::goldBorder`);

		// If this ingredient is itself craftable, recurse into it
		const subRecipe = recipesMaster.find(r => {
			const product = ingredientsMaster.find(i => i.id === r.output_item_id);
			return product?.slug === slug;
		});
		if (subRecipe) collectRecipeEdges(subRecipe, edges);
	});

	return edges;
}

async function showCraftingTree(recipe, outputItem) {
	const view = document.getElementById('recipe-view');
	const tree = document.getElementById('crafting-tree');
	document.getElementById('view-title').innerText = outputItem.name;
	view.style.display = 'block';
	tree.innerHTML = "";

	const ingredientsNeeded = Object.entries(recipe.ingredients_required);

	ingredientsNeeded.forEach(([slug, qty], index) => {
		const data = ingredientsMaster.find(i => i.slug === slug);
		const img = buildImgUrl(data?.image_path);
		const sourceInfo = data?.source || "Unknown Source";

		const subRecipe = recipesMaster.find(r => {
			const product = ingredientsMaster.find(i => i.id === r.output_item_id);
			return product?.slug === slug;
		});

		const card = document.createElement('div');
		card.className = 'ingredient-card';

		card.innerHTML = `
			<img class="item-img" src="${img}">
			<div style="font-weight: bold;">${qty}x ${data?.name || slug}</div>
			${subRecipe ? `
				<div style="margin: 5px 0;">
					<button class="filter-btn active" style="font-size: 10px; padding: 2px 8px; cursor: pointer;">
						🛠️ CRAFTABLE
					</button>
				</div>
			` : ''}
			<div class="source-label">${sourceInfo}</div>
		`;

		if (subRecipe) {
			card.style.cursor = "pointer";
			card.style.border = "1px solid #c9a84c";
			card.onclick = () => showCraftingTree(subRecipe, data);
		}

		tree.appendChild(card);

		if (index < ingredientsNeeded.length - 1) {
			const op = document.createElement('div');
			op.className = 'operator';
			op.innerText = '+';
			tree.appendChild(op);
		}
	});

	const stationObj = stationsMaster.find(s => s.id === recipe.station_id);
	const stationName = stationObj ? stationObj.name : "General Crafting";

	tree.insertAdjacentHTML('beforeend', `
		<div class="operator">=</div>
		<div class="ingredient-card" style="border: 1px solid #c9a84c;">
			<img class="item-img" src="${buildImgUrl(outputItem.image_path)}">
			<div style="font-weight: bold; margin-top: 5px;">${outputItem.name}</div>
		</div>
	`);

	tree.insertAdjacentHTML('beforeend', `
		<div style="width: 100%; display: flex; justify-content: center; margin-top: 10px;">
			<div style="background: rgba(20,20,20,0.8); border: 1px solid #333; padding: 6px 16px; display: flex; align-items: center; gap: 8px; border-radius: 2px;">
				<span style="color: #888; font-size: 14px;">⚒️</span>
				<span style="color: #888; font-weight: bold; font-size: 14px;">REQUIRED:</span>
				<span style="color: #c9a84c; font-weight: bold; font-size: 14px;">${stationName}</span>
			</div>
		</div>
	`);

	generateRecipeTree(recipe);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadWiki() {
	const [{ data: ingredients }, { data: recipes }, { data: stations }] = await Promise.all([
		_supabase.from('ingredients').select('*'),
		_supabase.from('recipes').select('*'),
		_supabase.from('stations').select('*')
	]);

	ingredientsMaster = ingredients || [];
	recipesMaster = recipes || [];
	stationsMaster = stations || [];

	const grid = document.getElementById('recipe-grid');

	if (recipesMaster.length) {
		recipesMaster.forEach(recipe => {
			const item = ingredientsMaster.find(i => i.id === recipe.output_item_id);
			if (!item) return;

			const card = document.createElement('div');
			card.className = 'card';
			card.dataset.category = item.category || 'All';
			card.onclick = () => showCraftingTree(recipe, item);
			card.innerHTML = `<img class="item-img" src="${buildImgUrl(item.image_path)}"><h3 style="color:#c9a84c">${item.name}</h3>`;

			grid.appendChild(card);
			allRecipeCards.push(card);
		});
	}
}

function filterCategory(category, btn) {
	document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
	btn.classList.add('active');

	allRecipeCards.forEach(card => {
		card.style.display = (category === 'All' || card.dataset.category === category) ? 'block' : 'none';
	});

	document.getElementById('recipe-view').style.display = 'none';
	document.getElementById('recipe-overview-container').style.display = 'none';
}

async function generateRecipeTree(recipe) {
	const container = document.getElementById('recipe-overview-container');
	const graphDiv = document.getElementById('mermaid-graph');

	// Lazy-load and initialise Mermaid only once
	if (!mermaidInstance) {
		const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
		mermaid.initialize({
			startOnLoad: false,
			theme: 'dark',
			securityLevel: 'loose',
			flowchart: {
				useMaxWidth: false,
				htmlLabels: true
			}
		});
		mermaidInstance = mermaid;
	}

	const edges = collectRecipeEdges(recipe);
	if (edges.size === 0) {
		container.style.display = 'none';
		return;
	}

	let graphDefinition = "flowchart LR\n";
	graphDefinition += `  classDef goldBorder stroke:#c9a84c,stroke-width:1px;\n`;
	graphDefinition += [...edges].join('\n');

	try {
		container.style.display = 'flex';
		graphDiv.innerHTML = graphDefinition;
		graphDiv.removeAttribute('data-processed');

		// Wait for the DOM to settle before rendering, fixes blank render on first click
		await new Promise(resolve => requestAnimationFrame(resolve));
		await mermaidInstance.run({ nodes: [graphDiv] });

		// Remove the hardcoded width Mermaid sets on the SVG, which causes horizontal scrolling
		const svg = graphDiv.querySelector("svg");
		if (svg) svg.removeAttribute("width");
	} catch (err) {
		console.error("Mermaid render error:", err);
		graphDiv.innerHTML = `<p style="color:red;">Error rendering tree: ${err.message}</p>`;
	}
}

loadWiki();
