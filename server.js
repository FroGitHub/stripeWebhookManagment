const express = require('express');
const { spawn, execFile } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4242;

// --- SSE: транслюємо лог у браузер ---
let sseClients = [];

function broadcast(line) {
    const payload = `data: ${JSON.stringify(line)}\n\n`;
    sseClients.forEach((res) => res.write(payload));
}

app.get('/events', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    sseClients.push(res);

    req.on('close', () => {
        sseClients = sseClients.filter((c) => c !== res);
    });
});

// --- Валідація вводу (щоб не було command injection) ---
// Дозволяємо тільки безпечні символи для payment intent id / URL хоста
const SAFE_ID = /^[a-zA-Z0-9_]+$/;
const SAFE_FORWARD_TO = /^[a-zA-Z0-9.:/_-]+$/;

function isSafeId(id) {
    return typeof id === 'string' && SAFE_ID.test(id) && id.length < 200;
}
function isSafeForwardTo(url) {
    return typeof url === 'string' && SAFE_FORWARD_TO.test(url) && url.length < 300;
}

// --- Довготривалий процес stripe listen ---
let listenProcess = null;

app.post('/api/listen/start', (req, res) => {
    const { forwardTo } = req.body;

    if (!isSafeForwardTo(forwardTo)) {
        return res.status(400).json({ error: 'Невалідний forward-to URL' });
    }
    if (listenProcess) {
        return res.status(409).json({ error: 'Лісенер вже запущено' });
    }

    listenProcess = spawn('stripe', ['listen', '--forward-to', forwardTo]);

    listenProcess.stdout.on('data', (data) => broadcast(data.toString()));
    listenProcess.stderr.on('data', (data) => broadcast(data.toString()));

    listenProcess.on('close', (code) => {
        broadcast(`\n[listener зупинено, код виходу: ${code}]\n`);
        listenProcess = null;
    });

    broadcast(`\n[запускаю: stripe listen --forward-to ${forwardTo}]\n`);
    res.json({ status: 'started' });
});

app.post('/api/listen/stop', (req, res) => {
    if (!listenProcess) {
        return res.status(409).json({ error: 'Лісенер не запущено' });
    }
    listenProcess.kill();
    res.json({ status: 'stopping' });
});

// --- Одноразові команди: success / fail / refund ---
function runStripe(args, res) {
    broadcast(`\n$ stripe ${args.join(' ')}\n`);
    execFile('stripe', args, (error, stdout, stderr) => {
        const output = stdout + (stderr ? `\n${stderr}` : '');
        broadcast(output + '\n');
        if (error) {
            return res.status(500).json({ error: error.message, output });
        }
        res.json({ output });
    });
}

app.post('/api/payment/success', (req, res) => {
    const { id } = req.body;
    if (!isSafeId(id)) return res.status(400).json({ error: 'Невалідний payment intent id' });
    runStripe(['payment_intents', 'confirm', id, '--payment-method=pm_card_visa'], res);
});

app.post('/api/payment/fail', (req, res) => {
    const { id } = req.body;
    if (!isSafeId(id)) return res.status(400).json({ error: 'Невалідний payment intent id' });
    runStripe(['payment_intents', 'confirm', id, '--payment-method=pm_card_chargeDeclined'], res);
});

app.post('/api/payment/refund', (req, res) => {
    const { id } = req.body;
    if (!isSafeId(id)) return res.status(400).json({ error: 'Невалідний payment intent id' });
    runStripe(['refunds', 'create', `--payment-intent=${id}`], res);
});

app.listen(PORT, () => {
    console.log(`Stripe dev tool running: http://localhost:${PORT}`);
});
