import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3001);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(response, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(base, normalized);
}

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname === "/" ? "/plus-preview" : url.pathname;

  if (pathname === "/plus-preview" || pathname === "/plus-preview/") {
    sendFile(response, join(root, ".next", "server", "app", "plus-preview.html"));
    return;
  }

  if (pathname.startsWith("/_next/static/")) {
    sendFile(response, safeJoin(join(root, ".next", "static"), pathname.replace("/_next/static/", "")));
    return;
  }

  if (pathname.startsWith("/avatars/")) {
    sendFile(response, safeJoin(join(root, "public", "avatars"), pathname.replace("/avatars/", "")));
    return;
  }

  if (pathname.startsWith("/favicon") || pathname.endsWith(".png") || pathname.endsWith(".svg")) {
    sendFile(response, safeJoin(join(root, "public"), pathname.slice(1)));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}).listen(port, "0.0.0.0", () => {
  console.log(`DeepTutor Plus static preview: http://127.0.0.1:${port}/plus-preview`);
});
