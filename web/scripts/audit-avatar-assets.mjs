import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const avatarDir = path.join(root, "public", "avatars", "glb");
const registryPath = path.join(
  root,
  "app",
  "components",
  "avatar",
  "avatarAssets.ts",
);

function readAnimationRegistry() {
  const source = readFileSync(registryPath, "utf8");
  const entries = new Map();
  const objectPattern = /\{\s*id:\s*"([^"]+)"[\s\S]*?state:\s*"([^"]+)"[\s\S]*?url:\s*"\/avatars\/glb\/([^"]+)"[\s\S]*?\}/g;
  let match;

  while ((match = objectPattern.exec(source))) {
    const [, id, state, file] = match;
    entries.set(file, {
      id,
      state,
      default: match[0].includes("defaultForState: true"),
    });
  }

  return entries;
}

function readGlbJson(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`${filePath} is not a GLB file`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

function walkGlbFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkGlbFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".glb") ? [fullPath] : [];
  });
}

const registry = readAnimationRegistry();

const rows = walkGlbFiles(avatarDir).map((filePath) => {
  const file = path.relative(avatarDir, filePath).replaceAll(path.sep, "/");
  const json = readGlbJson(filePath);
  const meshes = json.meshes ?? [];
  const registryEntry = registry.get(file);
  const morphTargetCount = meshes.reduce((count, mesh) => {
    return (
      count +
      (mesh.primitives ?? []).reduce((primitiveCount, primitive) => {
        return primitiveCount + (primitive.targets?.length ?? 0);
      }, 0)
    );
  }, 0);

  return {
    file,
    sizeKB: Math.round(statSync(filePath).size / 1024),
    nodes: json.nodes?.length ?? 0,
    meshes: meshes.length,
    skins: json.skins?.length ?? 0,
    animations: json.animations?.length ?? 0,
    morphTargets: morphTargetCount,
    registry: registryEntry?.id ?? "",
    state: registryEntry?.state ?? "",
    default: registryEntry?.default ? "yes" : "",
  };
});

console.table(rows);
