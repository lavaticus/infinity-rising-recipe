// ============================================================
// CONFIG
// Replace DIRECTUS_TOKEN with your public read-only token.
// This token should only have Read access on:
//   items, recipes, stations, directus_files
// ============================================================
const DIRECTUS_URL = "https://data.knightstower.fyi";
const DIRECTUS_TOKEN = "0Uce9JGZPrJli3SBhre_RxuPufR5u-mw";

const DIRECTUS_HEADERS = {
	"Authorization": `Bearer ${DIRECTUS_TOKEN}`
};

// ============================================================
// BRANDING — file UUIDs from Directus File Library → website folder
// ============================================================
const BRANDING = {
	gameLogo:    "1ea539e9-85d3-4f60-ba4c-ffbf7f024231",
	guildLogo:   "0e31147d-06eb-4b63-910c-b3a4377f96db",
	discordIcon: "c0f6600a-0b1b-4970-987d-ef858b71f39e"
};

// ============================================================
// STATE
// ============================================================
let allItems       = [];   // all rows from `items` — needed for ingredient lookups
let recipesMaster  = [];   // all rows from `recipes` with nested item + station
let allRecipeCards = [];
let mermaidInstance = null;
let activeCategory = 'All';

// ============================================================
// HELPERS
// ============================================================

function buildImgUrl(uuid) {
	if (!uuid) return "";
	return `${DIRECTUS_URL}/assets/${uuid}`;
}

// Parse category out of the JSON data field
function getCategory(item) {
	try {
		const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
		return data?.Category || 'Other';
	} catch { return 'Other'; }
}

async function fetchCollection(collection, fields = "*") {
	const resp = await fetch(
		`${DIRECTUS_URL}/items/${collection}?limit=-1&fields=${fields}`,
		{ headers: DIRECTUS_HEADERS }
	);
	const json = await resp.json();
	return json.data || [];
}

// ============================================================
// IFRAME DETECTION
// ============================================================
if (window.self !== window.top) {
	document.querySelector('.header').style.display = 'none';
	document.querySelector('.container').style.paddingTop = '40px';
}

// ============================================================
// MERMAID NODE CLICK
// ============================================================
window.onMermaidNodeClick = function(nodeID) {
	const recipe = recipesMaster.find(r => {
		const item = r.output_item_itemid;
		return item?.itemname.replace(/\s+/g, '_').replace(/[()\[\]]/g, '') === nodeID;
	});
	if (!recipe) return;
	showCraftingTree(recipe);
};

// ============================================================
// COLLECT RECIPE EDGES (recursive, for Mermaid graph)
// ============================================================
function collectRecipeEdges(recipe, edges = new Set(), craftableNodes = new Set(), allNodes = new Set()) {
	const outputItem = recipe.output_item_itemid;
	if (!outputItem) return { edges, craftableNodes, allNodes };

	const outID   = outputItem.itemname.replace(/\s+/g, '_').replace(/[()\[\]]/g, '');
	const outName = outputItem.itemname.replace(/[()\[\]]/g, '');

	craftableNodes.add(outID);
	allNodes.add(JSON.stringify({ id: outID, name: outName }));

	Object.entries(recipe.ingredients_required || {}).forEach(([slug, qty]) => {
		const ingredientData = allItems.find(i => i.itemid === slug);
		const ingName = (ingredientData?.itemname || slug).replace(/[()\[\]]/g, '');
		const ingID   = ingName.replace(/\s+/g, '_');

		allNodes.add(JSON.stringify({ id: ingID, name: ingName }));
		edges.add(`  ${ingID} -- "${qty}x" --> ${outID}`);

		const subRecipe = recipesMaster.find(r => r.output_item_itemid?.itemid === slug);
		if (subRecipe) {
			craftableNodes.add(ingID);
			collectRecipeEdges(subRecipe, edges, craftableNodes, allNodes);
		}
	});

	return { edges, craftableNodes, allNodes };
}

