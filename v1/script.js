// script.js - updated (diagonal moves cost = destination tile cost, void = impassable)

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("File not found: " + path + " (HTTP " + res.status + ")");
  return await res.json();
}

// ---------- tile cost rules ----------
function tileCost(tile) {
  if (tile === null || tile === undefined) return Infinity;
  const t = String(tile).toLowerCase();
  if (t.includes("void")) return Infinity;      // completely impassable
  if (t.includes("mountain")) return 2;         // mountain = 2 AP
  if (t.includes("sea")) return 2;              // sea = 2 AP
  return 1;                                     // everything else = 1 AP
}

// ---------- helpers ----------
function inBounds(x, y, cols, rows) {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

function parseCoord(str) {
  if (!str) throw new Error("Empty coordinate");
  const parts = String(str).split(",").map(s => s.trim()).map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) throw new Error("Coordinates must be in form x,y (numbers)");
  return [parts[0], parts[1]];
}

// ---------- pathfinding (Dijkstra, 8 directions allowed) ----------
function shortestPath(map, ferries, start, end) {
  const rows = map.length;
  if (rows === 0) return { cost: null, path: [] };
  const cols = map[0].length;

  const dist = Array(rows).fill().map(() => Array(cols).fill(Infinity));
  const prev = Array(rows).fill().map(() => Array(cols).fill(null));

  // directions: 8 neighbors (diagonals included)
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
  ];

  const [sx, sy] = start;
  const [ex, ey] = end;

  if (!inBounds(sx, sy, cols, rows) || !inBounds(ex, ey, cols, rows)) {
    return { cost: null, path: [], error: "Start or end outside map bounds" };
  }

  // Start must be passable
  if (tileCost(map[sy][sx]) === Infinity) return { cost: null, path: [], error: "Start tile is impassable (void)" };
  if (tileCost(map[ey][ex]) === Infinity) return { cost: null, path: [], error: "End tile is impassable (void)" };

  dist[sy][sx] = 0;
  const queue = [[sx, sy, 0]]; // small priority queue by sorting (fine for small maps)

  while (queue.length) {
    // pop smallest d
    queue.sort((a,b) => a[2] - b[2]);
    const [x, y, d] = queue.shift();

    // if this entry is outdated (we found a better path already), skip it
    if (d !== dist[y][x]) continue;

    // reached goal
    if (x === ex && y === ey) {
      // reconstruct path
      const path = [];
      let cur = [x, y];
      while (cur) {
        path.unshift(cur);
        cur = prev[cur[1]][cur[0]];
      }
      return { cost: d, path };
    }

    // normal neighbors (8 directions) - cost = destination tile cost
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, cols, rows)) continue;

      const c = tileCost(map[ny][nx]);
      if (c === Infinity) continue; // cannot go into void

      const newCost = d + c; // diagonal uses same rule (destination tile cost)
      if (newCost < dist[ny][nx]) {
        dist[ny][nx] = newCost;
        prev[ny][nx] = [x, y];
        queue.push([nx, ny, newCost]);
      }
    }

    // ferry connections (treat as directed edges from origin -> destination)
    if (Array.isArray(ferries)) {
      for (const f of ferries) {
        // expected ferry format: { origin: [x,y], destination: [x,y], cost: number }
        if (!f || !Array.isArray(f.origin) || !Array.isArray(f.destination)) continue;
        if (f.origin[0] === x && f.origin[1] === y) {
          const nx = f.destination[0], ny = f.destination[1];
          if (!inBounds(nx, ny, cols, rows)) continue;
          const newCost = d + Number(f.cost || f.Cost || f.costAP || f["cost ap required"] || 0);
          if (newCost < dist[ny][nx]) {
            dist[ny][nx] = newCost;
            prev[ny][nx] = [x, y];
            queue.push([nx, ny, newCost]);
          }
        }
      }
    }
  }

  return { cost: null, path: [] };
}

// ---------- drawing ----------
function drawMap(map, path = [], start = null, end = null, ferries = []) {
  const canvas = document.getElementById("mapCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rows = map.length, cols = map[0].length;
  const size = Math.floor(canvas.width / cols);

  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw tiles
  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      const t = String(map[y][x]||"").toLowerCase();
      let color = "#bada55"; // default grass
      if (t.includes("mountain")) color = "#777777";
      if (t.includes("sea")) color = "#66aaff";
      if (t.includes("void")) color = "#111111";
      ctx.fillStyle = color;
      ctx.fillRect(x*size, y*size, size-1, size-1);
    }
  }

  // draw ferries (dashed purple lines)
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6,4]);
  ctx.strokeStyle = "#8a2be2";
  for (const f of ferries) {
    if (!f || !Array.isArray(f.origin) || !Array.isArray(f.destination)) continue;
    const [ox, oy] = f.origin, [dx, dy] = f.destination;
    if (inBounds(ox,oy,cols,rows) && inBounds(dx,dy,cols,rows)) {
      ctx.beginPath();
      ctx.moveTo(ox*size + size/2, oy*size + size/2);
      ctx.lineTo(dx*size + size/2, dy*size + size/2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // draw path (solid yellow line and red squares on nodes)
  if (path && path.length > 0) {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffd700";
    for (let i=0; i<path.length; i++) {
      const [x,y] = path[i];
      const cx = x*size + size/2, cy = y*size + size/2;
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // draw nodes
    ctx.fillStyle = "red";
    for (const [x,y] of path) {
      ctx.fillRect(x*size + size*0.25, y*size + size*0.25, size*0.5, size*0.5);
    }
  }

  // start & end markers
  if (start) {
    ctx.fillStyle = "green";
    ctx.fillRect(start[0]*size + size*0.15, start[1]*size + size*0.15, size*0.7, size*0.7);
  }
  if (end) {
    ctx.fillStyle = "blue";
    ctx.fillRect(end[0]*size + size*0.15, end[1]*size + size*0.15, size*0.7, size*0.7);
  }
}

// ---------- main UI handler ----------
async function findPath() {
  try {
    const map = await loadJSON("map.json");
    const ferries = await loadJSON("ferry.json");

    const startRaw = document.getElementById("start").value;
    const endRaw = document.getElementById("end").value;
    const start = parseCoord(startRaw);
    const end = parseCoord(endRaw);

    // quick map draw first
    drawMap(map, [], start, end, ferries);

    const result = shortestPath(map, ferries, start, end);

    if (result.error) {
      alert("Error: " + result.error);
      return;
    }

    if (result.cost === null) {
      alert("No path found.");
    } else {
      alert(`Shortest cost: ${result.cost} AP\nPath length (steps): ${result.path.length - 1}`);
      drawMap(map, result.path, start, end, ferries);
    }
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message + ". See console for details.");
  }
}

// ---------- optional auto-test for development ----------
async function quickTestConsole() {
  try {
    const map = await loadJSON("map.json");
    const ferry = await loadJSON("ferry.json");
    console.log("map size:", map.length, "x", map[0].length);
    const r = shortestPath(map, ferry, [0,0], [2,2]);
    console.log("test result (0,0->2,2):", r);
  } catch (e) {
    console.error(e);
  }
}

// call quickTestConsole() manually from console if needed
