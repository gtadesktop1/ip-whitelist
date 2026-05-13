const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');

const proxy = httpProxy.createProxyServer({});
const GIST_URL = "githubusercontent.com";
const TARGET_NGROK = "ngrok-free.dev";

let whitelist = [];

// Alle 5 Min IPs laden
async function updateWhitelist() {
    try {
        const response = await axios.get(`${GIST_URL}?cb=${Date.now()}`);
        // Entfernt Whitespaces und filtert leere Zeilen
        whitelist = response.data.split('\n').map(ip => ip.trim()).filter(ip => ip);
        console.log("Whitelist aktualisiert:", whitelist);
    } catch (e) { 
        console.error("Gist Fehler beim Laden:", e); 
    }
}
setInterval(updateWhitelist, 300000);
updateWhitelist();

http.createServer((req, res) => {
    // 1. Richtigen Header für UTF-8 setzen (behebt die komischen Zeichen)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // 2. IP-Adresse sauber extrahieren
    let clientIp = '';
    const forwardedFor = req.headers['x-forwarded-for'];
    
    if (forwardedFor) {
        // Nimmt die erste IP aus der Kette und entfernt Leerzeichen
        clientIp = forwardedFor.split(',')[0].trim();
    } else {
        clientIp = req.socket.remoteAddress;
    }

    // Konsolen-Log auf Render, damit du im Dashboard siehst, welche IP ankommt
    console.log(`Anfrage von IP: [${clientIp}]`);

    // 3. IP-Prüfung (prüft exakten Match)
    if (whitelist.includes(clientIp)) {
        proxy.web(req, res, { target: TARGET_NGROK, changeOrigin: true });
    } else {
        res.writeHead(403);
        res.end(`🛡️ SHIELD TITAN OS: Zugriff verweigert.<br>Deine IP ist nicht freigeschaltet: <b>${clientIp}</b>`);
    }
}).listen(process.env.PORT || 3000);