// ============================================================
// SHOW CRAFTING TREE
// ============================================================
async function showCraftingTree(recipe) {
	const outputItem = recipe.output_item_itemid; // nested item object
	const view = document.getElementById('recipe-view');
	const tree = document.getElementById('crafting-tree');
	document.getElementById('view-title').innerText = outputItem.itemname;
	view.style.display = 'block';
	tree.innerHTML = "";

	const ingredientsNeeded = Object.entries(recipe.ingredients_required || {});

	ingredientsNeeded.forEach(([slug, qty], index) => {
		const data = allItems.find(i => i.itemid === slug);
		const img = buildImgUrl(data?.image);
		const sourceInfo = data?.source || "Unknown Source";

		const subRecipe = recipesMaster.find(r => r.output_item_itemid?.itemid === slug);

		const card = document.createElement('div');
		card.className = 'ingredient-card';

		card.innerHTML = `
			<img class="item-img" src="${img}" alt="${data?.itemname || slug}">
			<div style="font-weight: bold;">${qty}x ${data?.itemname || slug}</div>
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
			card.onclick = () => showCraftingTree(subRecipe);
		}

		tree.appendChild(card);

		if (index < ingredientsNeeded.length - 1) {
			const op = document.createElement('div');
			op.className = 'operator';
			op.innerText = '+';
			tree.appendChild(op);
		}
	});

	// station is also nested: recipe.station_itemid.name
	const stationName = recipe.station_itemid?.name || "General Crafting";

	tree.insertAdjacentHTML('beforeend', `
		<div class="operator">=</div>
		<div class="ingredient-card" style="border: 1px solid #c9a84c;">
			<img class="item-img" src="${buildImgUrl(outputItem.image)}" alt="${outputItem.itemname}">
			<div style="font-weight: bold; margin-top: 5px;">${outputItem.itemname}</div>
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

// ============================================================
// LOAD WIKI
// ============================================================
async function loadWiki() {
	// Fetch all items (needed for ingredient lookups in ingredients_required JSON)
	// Fetch recipes with output item + station nested in one call
	[allItems, recipesMaster] = await Promise.all([
		fetchCollection("items", "*"),
		fetchCollection("recipes", "*,output_item_itemid.*,station_itemid.*")
	]);

	// Branding images set directly from hardcoded UUIDs
	document.getElementById('game-logo-img').src = buildImgUrl(BRANDING.gameLogo);
	document.getElementById('guild-logo-img').src = buildImgUrl(BRANDING.guildLogo);
	document.getElementById('discord-icon').src   = buildImgUrl(BRANDING.discordIcon);

	const grid = document.getElementById('recipe-grid');

	recipesMaster.forEach(recipe => {
		const item = recipe.output_item_itemid; // already nested
		if (!item) return;

		const card = document.createElement('div');
		card.className = 'card';
		card.dataset.category = getCategory(item);
		card.dataset.name = item.itemname.toLowerCase();
		card.onclick = () => showCraftingTree(recipe);
		card.innerHTML = `
			<img class="item-img-sm" src="${buildImgUrl(item.image)}" alt="${item.itemname}">
			<h3>${item.itemname}</h3>
		`;

		grid.appendChild(card);
		allRecipeCards.push(card);
	});

	document.getElementById('search-bar').addEventListener('input', applyFilters);
}

// ============================================================
// FILTERS
// ============================================================
function applyFilters() {
	const query = document.getElementById('search-bar').value.trim().toLowerCase();
	let visibleCount = 0;

	allRecipeCards.forEach(card => {
		const matchesCategory = (activeCategory === 'All' || card.dataset.category === activeCategory);
		const matchesSearch   = (query === '' || card.dataset.name.includes(query));

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

// ============================================================
// MERMAID GRAPH
// ============================================================
async function generateRecipeTree(recipe) {
	const container = document.getElementById('recipe-overview-container');
	const graphDiv  = document.getElementById('mermaid-graph');

	if (!mermaidInstance) {
		const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
		mermaid.initialize({
			startOnLoad: false,
			theme: 'dark',
			securityLevel: 'loose',
			flowchart: { useMaxWidth: false, htmlLabels: true }
		});
		mermaidInstance = mermaid;
	}

	const { edges, craftableNodes, allNodes } = collectRecipeEdges(recipe);
	if (edges.size === 0) {
		container.style.display = 'none';
		return;
	}

	let graphDefinition = "%%{init: {'theme': 'dark', 'themeVariables': {'edgeLabelBackground': '#1a1a1a', 'clusterBkg': '#1a1a1a'}}}%%\nflowchart LR\n";
	graphDefinition += `  classDef craftable fill:#1a1a1a,stroke:#c9a84c,stroke-width:2px,color:#c9a84c,cursor:pointer;\n`;
	graphDefinition += `  classDef raw fill:#2a2a2a,stroke:#555,stroke-width:1px,color:#fff;\n`;

	allNodes.forEach(nodeJson => {
		const { id, name } = JSON.parse(nodeJson);
		const cls = craftableNodes.has(id) ? 'craftable' : 'raw';
		graphDefinition += `  ${id}("${name}"):::${cls}\n`;
	});

	graphDefinition += [...edges].join('\n') + '\n';

	craftableNodes.forEach(nodeID => {
		graphDefinition += `  click ${nodeID} onMermaidNodeClick\n`;
	});

	try {
		container.style.display = 'flex';
		graphDiv.innerHTML = graphDefinition;
		graphDiv.removeAttribute('data-processed');

		await new Promise(resolve => requestAnimationFrame(resolve));
		await mermaidInstance.run({ nodes: [graphDiv] });

		const svg = graphDiv.querySelector("svg");
		if (svg) svg.removeAttribute("width");

		setTimeout(() => {
			graphDiv.querySelectorAll("g.edgeLabel foreignObject").forEach(el => {
				el.setAttribute('width', '60');
				el.setAttribute('height', '30');
			});
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

// ============================================================
// BOOT
// ============================================================
loadWiki();
