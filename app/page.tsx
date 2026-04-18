"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import styles from "./page.module.css";

type GamePost = {
  id: string;
  gameTitle: string;
  createdAt: string;
  images: string[];
};

const ALLOWED_GAMES = [
  "League of Legends",
  "Goose Goose Duck",
  "Brawlhalla",
] as const;

function formatDateLabel(isoDate: string) {
  const date = new Date(isoDate);

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function Home() {
  const fileInputId = useId();
  const [posts, setPosts] = useState<GamePost[]>([]);
  const [gameTitle, setGameTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lightbox, setLightbox] = useState<{
    slides: { src: string; title: string }[];
    index: number;
  } | null>(null);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await fetch("/api/posts", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nepodarilo se nacist timeline.");
        }

        const data = (await response.json()) as { posts?: GamePost[] };
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch {
        setErrorMessage("Timeline se nepodarilo nacist. Obnov stranku.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadPosts();
  }, []);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );

  const totalPhotos = useMemo(
    () => posts.reduce((sum, post) => sum + post.images.length, 0),
    [posts],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (!gameTitle) {
      setErrorMessage("Vyber hru ze seznamu.");
      return;
    }

    if (selectedFiles.length === 0) {
      setErrorMessage("Pridat alespon jednu fotku je povinne.");
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append("gameTitle", gameTitle);
      selectedFiles.forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(errorPayload?.error || "Kolaz se nepodarilo vytvorit.");
      }

      const data = (await response.json()) as { post?: GamePost };
      if (!data.post) {
        throw new Error("Kolaz se nepodarilo vytvorit.");
      }

      setPosts((current) => [data.post as GamePost, ...current]);
      setGameTitle("");
      setSelectedFiles([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kolaz se nepodarilo ulozit. Zkus to znovu.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openLightbox = (post: GamePost, index: number) => {
    setLightbox({
      slides: post.images.map((imageSrc, imageIndex) => ({
        src: imageSrc,
        title: `${post.gameTitle} - ${imageIndex + 1}/${post.images.length}`,
      })),
      index,
    });
  };

  const handleDeletePost = async (post: GamePost) => {
    const shouldDelete = window.confirm(
      `Opravdu chces smazat prispevek \"${post.gameTitle}\"? Tuto akci nelze vratit.`,
    );

    if (!shouldDelete) {
      return;
    }

    setErrorMessage("");
    setDeletingPostId(post.id);

    try {
      const response = await fetch(
        `/api/posts?id=${encodeURIComponent(post.id)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          errorPayload?.error || "Prispevek se nepodarilo smazat.",
        );
      }

      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Prispevek se nepodarilo smazat.",
      );
    } finally {
      setDeletingPostId(null);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.kicker}>discord gaming timeline</p>
          <h1>Opičí Klub Fotky</h1>
          <p className={styles.heroLead}>Vše co hrajem, davejte sem fotky.</p>
          <div className={styles.heroActions}>
            <Link href="/analyza" className={styles.analysisLink}>
              Otevrit analyzu her
            </Link>
          </div>
          <div className={styles.heroMetrics}>
            <article className={styles.metricCard}>
              <span>Prispevky</span>
              <strong>{posts.length}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Nahrane fotky</span>
              <strong>{totalPhotos}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Aktivni hry</span>
              <strong>{ALLOWED_GAMES.length}</strong>
            </article>
          </div>
        </section>

        <section className={styles.composerCard}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label htmlFor="title">Nazev hry</label>
            <select
              id="title"
              value={gameTitle}
              onChange={(event) => setGameTitle(event.target.value)}
            >
              <option value="">Vyber hru</option>
              {ALLOWED_GAMES.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>

            <label htmlFor={fileInputId}>Fotky ze session</label>
            <div className={styles.fileUpload}>
              <input
                id={fileInputId}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setSelectedFiles(files);
                }}
              />
              <label htmlFor={fileInputId} className={styles.fileInputTrigger}>
                <span>Vybrat fotky</span>
                <small>PNG, JPG, WEBP, GIF, AVIF</small>
              </label>

              {selectedFiles.length > 0 && (
                <div className={styles.fileList}>
                  {selectedFiles.slice(0, 3).map((file) => (
                    <span key={`${file.name}-${file.size}`}>{file.name}</span>
                  ))}
                  {selectedFiles.length > 3 && (
                    <span>+{selectedFiles.length - 3} dalsi</span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.formFoot}>
              <p>
                {selectedFiles.length > 0
                  ? `Vybrano souboru: ${selectedFiles.length}`
                  : "Nevybrana zadna fotka"}
              </p>
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Vytvarim..." : "Vytvorit prispevek"}
              </button>
            </div>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
          </form>
        </section>

        <section className={styles.timeline}>
          <div className={styles.timelineHead}>
            <h2>Historie hrani</h2>
          </div>

          {!isLoading && sortedPosts.length === 0 && (
            <article className={styles.emptyCard}>
              <h3>Zatim zadne herni momenty</h3>
              <p>Prvni fotokolaz se objevi hned po pridani prispevku.</p>
            </article>
          )}

          {isLoading && (
            <article className={styles.emptyCard}>
              <h3>Nacitam timeline...</h3>
              <p>Chvili strpeni, pripravuji sdilene prispevky.</p>
            </article>
          )}

          <div className={styles.feed}>
            {sortedPosts.map((post, index) => {
              const hasMoreCount = post.images.length > 8;

              return (
                <article
                  key={post.id}
                  className={styles.postCard}
                  style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
                >
                  <header>
                    <div className={styles.postMeta}>
                      <h3>{post.gameTitle}</h3>
                      <time dateTime={post.createdAt}>
                        {formatDateLabel(post.createdAt)}
                      </time>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      disabled={deletingPostId === post.id}
                      onClick={() => {
                        void handleDeletePost(post);
                      }}
                    >
                      {deletingPostId === post.id ? "Mazani..." : "Smazat"}
                    </button>
                  </header>

                  <div
                    className={`${styles.collage} ${
                      post.images.length === 1 ? styles.single : ""
                    }`}
                  >
                    {post.images.slice(0, 8).map((imageSrc, imageIndex) => {
                      const isLastPreview = imageIndex === 7;

                      return (
                        <figure key={`${post.id}-img-${imageIndex}`}>
                          <button
                            type="button"
                            onClick={() => openLightbox(post, imageIndex)}
                            aria-label={`Otevrit fotku ${imageIndex + 1} ze hry ${post.gameTitle}`}
                          >
                            <Image
                              src={imageSrc}
                              alt={`${post.gameTitle} screenshot ${imageIndex + 1}`}
                              fill
                              sizes="(max-width: 700px) 30vw, 110px"
                              unoptimized
                            />
                          </button>
                          {hasMoreCount && isLastPreview && (
                            <figcaption>+{post.images.length - 8}</figcaption>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <Lightbox
        open={Boolean(lightbox)}
        close={() => setLightbox(null)}
        slides={lightbox?.slides ?? []}
        index={lightbox?.index ?? 0}
        plugins={[Zoom, Thumbnails, Captions]}
        captions={{ descriptionTextAlign: "center" }}
        thumbnails={{ position: "bottom", width: 84, height: 52, border: 0 }}
      />
    </div>
  );
}
