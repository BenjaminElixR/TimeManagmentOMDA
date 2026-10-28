const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.json");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request, response) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      sendJson(response, 413, { error: "Datafila er for stor" });
      request.destroy();
      return null;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${HOST}`).pathname;

  if (request.method === "GET" && pathname === "/api/data") {
    try {
      const contents = await fs.readFile(DATA_FILE, "utf8");
      sendJson(response, 200, JSON.parse(contents));
    } catch (error) {
      if (error.code === "ENOENT") sendJson(response, 200, null);
      else sendJson(response, 500, { error: "Kunne ikke lese data.json" });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/data") {
    try {
      const body = await readRequestBody(request, response);
      if (body === null) return;

      let data;
      try {
        data = JSON.parse(body);
      } catch {
        sendJson(response, 400, { error: "Ugyldig JSON" });
        return;
      }

      if (!data || !Array.isArray(data.categories) || !Array.isArray(data.entries)) {
        sendJson(response, 400, { error: "Data må inneholde kategorier og økter" });
        return;
      }

      const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, DATA_FILE);
      sendJson(response, 200, { saved: true });
    } catch (error) {
      console.error("Kunne ikke lagre data.json:", error);
      sendJson(response, 500, { error: "Kunne ikke lagre data.json" });
    }
    return;
  }

  if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    try {
      const html = await fs.readFile(path.join(ROOT, "index.html"));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(html);
    } catch {
      response.writeHead(500);
      response.end("Kunne ikke lese index.html");
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Ikke funnet");
});

server.listen(PORT, HOST, () => {
  console.log(`Timelogg kjører på http://${HOST}:${PORT}`);
  console.log(`Data lagres i ${DATA_FILE}`);
});