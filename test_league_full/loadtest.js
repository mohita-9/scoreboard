// Load test: N simulated player phones, each refreshing ?view=public every 15s (like player.html).
// Run it while an umpire scores on a phone to see the effect on saves.
// Usage (Node 18+):  node loadtest.js "https://script.google.com/macros/s/XXXX/exec" [clients=60] [seconds=120] [ms=15000]
const url = process.argv[2], clients = +process.argv[3] || 60, seconds = +process.argv[4] || 120, every = +process.argv[5] || 15000;
if (!url) { console.log('usage: node loadtest.js <web app /exec URL> [clients=60] [seconds=120] [ms between refreshes=15000]'); process.exit(1); }
const times = []; let errors = 0;
const end = Date.now() + seconds * 1000;
async function client(i) {
  await new Promise(r => setTimeout(r, Math.random() * every)); // spread the start
  while (Date.now() < end) {
    const t0 = Date.now();
    try {
      const r = await fetch(url + '?view=public&t=' + t0 + '_' + i, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status); await r.json();
      times.push(Date.now() - t0);
    } catch (e) { errors++; }
    await new Promise(r => setTimeout(r, Math.max(0, every - (Date.now() - t0))));
  }
}
Promise.all(Array.from({ length: clients }, (_, i) => client(i))).then(() => {
  times.sort((a, b) => a - b);
  const pct = p => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  console.log(`requests ${times.length}, errors ${errors}`);
  console.log(`median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${times[times.length - 1]} ms`);
  console.log(pct(0.95) < 2000 ? 'PASS: p95 under 2s' : 'FAIL: p95 over 2s');
});
