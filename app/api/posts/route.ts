import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GamePost = {
  id: string;
  gameTitle: string;
  createdAt: string;
  images: string[];
};

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(process.cwd(), "public", "uploads");
const postsFilePath = path.join(dataDir, "posts.json");

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
]);

async function ensureStorage() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
}

async function readPosts(): Promise<GamePost[]> {
  await ensureStorage();

  try {
    const raw = await readFile(postsFilePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((post): post is GamePost => {
      return (
        typeof post === "object" &&
        post !== null &&
        typeof (post as GamePost).id === "string" &&
        typeof (post as GamePost).gameTitle === "string" &&
        typeof (post as GamePost).createdAt === "string" &&
        Array.isArray((post as GamePost).images)
      );
    });
  } catch {
    return [];
  }
}

async function writePosts(posts: GamePost[]) {
  await ensureStorage();

  const tempPath = `${postsFilePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(posts, null, 2), "utf-8");
  await rename(tempPath, postsFilePath);
}

function extensionFromFile(file: File) {
  const byName = path.extname(file.name || "").toLowerCase();

  if (allowedExtensions.has(byName)) {
    return byName;
  }

  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/gif") return ".gif";
  if (file.type === "image/avif") return ".avif";
  return ".jpg";
}

export async function GET() {
  const posts = await readPosts();
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return Response.json({ posts: sortedPosts });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawGameTitle = formData.get("gameTitle");

  if (typeof rawGameTitle !== "string" || !rawGameTitle.trim()) {
    return Response.json({ error: "Nazev hry je povinny." }, { status: 400 });
  }

  const photos = formData
    .getAll("photos")
    .filter((item): item is File => item instanceof File);

  if (photos.length === 0) {
    return Response.json(
      { error: "Alespon jedna fotka je povinna." },
      { status: 400 },
    );
  }

  await ensureStorage();

  const imageUrls: string[] = [];

  for (const photo of photos) {
    const bytes = await photo.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);
    const fileName = `${Date.now()}-${crypto.randomUUID()}${extensionFromFile(photo)}`;
    const filePath = path.join(uploadsDir, fileName);

    await writeFile(filePath, fileBuffer);
    imageUrls.push(`/uploads/${fileName}`);
  }

  const post: GamePost = {
    id: crypto.randomUUID(),
    gameTitle: rawGameTitle.trim(),
    createdAt: new Date().toISOString(),
    images: imageUrls,
  };

  const currentPosts = await readPosts();
  const updatedPosts = [post, ...currentPosts];
  await writePosts(updatedPosts);

  return Response.json({ post }, { status: 201 });
}
