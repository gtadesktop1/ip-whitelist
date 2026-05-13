const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');

const proxy = httpProxy.createProxyServer({});
const GIST_URL = "https://gist.githubusercontent.com/gtadesktop1/8a31394fb00ddee15af6176caab86c2e/raw";
const TARGET_NGROK = "https://superrespectably-acquainted-jestine.ngrok-free.dev";

let whitelist = [];
let isUpdating = false;

// Sichere Update-Funktion gegen Überlastung
async function updateWhitelist() {
    if (isUpdating) return;
    isUpdating = true;
    try {
        const response = await axios.get(`${GIST_URL}?nocache=${Date.now()}`, { timeout: 5000 });
        if (response.data) {
            // Bereinigt Leerzeichen, Windows-Zeilenumbrüche (\r) und filtert leere Zeilen
            whitelist = response.data.split('\n')
                .map(ip => ip.replace('\r', '').trim())
                .filter(ip => ip.length > 0);
            
            console.log(`[${new Date().toISOString()}] Whitelist erfolgreich geladen. Einträge:`, whitelist);
        }
    } catch (e) { 
        console.error("Fehler beim Laden des Gists:", e.message); 
    } finally {
        isUpdating = false;
    }
}

// Intervall sauber auf 5 Minuten setzen
setInterval(updateWhitelist, 300000);
// Erststart verzögert ausführen, damit der Server stabil steht
setTimeout(updateWhitelist, 2000);

http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // IP-Adresse sauber extrahieren (Erste IP aus der Kette nutzen)
    let clientIp = '';
    const forwardedFor = req.headers['x-forwarded-for'];
    
    if (forwardedFor) {
        clientIp = forwardedFor.split(',')[0].trim();
    } else {
        clientIp = req.socket.remoteAddress;
    }

    // IPv6-Mapping-Präfix (::ffff:) bei lokalen Tests entfernen
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }

    console.log(`Anfrage von IP: [${clientIp}]`);

    // Abgleich gegen die bereinigte Liste
    if (whitelist.includes(clientIp)) {
        proxy.web(req, res, { target: TARGET_NGROK, changeOrigin: true }, (err) => {
            console.error("Proxy-Fehler zu ngrok:", err.message);
            res.writeHead(502);
            res.end("🛡️ SHIELD TITAN OS: ngrok Tunnel nicht erreichbar.");
        });
    } else {
        res.writeHead(403);
        res.end(`🛡️ SHIELD TITAN OS: Zugriff verweigert.<br>Deine IP ist nicht freigeschaltet: <b>${clientIp}</b>`);
    }
}).listen(process.env.PORT || 3000, () => {
    console.log("Proxy-Server läuft auf Port", process.env.PORT || 3000);
});
