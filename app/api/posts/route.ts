import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GamePost = {
  id: string;
  gameTitle: string;
  createdAt: string;
  images: string[];
};

type StoredImage = {
  filePath: string;
  publicUrl: string;
};

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
]);

const allowedGameTitles = new Set([
  "League of Legends",
  "Goose Goose Duck",
  "Brawlhalla",
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

async function cleanupUploadedImages(images: StoredImage[]) {
  if (images.length === 0) {
    return;
  }

  const supabaseServer = getSupabaseServerClient();
  await supabaseServer.storage
    .from("game-images")
    .remove(images.map((image) => image.filePath));
}

function storagePathFromPublicUrl(url: string) {
  const marker = "/storage/v1/object/public/game-images/";
  const markerIndex = url.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const pathPart = url.slice(markerIndex + marker.length);
  return decodeURIComponent(pathPart);
}

export async function GET() {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { data: posts, error: postsError } = await supabaseServer
      .from("game_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postsError) {
      throw postsError;
    }

    const postsWithImages: GamePost[] = [];

    for (const post of posts ?? []) {
      const { data: images, error: imagesError } = await supabaseServer
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
    const supabaseServer = getSupabaseServerClient();
    const formData = await request.formData();
    const rawGameTitle = formData.get("gameTitle");
    const normalizedGameTitle =
      typeof rawGameTitle === "string" ? rawGameTitle.trim() : "";

    if (!allowedGameTitles.has(normalizedGameTitle)) {
      return Response.json(
        { error: "Vyber validni hru ze seznamu." },
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

    const uploadBatchId = crypto.randomUUID();
    const uploadedImages: StoredImage[] = [];

    // Upload all images first, so we do not create text-only posts on failure.
    for (const photo of photos) {
      const bytes = await photo.arrayBuffer();
      const fileBuffer = Buffer.from(bytes);
      const fileName = `${Date.now()}-${crypto.randomUUID()}${extensionFromFile(photo)}`;
      const filePath = `${uploadBatchId}/${fileName}`;

      const { error: uploadError, data: uploadData } =
        await supabaseServer.storage
          .from("game-images")
          .upload(filePath, fileBuffer, {
            contentType: photo.type,
          });

      if (uploadError || !uploadData) {
        await cleanupUploadedImages(uploadedImages);
        return Response.json(
          {
            error:
              uploadError?.message ||
              "Upload fotek selhal. Zkontroluj Storage policy pro bucket game-images.",
          },
          { status: 400 },
        );
      }

      const { data: publicUrlData } = supabaseServer.storage
        .from("game-images")
        .getPublicUrl(filePath);

      uploadedImages.push({
        filePath,
        publicUrl: publicUrlData.publicUrl,
      });
    }

    // Create post only after images are uploaded.
    const { data: postData, error: postError } = await supabaseServer
      .from("game_posts")
      .insert({ game_title: normalizedGameTitle })
      .select()
      .single();

    if (postError || !postData) {
      await cleanupUploadedImages(uploadedImages);
      throw postError || new Error("Failed to create post");
    }

    const { error: imageRowsError } = await supabaseServer
      .from("post_images")
      .insert(
        uploadedImages.map((image) => ({
          post_id: postData.id,
          image_url: image.publicUrl,
        })),
      );

    if (imageRowsError) {
      await supabaseServer.from("game_posts").delete().eq("id", postData.id);
      await cleanupUploadedImages(uploadedImages);
      throw imageRowsError;
    }

    const post: GamePost = {
      id: postData.id,
      gameTitle: postData.game_title,
      createdAt: postData.created_at,
      images: uploadedImages.map((image) => image.publicUrl),
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

export async function DELETE(request: Request) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const requestUrl = new URL(request.url);
    const postId = requestUrl.searchParams.get("id");

    if (!postId) {
      return Response.json({ error: "Chybi id prispevku." }, { status: 400 });
    }

    const { data: imageRows, error: imageRowsError } = await supabaseServer
      .from("post_images")
      .select("image_url")
      .eq("post_id", postId);

    if (imageRowsError) {
      throw imageRowsError;
    }

    const { error: deletePostError } = await supabaseServer
      .from("game_posts")
      .delete()
      .eq("id", postId);

    if (deletePostError) {
      throw deletePostError;
    }

    const storagePaths = (imageRows ?? [])
      .map((row) => storagePathFromPublicUrl(row.image_url))
      .filter((value): value is string => Boolean(value));

    if (storagePaths.length > 0) {
      const { error: removeStorageError } = await supabaseServer.storage
        .from("game-images")
        .remove(storagePaths);

      if (removeStorageError) {
        console.error(
          "DELETE /api/posts storage cleanup error:",
          removeStorageError,
        );
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/posts error:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Chyba pri mazani prispevku.",
      },
      { status: 500 },
    );
  }
}
