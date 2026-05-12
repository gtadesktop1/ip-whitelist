const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');

const proxy = httpProxy.createProxyServer({});
const GIST_URL = "https://gist.githubusercontent.com/gtadesktop1/8a31394fb00ddee15af6176caab86c2e/raw";
const TARGET_NGROK = "https://ngrok-free.dev";

let whitelist = [];

// Alle 5 Min IPs laden
async function updateWhitelist() {
    try {
        const response = await axios.get(`${GIST_URL}?cb=${Date.now()}`);
        whitelist = response.data.split('\n').map(ip => ip.trim()).filter(ip => ip);
        console.log("Whitelist aktualisiert:", whitelist);
    } catch (e) { console.error("Gist Fehler", e); }
}
setInterval(updateWhitelist, 300000);
updateWhitelist();

http.createServer((req, res) => {
    // IP von Render/Cloudflare Header holen
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    if (whitelist.includes(clientIp)) {
        proxy.web(req, res, { target: TARGET_NGROK, changeOrigin: true });
    } else {
        res.writeHead(403);
        res.end("🛡️ SHIELD TITAN OS: Access Denied. IP not whitelisted.");
    }
}).listen(process.env.PORT || 3000);
