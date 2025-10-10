// script.js - supports ferry entries as { origin: [x,y], destination: [x,y], cost: n }
// or as { "origin X": x, "origin Y": y, "cost required": n, "destination X": x, ... }
// shows clickable path coordinates which highlight tiles

let mapData = [];
let ferryData = [];

// ----- Helpers -----
function safeToString(v){ return (v === null || v === undefined) ? "" : String(v).toLowerCase(); }
function inBounds(x,y,cols,rows){ return x>=0 && y>=0 && x<cols && y<rows; }
function intOrZero(v){ const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }

// tries to find a property value on object using multiple normalized candidate names
function pickField(obj, candidates){
  if(!obj) return undefined;
  const map = {};
  for(const k of Object.keys(obj)) map[k.replace(/\s+/g,'').toLowerCase()] = obj[k];
  for(const c of candidates){
    const key = c.replace(/\s+/g,'').toLowerCase();
    if(key in map) return map[key];
  }
  // also try direct numeric arrays (rare)
  return undefined;
}

// normalize various ferry record shapes into { origin:[x,y], destination:[x,y], cost: n }
function normalizeFerries(raw){
  const out = [];
  if(!Array.isArray(raw)) return out;
  for(const f of raw){
    if(!f) continue;
    // Case 1: already in desired shape: { origin: [x,y], destination: [x,y], cost: n }
    if(Array.isArray(f.origin) && Array.isArray(f.destination)){
      out.push({
        origin: [intOrZero(f.origin[0]), intOrZero(f.origin[1])],
        destination: [intOrZero(f.destination[0]), intOrZero(f.destination[1])],
        cost: intOrZero(f.cost ?? f.c ?? f["cost required"] ?? f["costrequired"])
      });
      continue;
    }

    // Case 2: older CSV-like keys: try to pick fields with multiple name variants
    const ox = pickField(f, ["origin x","originx","origin_x","origin0","ox"]) ?? pickField(f, ["origin[0]","origin_0"]);
    const oy = pickField(f, ["origin y","originy","origin_y","origin1","oy"]) ?? pickField(f, ["origin[1]","origin_1"]);
    const dx = pickField(f, ["destination x","destinationx","destination_x","destx","dx"]) ?? pickField(f, ["destination[0]","destination_0"]);
    const dy = pickField(f, ["destination y","destinationy","destination_y","desty","dy"]) ?? pickField(f, ["destination[1]","destination_1"]);
    const cost = pickField(f, ["cost required","costrequired","cost","cost_ap_required","costaprequired","c"]);

    if(ox !== undefined && oy !== undefined && dx !== undefined && dy !== undefined){
      out.push({
        origin: [intOrZero(ox), intOrZero(oy)],
        destination: [intOrZero(dx), intOrZero(dy)],
        cost: intOrZero(cost)
      });
      continue;
    }

    // Last resort: try to interpret any numeric-looking fields in f in some order (not ideal but safe fallback)
    // (skip fallback if nothing matches)
    // No fallback pushing here to avoid invalid entries
  }
  return out;
}

// ----- Load data -----
async function loadData(){
  try {
    const mapRes = await fetch("map.json");
    if(!mapRes.ok) throw new Error("map.json not found or failed to load ("+mapRes.status+")");
    mapData = await mapRes.json();

    const ferryRes = await fetch("ferry.json");
    if(!ferryRes.ok) {
      ferryData = [];
      console.warn("ferry.json not found, proceeding with no ferries.");
    } else {
      const rawF = await ferryRes.json();
      ferryData = normalizeFerries(rawF);
    }

    console.log("Map loaded:", mapData.length, "rows; Ferries loaded:", ferryData.length);
    drawMap(); // initial draw
  } catch(e){
    console.error("Failed to load data:", e);
    alert("Failed to load map/ferry JSON: " + e.message + ". If opening index.html directly, consider running a local server (e.g. `python -m http.server`).");
  }
}
loadData();

// ----- Tile cost (substring match) -----
function tileCost(tile){
  const s = safeToString(tile);
  if(s.includes("void")) return Infinity;      // impassable
  if(s.includes("mountain")) return 2;
  if(s.includes("sea")) return 2;
  return 1;
}

// ----- Pathfinding (Dijkstra, diagonal allowed, cost = destination tile cost) -----
function shortestPath(map, ferries, start, end){
  if(!Array.isArray(map) || map.length === 0) return { cost: null, path: [], error: "Empty map" };
  const rows = map.length, cols = map[0].length;
  const [sx, sy] = start, [ex, ey] = end;

  if(!inBounds(sx, sy, cols, rows) || !inBounds(ex, ey, cols, rows)){
    return { cost: null, path: [], error: "Start or end out of bounds" };
  }
  if(tileCost(map[sy][sx]) === Infinity) return { cost: null, path: [], error: "Start tile is impassable (void)" };
  if(tileCost(map[ey][ex]) === Infinity) return { cost: null, path: [], error: "End tile is impassable (void)" };

  const dist = Array(rows).fill().map(()=>Array(cols).fill(Infinity));
  const prev = Array(rows).fill().map(()=>Array(cols).fill(null));
  dist[sy][sx] = 0;
  const queue = [[sx, sy, 0]]; // basic priority queue by sorting

  const dirs = [
    [1,0], [-1,0], [0,1], [0,-1],
    [1,1], [-1,-1], [1,-1], [-1,1]
  ];

  while(queue.length){
    queue.sort((a,b)=>a[2]-b[2]);
    const [x,y,d] = queue.shift();
    if(d !== dist[y][x]) continue; // stale entry
    if(x === ex && y === ey){
      const path = [];
      let cur = [x,y];
      while(cur){
        path.unshift(cur);
        cur = prev[cur[1]][cur[0]];
      }
      return { cost: d, path };
    }

    // normal moves
    for(const [dx,dy] of dirs){
      const nx = x + dx, ny = y + dy;
      if(!inBounds(nx,ny,cols,rows)) continue;
      const c = tileCost(map[ny][nx]);
      if(c === Infinity) continue;
      const newCost = d + c;
      if(newCost < dist[ny][nx]){
        dist[ny][nx] = newCost;
        prev[ny][nx] = [x,y];
        queue.push([nx, ny, newCost]);
      }
    }

    // ferry edges: directed
    for(const f of ferries){
      if(Array.isArray(f.origin) && f.origin[0] === x && f.origin[1] === y){
        const nx = f.destination[0], ny = f.destination[1];
        if(!inBounds(nx,ny,cols,rows)) continue;
        const ferryCost = Number(f.cost) || 0;
        const newCost = d + ferryCost; // ferry replaces tile step cost
        if(newCost < dist[ny][nx]){
          dist[ny][nx] = newCost;
          prev[ny][nx] = [x,y];
          queue.push([nx, ny, newCost]);
        }
      }
    }
  }

  return { cost: null, path: [] };
}

