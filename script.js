function shortestPath(map, ferries, start, end) {
  const rows = map.length, cols = map[0].length;
  const dist = Array(rows).fill().map(() => Array(cols).fill(Infinity));
  const prev = Array(rows).fill().map(() => Array(cols).fill(null));
  const queue = [[start[0], start[1], 0]];
  dist[start[1]][start[0]] = 0;

  // 8-direction moves
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

      // all moves (including diagonals) use the destination cost
      const newCost = d + cost;

      if (newCost < dist[ny][nx]) {
        dist[ny][nx] = newCost;
        prev[ny][nx] = [x, y];
        queue.push([nx, ny, newCost]);
      }
    }

    // Ferry connections
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
