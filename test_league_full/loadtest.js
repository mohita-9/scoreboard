// Load test for the read endpoint: N clients each polling ?view=matches every 5s.
// Usage (Node 18+):  node loadtest.js "https://script.google.com/macros/s/XXXX/exec" [clients=100] [seconds=60]
const url = process.argv[2], clients = +process.argv[3] || 100, seconds = +process.argv[4] || 60;
if (!url) { console.log('usage: node loadtest.js <web app /exec URL> [clients] [seconds]'); process.exit(1); }
const times = []; let errors = 0;
const end = Date.now() + seconds * 1000;
async function client(i) {
  await new Promise(r => setTimeout(r, Math.random() * 5000)); // spread the start
  while (Date.now() < end) {
    const t0 = Date.now();
    try {
      const r = await fetch(url + '?view=matches&t=' + t0 + '_' + i, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status); await r.json();
      times.push(Date.now() - t0);
    } catch (e) { errors++; }
    await new Promise(r => setTimeout(r, Math.max(0, 5000 - (Date.now() - t0))));
  }
}
Promise.all(Array.from({ length: clients }, (_, i) => client(i))).then(() => {
  times.sort((a, b) => a - b);
  const pct = p => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  console.log(`requests ${times.length}, errors ${errors}`);
  console.log(`median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${times[times.length - 1]} ms`);
  console.log(pct(0.95) < 2000 ? 'PASS: p95 under 2s' : 'FAIL: p95 over 2s');
});
