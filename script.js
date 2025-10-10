async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

function tileCost(tile) {
  if (tile.includes("void")) return Infinity;
  if (tile.includes("mountain") || tile.includes("sea")) return 2;
  return 1;
}

function neighbors(x, y, rows, cols) {
  return [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => [x+dx, y+dy])
    .filter(([nx,ny]) => nx>=0 && ny>=0 && nx<cols && ny<rows);
}

function shortestPath(map, ferries, start, end) {
  const rows = map.length, cols = map[0].length;
  const dist = Array(rows).fill().map(()=>Array(cols).fill(Infinity));
  const prev = Array(rows).fill().map(()=>Array(cols).fill(null));
  const queue = [[start[0], start[1], 0]];
  dist[start[1]][start[0]] = 0;

  while (queue.length) {
    queue.sort((a,b)=>a[2]-b[2]);
    const [x,y,d] = queue.shift();

    if (x === end[0] && y === end[1]) {
      // reconstruct path
      const path = [];
      let cur = [x,y];
      while (cur) {
        path.unshift(cur);
        cur = prev[cur[1]][cur[0]];
      }
      return { cost: d, path };
    }

    // 1️⃣ Normal tile neighbors
    for (const [nx,ny] of neighbors(x,y,rows,cols)) {
      const cost = tileCost(map[ny][nx]);
      if (cost !== Infinity && d + cost < dist[ny][nx]) {
        dist[ny][nx] = d + cost;
        prev[ny][nx] = [x,y];
        queue.push([nx,ny,d+cost]);
      }
    }

    // 2️⃣ Ferry connections
    for (const f of ferries) {
      if (f.origin[0] === x && f.origin[1] === y) {
        const [nx,ny] = f.destination;
        const newCost = d + f.cost;
        if (newCost < dist[ny][nx]) {
          dist[ny][nx] = newCost;
          prev[ny][nx] = [x,y];
          queue.push([nx,ny,newCost]);
        }
      }
    }
  }

  return { cost: null, path: [] };
}

async function findPath() {
  const map = await loadJSON("map.json");
  const ferries = await loadJSON("ferry.json");
  const start = document.getElementById("start").value.split(",").map(Number);
  const end = document.getElementById("end").value.split(",").map(Number);
  const result = shortestPath(map, ferries, start, end);

  if (result.cost === null) {
    alert("No path found.");
  } else {
    alert(`Shortest cost: ${result.cost} AP\nPath: ${JSON.stringify(result.path)}`);
    drawMap(map, result.path);
  }
}

function drawMap(map, path) {
  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");
  const rows = map.length, cols = map[0].length;
  const tileSize = Math.floor(canvas.width / cols);

  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      let color = "#bada55"; // grass
      if (map[y][x].includes("mountain")) color = "#777";
      if (map[y][x].includes("sea")) color = "#3399ff";
      if (map[y][x].includes("void")) color = "#000";
      ctx.fillStyle = color;
      ctx.fillRect(x*tileSize, y*tileSize, tileSize-1, tileSize-1);
    }
  }

  ctx.fillStyle = "red";
  for (const [x,y] of path) {
    ctx.fillRect(x*tileSize + tileSize/4, y*tileSize + tileSize/4, tileSize/2, tileSize/2);
  }
}