// ----- Draw / UI -----
function drawMap(path = [], highlight = null){
  if(!Array.isArray(mapData) || mapData.length === 0) return;
  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");
  const rows = mapData.length, cols = mapData[0].length;
  const size = Math.min(canvas.width / cols, canvas.height / rows);

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // tiles
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const tile = safeToString(mapData[y][x]);
      if(tile.includes("void")) ctx.fillStyle = "#111111";
      else if(tile.includes("sea")) ctx.fillStyle = "#66aaff";
      else if(tile.includes("mountain")) ctx.fillStyle = "#888888";
      else ctx.fillStyle = "#aaffaa";
      ctx.fillRect(x*size, y*size, size, size);
      ctx.strokeStyle = "#444";
      ctx.strokeRect(x*size, y*size, size, size);
    }
  }

  // ferries (dashed purple lines)
  ctx.save();
  ctx.setLineDash([6,4]);
  ctx.strokeStyle = "#8a2be2";
  ctx.lineWidth = 2;
  for(const f of ferryData){
    if(!Array.isArray(f.origin) || !Array.isArray(f.destination)) continue;
    const [ox,oy] = f.origin, [dx,dy] = f.destination;
    // only draw if in bounds
    if(inBounds(ox,oy,cols,rows) && inBounds(dx,dy,cols,rows)){
      ctx.beginPath();
      ctx.moveTo(ox*size + size/2, oy*size + size/2);
      ctx.lineTo(dx*size + size/2, dy*size + size/2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // path (solid gold line + red nodes)
  if(Array.isArray(path) && path.length>0){
    ctx.beginPath();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    for(let i=0;i<path.length;i++){
      const [x,y] = path[i];
      const cx = x*size + size/2, cy = y*size + size/2;
      if(i===0) ctx.moveTo(cx,cy); else ctx.lineTo(cx,cy);
    }
    ctx.stroke();

    ctx.fillStyle = "red";
    for(const [x,y] of path){
      ctx.fillRect(x*size + size*0.25, y*size + size*0.25, size*0.5, size*0.5);
    }
  }

  // highlight single tile if requested
  if(Array.isArray(highlight)){
    const [hx,hy] = highlight;
    if(inBounds(hx,hy,cols,rows)){
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      ctx.strokeRect(hx*size + 2, hy*size + 2, size-4, size-4);
    }
  }
}

// ----- UI glue -----
function makePathDisplay(path){
  const container = document.getElementById("pathDisplay");
  container.innerHTML = "";
  if(!path || path.length===0) return;
  // create clickable spans
  for(let i=0;i<path.length;i++){
    const [x,y] = path[i];
    const span = document.createElement("span");
    span.textContent = `(${x},${y})`;
    span.style.cursor = "pointer";
    span.style.padding = "2px 6px";
    span.style.borderRadius = "4px";
    span.style.marginRight = "6px";
    span.dataset.x = x;
    span.dataset.y = y;
    span.addEventListener("click", ()=> {
      drawMap(path, [Number(span.dataset.x), Number(span.dataset.y)]);
    });
    container.appendChild(span);
    if(i < path.length-1){
      const arrow = document.createElement("span");
      arrow.textContent = " → ";
      container.appendChild(arrow);
    }
  }
}

// ----- Button handler -----
document.getElementById("findPath").addEventListener("click", ()=>{
  if(!mapData || mapData.length===0){
    alert("Map not loaded yet.");
    return;
  }
  const sx = Number(document.getElementById("startX").value);
  const sy = Number(document.getElementById("startY").value);
  const ex = Number(document.getElementById("endX").value);
  const ey = Number(document.getElementById("endY").value);

  if(!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(ex) || !Number.isFinite(ey)){
    alert("Start / End must be valid numbers.");
    return;
  }

  const res = shortestPath(mapData, ferryData, [sx, sy], [ex, ey]);
  const resultDiv = document.getElementById("result");
  const pathDiv = document.getElementById("pathDisplay");

  if(res.error){
    resultDiv.textContent = "Error: " + res.error;
    pathDiv.textContent = "";
    drawMap();
    return;
  }

  if(!res.path || res.path.length===0){
    resultDiv.textContent = "No valid path found.";
    pathDiv.textContent = "";
    drawMap();
    return;
  }

  resultDiv.textContent = `Total Cost: ${res.cost} AP`;
  makePathDisplay(res.path);
  drawMap(res.path);
});
