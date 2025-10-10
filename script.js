let mapData = [];
let ferryData = [];

// Load map and ferry data from files
async function loadData() {
  const mapRes = await fetch("map.json");
  mapData = await mapRes.json();
  const ferryRes = await fetch("ferry.json");
  ferryData = (await ferryRes.json()).map(f => ({
    origin: [parseInt(f["origin X"]), parseInt(f["origin Y"])],
    destination: [parseInt(f["destination X"]), parseInt(f["destination Y"])],
    cost: parseInt(f["cost required"])
  }));
}
loadData();

// Determine cost based on tile type (partial match)
function tileCost(tile) {
  const name = tile.toLowerCase();
  if (name.includes("void")) return Infinity;
  if (name.includes("sea") || name.includes("mountain")) return 2;
  return 1;
}

// Dijkstra pathfinding with diagonal moves
function shortestPath(map, ferries, start, end) {
  const rows = map.length, cols = map[0].length;
  const dist = Array(rows).fill().map(() => Array(cols).fill(Infinity));
  const prev = Array(rows).fill().map(() => Array(cols).fill(null));
  const queue = [[start[0], start[1], 0]];
  dist[start[1]][start[0]] = 0;

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
  ];

  while (queue.length) {
    queue.sort((a, b) => a[2] - b[2]);
    const [x, y, d] = queue.shift();
    if (x === end[0] && y === end[1]) {
      const path = [];
      let cur = [x, y];
      while (cur) {
        path.unshift(cur);
        cur = prev[cur[1]][cur[0]];
      }
      return { cost: d, path };
    }

    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;

      const cost = tileCost(map[ny][nx]);
      if (cost === Infinity) continue;
      const newCost = d + cost;

      if (newCost < dist[ny][nx]) {
        dist[ny][nx] = newCost;
        prev[ny][nx] = [x, y];
        queue.push([nx, ny, newCost]);
      }
    }

    // Ferry travel
    for (const f of ferries) {
      if (f.origin[0] === x && f.origin[1] === y) {
        const [nx, ny] = f.destination;
        const newCost = d + f.cost;
        if (newCost < dist[ny][nx]) {
          dist[ny][nx] = newCost;
          prev[ny][nx] = [x, y];
          queue.push([nx, ny, newCost]);
        }
      }
    }
  }

  return { cost: null, path: [] };
}

// Draw map and path
function drawMap(path = []) {
  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");
  const rows = mapData.length, cols = mapData[0].length;
  const size = Math.min(canvas.width / cols, canvas.height / rows);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const name = mapData[y][x].toLowerCase();
      if (name.includes("void")) ctx.fillStyle = "black";
      else if (name.includes("sea")) ctx.fillStyle = "#4aa8ff";
      else if (name.includes("mountain")) ctx.fillStyle = "#888";
      else ctx.fillStyle = "#aaffaa";
      ctx.fillRect(x * size, y * size, size, size);
      ctx.strokeRect(x * size, y * size, size, size);
    }
  }

  // Draw path
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    const cx = x * size + size / 2;
    const cy = y * size + size / 2;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.stroke();
}

// Handle button click
document.getElementById("findPath").addEventListener("click", () => {
  const startX = parseInt(document.getElementById("startX").value);
  const startY = parseInt(document.getElementById("startY").value);
  const endX = parseInt(document.getElementById("endX").value);
  const endY = parseInt(document.getElementById("endY").value);

  const result = shortestPath(mapData, ferryData, [startX, startY], [endX, endY]);

  const resultDiv = document.getElementById("result");
  const pathDiv = document.getElementById("pathDisplay");

  if (result.path.length > 0) {
    resultDiv.textContent = `Total Cost: ${result.cost} AP`;
    const pathText = result.path.map(p => `(${p[0]},${p[1]})`).join(" → ");
    pathDiv.textContent = `Path: ${pathText}`;
    drawMap(result.path);
  } else {
    resultDiv.textContent = "No valid path found.";
    pathDiv.textContent = "";
    drawMap();
  }
});
