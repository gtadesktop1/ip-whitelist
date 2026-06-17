const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');
const net = require('net');
const url = require('url');

const proxy = httpProxy.createProxyServer({});

// WICHTIG: Pufferung abschalten für Streaming
proxy.on('proxyRes', function (proxyRes, req, res) {
    const contentType = proxyRes.headers['content-type'] || '';
    
    // Zwinge den Browser zu glauben, dass es KEIN Video ist
    if (contentType.includes('audio') || contentType.includes('mpeg')) {
        proxyRes.headers['content-type'] = 'audio/mpeg'; // MP3 erzwingen
        proxyRes.headers['x-content-type-options'] = 'nosniff';
        proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
        proxyRes.headers['connection'] = 'keep-alive';
        
        // Entferne alles, was den Browser verwirren könnte
        delete proxyRes.headers['content-length'];
        delete proxyRes.headers['transfer-encoding'];
    }
});

const GIST_URL = "https://githubusercontent.com";

// Die reine Domain ohne Zugangsdaten
const NGROK_DOMAIN = "https://ngrok-free.dev";
const ngrokUrl = url.parse(NGROK_DOMAIN);
const NGROK_HOST = ngrokUrl.hostname;

// Deine 50-Zeichen-Strings für Basic Auth
const USERNAME = "oI493HHYNPZXcxlAGClDrwmhID3xFJRbrWzeYBsMabgcqqDuZL";
const PASSWORD = "ql21AgNSJFHxh1aQAqy873ADT3MNExUurNDJTbP7vOf1zOtFJN";

// Vorbereiten des Authorization Headers (Base64)
const authHeader = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

let whitelist = [];
let isUpdating = false;

// Sichere Update-Funktion für die IP-Whitelist
async function updateWhitelist() {
    if (isUpdating) return;
    isUpdating = true;
    try {
        const response = await axios.get(`${GIST_URL}?nocache=${Date.now()}`, { timeout: 5000 });
        if (response.data) {
            whitelist = response.data.split('\n')
                .map(ip => ip.replace('\r', '').trim())
                .filter(ip => ip.length > 0);
            
            console.log(`[${new Date().toISOString()}] Whitelist aktualisiert. Einträge:`, whitelist);
        }
    } catch (e) { 
        console.error("Fehler beim Laden des Gists:", e.message); 
    } finally {
        isUpdating = false;
    }
}

// Intervall auf 30 Sekunden gesetzt (dein Intervall-Wert)
setInterval(updateWhitelist, 30000);
// Start-Verzögerung
setTimeout(updateWhitelist, 2000);

// Event-Listener hinzufügen, der den Request-Body für den Proxy fixiert,
// bevor er an ngrok geschickt wird (behebt leere Datei-Uploads)
proxy.on('proxyReq', function(proxyReq, req, res, options) {
    if (req.body) {
        let bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
    }
});

// HTTP-Server Instanz erstellen
const server = http.createServer((req, res) => {
    // IP-Adresse extrahieren
    let clientIp = '';
    const forwardedFor = req.headers['x-forwarded-for'];
    
    if (forwardedFor) {
        clientIp = forwardedFor.split(',')[0].trim();
    } else {
        clientIp = req.socket.remoteAddress;
    }

    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }

    console.log(`Anfrage von IP: [${clientIp}] für Pfad: [${req.url}]`);

    // Abgleich gegen die Whitelist für reguläre HTTP-Web-Anfragen
    if (whitelist.includes(clientIp)) {
        proxy.web(req, res, { 
            target: NGROK_DOMAIN, 
            changeOrigin: true,
            headers: {
                "Authorization": authHeader,
                "ngrok-skip-browser-warning": "true",
                "X-Protected": "True"
            }
        }, (err) => {
            console.error("Proxy-Fehler zu ngrok:", err.message);
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end("🛡️ SHIELD TITAN OS: ngrok Tunnel nicht erreichbar.");
        });
    } else {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`🛡️ SHIELD TITAN OS: Zugriff verweigert.<br>Deine IP ist nicht freigeschaltet: <b>${clientIp}</b>`);
    }
});

// === TITAN TCP TUNNEL UPGRADE ===
// Fängt HTTP-CONNECT Anfragen (wie von openssl oder nc per ProxyCommand) ab
server.on('connect', (req, clientSocket, head) => {
    let clientIp = '';
    const forwardedFor = req.headers['x-forwarded-for'];
    
    if (forwardedFor) {
        clientIp = forwardedFor.split(',')[0].trim();
    } else {
        clientIp = clientSocket.remoteAddress;
    }

    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }

    console.log(`[CONNECT-SSH] Tunnel-Anfrage von IP: [${clientIp}]`);

    // Sicherheits-Check für den SSH-Tunnel gegen deine Whitelist
    if (!whitelist.includes(clientIp)) {
        console.log(`[CONNECT-SSH] Blockiert: IP [${clientIp}] steht nicht auf der Whitelist.`);
        clientSocket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n🛡️ SHIELD TITAN OS: IP nicht freigeschaltet.');
        clientSocket.end();
        return;
    }

    // Wenn IP whitelisted ist: Baue die rohe TCP-Pipeline zu ngrok auf (Port 443 für HTTPS)
    const targetPort = ngrokUrl.protocol === 'https:' ? 443 : 80;
    const serverSocket = net.connect(targetPort, NGROK_HOST, () => {
        // Dem lokalen SSH-Client signalisieren, dass der Tunnel steht
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        
        // Die Protokoll-Header manuell in den Socket injizieren, damit ngrok uns durchlässt
        // Verwendet deine echten 50-Zeichen Basic-Auth-Variablen
        serverSocket.write(`CONNECT ${ngrokUrl.host}:443 HTTP/1.1\r\n`);
        serverSocket.write(`Host: ${ngrokUrl.host}\r\n`);
        serverSocket.write(`Authorization: ${authHeader}\r\n`);
        serverSocket.write(`ngrok-skip-browser-warning: true\r\n\r\n`);
        
        // Eventuell im Puffer verbliebene Daten sofort nachschieben
        if (head && head.length > 0) serverSocket.write(head);

        // Daten im Kreis streamen – Asynchrones Socket-Streaming
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
        console.error("Tunnel-Verbindungsfehler zu ngrok:", err.message);
        clientSocket.end();
    });
    
    clientSocket.on('error', () => serverSocket.end());
    clientSocket.on('close', () => serverSocket.end());
});

// Server an den Port binden
server.listen(process.env.PORT || 3000, () => {
    console.log("SHIELD Proxy läuft auf Port", process.env.PORT || 3000);
});
