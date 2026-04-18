import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GamePost = {
  id: string;
  gameTitle: string;
  createdAt: string;
  images: string[];
};

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
]);

function extensionFromFile(file: File) {
  const byName = file.name?.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (byName && allowedExtensions.has(byName)) {
    return byName;
  }

  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/gif") return ".gif";
  if (file.type === "image/avif") return ".avif";
  return ".jpg";
}

export async function GET() {
  try {
    const { data: posts, error: postsError } = await supabase
      .from("game_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postsError) {
      throw postsError;
    }

    const postsWithImages: GamePost[] = [];

    for (const post of posts ?? []) {
      const { data: images, error: imagesError } = await supabase
        .from("post_images")
        .select("image_url")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });

      if (!imagesError) {
        postsWithImages.push({
          id: post.id,
          gameTitle: post.game_title,
          createdAt: post.created_at,
          images: (images ?? []).map((img) => img.image_url),
        });
      }
    }

    return Response.json({ posts: postsWithImages });
  } catch (err) {
    console.error("GET /api/posts error:", err);
    return Response.json(
      { error: "Chyba pri nacitani clanku." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rawGameTitle = formData.get("gameTitle");

    if (typeof rawGameTitle !== "string" || !rawGameTitle.trim()) {
      return Response.json(
        { error: "Nazev hry je povinny." },
        { status: 400 },
      );
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

    // Insert post record
    const { data: postData, error: postError } = await supabase
      .from("game_posts")
      .insert({ game_title: rawGameTitle.trim() })
      .select()
      .single();

    if (postError || !postData) {
      throw postError || new Error("Failed to create post");
    }

    const imageUrls: string[] = [];

    // Upload images and create records
    for (const photo of photos) {
      const bytes = await photo.arrayBuffer();
      const fileBuffer = Buffer.from(bytes);
      const fileName = `${Date.now()}-${crypto.randomUUID()}${extensionFromFile(photo)}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("game-images")
        .upload(fileName, fileBuffer, {
          contentType: photo.type,
        });

      if (uploadError || !uploadData) {
        throw uploadError || new Error("Failed to upload image");
      }

      const { data: publicUrlData } = supabase.storage
        .from("game-images")
        .getPublicUrl(fileName);

      imageUrls.push(publicUrlData.publicUrl);

      // Insert image record
      await supabase.from("post_images").insert({
        post_id: postData.id,
        image_url: publicUrlData.publicUrl,
      });
    }

    const post: GamePost = {
      id: postData.id,
      gameTitle: postData.game_title,
      createdAt: postData.created_at,
      images: imageUrls,
    };

    return Response.json({ post }, { status: 201 });
  } catch (err) {
    console.error("POST /api/posts error:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Chyba pri ukladani prispevku.",
      },
      { status: 500 },
    );
  }
}
