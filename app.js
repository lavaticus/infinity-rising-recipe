const SB_URL = "https://yuxcjrzzjsyzdjrftezb.supabase.co";
const SB_KEY = "sb_publishable_lE_J5fElNPX8AU6IvjJBUA_h_Lywrgo";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let ingredientsMaster = [];
let stationsMaster = [];
let recipesMaster = [];
let allRecipeCards = [];
let mermaidInstance = null;
let activeCategory = 'All';

// Hide the header when embedded in an iframe (e.g. knightstower.fyi)
if (window.self !== window.top) {
	document.querySelector('.header').style.display = 'none';
	document.querySelector('.container').style.paddingTop = '40px';
}

const assetBaseUrl = `${SB_URL}/storage/v1/object/public/game-assets/website`;
document.getElementById('game-logo-img').src = `${assetBaseUrl}/IR_Logo_Main_01.png`;
document.getElementById('guild-logo-img').src = `${assetBaseUrl}/knoc-logo-colour.png`;
document.getElementById('discord-icon').src = `${assetBaseUrl}/discord-mark-white.webp`;

function buildImgUrl(imagePath) {
	return `${SB_URL}/storage/v1/object/public/game-assets/${imagePath}`;
}

// Global callback for Mermaid node clicks — must be on window so Mermaid can reach it
window.onMermaidNodeClick = function(nodeID) {
	const item = ingredientsMaster.find(i =>
		i.name.replace(/\s+/g, '_').replace(/[()\[\]]/g, '') === nodeID
	);
	if (!item) return;

	const recipe = recipesMaster.find(r => r.output_item_id === item.id);
	if (!recipe) return;

	showCraftingTree(recipe, item);
};

// Recursively collects all edges and node metadata for a recipe and its sub-recipes
function collectRecipeEdges(recipe, edges = new Set(), craftableNodes = new Set(), allNodes = new Set()) {
	const outputItem = ingredientsMaster.find(i => i.id === recipe.output_item_id);
	if (!outputItem) return { edges, craftableNodes, allNodes };

	const outID = outputItem.name.replace(/\s+/g, '_').replace(/[()\[\]]/g, '');
	const outName = outputItem.name.replace(/[()\[\]]/g, '');

	// The output of any recipe is always craftable
	craftableNodes.add(outID);
	allNodes.add(JSON.stringify({ id: outID, name: outName }));

	Object.entries(recipe.ingredients_required).forEach(([slug, qty]) => {
		const ingredientData = ingredientsMaster.find(i => i.slug === slug);
		const ingName = (ingredientData?.name || slug).replace(/[()\[\]]/g, '');
		const ingID = ingName.replace(/\s+/g, '_');

		allNodes.add(JSON.stringify({ id: ingID, name: ingName }));
		edges.add(`  ${ingID} -- "${qty}x" --> ${outID}`);

		// If this ingredient is itself craftable, recurse and mark it
		const subRecipe = recipesMaster.find(r => {
			const product = ingredientsMaster.find(i => i.id === r.output_item_id);
			return product?.slug === slug;
		});
		if (subRecipe) {
			craftableNodes.add(ingID);
			collectRecipeEdges(subRecipe, edges, craftableNodes, allNodes);
		}
	});

	return { edges, craftableNodes, allNodes };
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

	const stationObj = stationsMaster.find(s => s.slug === recipe.station_slug);
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
			card.dataset.name = item.name.toLowerCase();
			card.onclick = () => showCraftingTree(recipe, item);
			card.innerHTML = `<img class="item-img-sm" src="${buildImgUrl(item.image_path)}"><h3>${item.name}</h3>`;

			grid.appendChild(card);
			allRecipeCards.push(card);
		});
	}

	// Wire up live search
	document.getElementById('search-bar').addEventListener('input', applyFilters);
}

// Applies both the active category filter and the current search term together
function applyFilters() {
	const query = document.getElementById('search-bar').value.trim().toLowerCase();
	let visibleCount = 0;

	allRecipeCards.forEach(card => {
		const matchesCategory = (activeCategory === 'All' || card.dataset.category === activeCategory);
		const matchesSearch = (query === '' || card.dataset.name.includes(query));

		if (matchesCategory && matchesSearch) {
			card.style.display = 'block';
			visibleCount++;
		} else {
			card.style.display = 'none';
		}
	});

	document.getElementById('no-results').style.display = visibleCount === 0 ? 'block' : 'none';
}

function filterCategory(category, btn) {
	activeCategory = category;
	document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
	btn.classList.add('active');
	applyFilters();

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

	const { edges, craftableNodes, allNodes } = collectRecipeEdges(recipe);
	if (edges.size === 0) {
		container.style.display = 'none';
		return;
	}

	let graphDefinition = "%%{init: {'theme': 'dark', 'themeVariables': {'edgeLabelBackground': '#1a1a1a', 'clusterBkg': '#1a1a1a'}}}%%\nflowchart LR\n";

	// Craftable nodes: dark background, gold border and text, clickable
	graphDefinition += `  classDef craftable fill:#1a1a1a,stroke:#c9a84c,stroke-width:2px,color:#c9a84c,cursor:pointer;\n`;
	// Raw ingredients: muted grey, not interactive
	graphDefinition += `  classDef raw fill:#2a2a2a,stroke:#555,stroke-width:1px,color:#fff;\n`;

	// Declare all nodes explicitly with their correct class
	allNodes.forEach(nodeJson => {
		const { id, name } = JSON.parse(nodeJson);
		const cls = craftableNodes.has(id) ? 'craftable' : 'raw';
		graphDefinition += `  ${id}("${name}"):::${cls}\n`;
	});

	// Add edges
	graphDefinition += [...edges].join('\n') + '\n';

	// Add click handlers for craftable nodes
	craftableNodes.forEach(nodeID => {
		graphDefinition += `  click ${nodeID} onMermaidNodeClick\n`;
	});

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

		// Style edge labels after Mermaid renders
		setTimeout(() => {
			// Make the foreignObject bigger so text isn't clipped
			graphDiv.querySelectorAll("g.edgeLabel foreignObject").forEach(el => {
				el.setAttribute('width', '60');
				el.setAttribute('height', '30');
			});
			// Color the text gold and bold
			graphDiv.querySelectorAll("g.edgeLabel foreignObject div").forEach(el => {
				el.style.color = '#c9a84c';
				el.style.fontWeight = 'bold';
			});
		}, 100);
	} catch (err) {
		console.error("Mermaid render error:", err);
		graphDiv.innerHTML = `<p style="color:red;">Error rendering tree: ${err.message}</p>`;
	}
}

loadWiki();
