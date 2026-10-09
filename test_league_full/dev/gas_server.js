// Local stand-in for the Apps Script web app (test harness only): GET/POST on http://localhost:PORT/exec
const http = require('http'), fs = require('fs');
const G = require('./gas_mock.js').load(fs.readFileSync(process.argv[2], 'utf8'));
G.ctx.setup();
Object.assign(G.props, { REFEREE_PIN: '9999', COURT_PIN_1: '1111', COURT_PIN_2: '2222', COURT_PIN_3: '3333', COURT_PIN_4: '4444' });
setInterval(() => G.setNow(Date.now()), 200);
http.createServer((req, res) => {
  G.setNow(Date.now());
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      res.writeHead(200, cors); res.end(G.ctx.doPost({ postData: { contents: body } }).content);
    });
  } else { res.writeHead(200, cors); res.end(G.ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }).content); }
}).listen(+process.argv[3] || 8765, () => console.log('gas sim listening'));
