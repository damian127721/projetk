"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type GamePost = {
  id: string;
  gameTitle: string;
  createdAt: string;
  images: string[];
};

function formatDateLabel(isoDate: string) {
  const date = new Date(isoDate);

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function Home() {
  const [posts, setPosts] = useState<GamePost[]>([]);
  const [gameTitle, setGameTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: string[];
    gameTitle: string;
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (!gameTitle.trim()) {
      setErrorMessage("Vypln nazev hry.");
      return;
    }

    if (selectedFiles.length === 0) {
      setErrorMessage("Pridat alespon jednu fotku je povinne.");
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append("gameTitle", gameTitle.trim());
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
    setLightbox({ images: post.images, gameTitle: post.gameTitle, index });
  };

  const closeLightbox = () => {
    setLightbox(null);
  };

  const shiftLightbox = (direction: 1 | -1) => {
    setLightbox((current) => {
      if (!current) {
        return current;
      }

      const nextIndex =
        (current.index + direction + current.images.length) %
        current.images.length;

      return { ...current, index: nextIndex };
    });
  };

  useEffect(() => {
    if (!lightbox) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
      }

      if (event.key === "ArrowLeft") {
        shiftLightbox(-1);
      }

      if (event.key === "ArrowRight") {
        shiftLightbox(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.kicker}>discord gaming timeline</p>
          <h1>Game Moments Hub</h1>
          <p>
            Pridej nazev hry a fotky. Jakmile je fotek vic, system je
            automaticky slozi do kolaze a vlozi nahoru do feedu podle aktualniho
            data.
          </p>
        </section>

        <section className={styles.composerCard}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label htmlFor="title">Nazev hry</label>
            <input
              id="title"
              type="text"
              value={gameTitle}
              onChange={(event) => setGameTitle(event.target.value)}
              placeholder="napr. Helldivers 2"
              maxLength={80}
            />

            <label htmlFor="photos">Fotky ze session</label>
            <input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setSelectedFiles(files);
              }}
            />

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
            <p>Dnesek je vzdy nahore, starsi prispevky najdes nize.</p>
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
                    <h3>{post.gameTitle}</h3>
                    <time dateTime={post.createdAt}>
                      {formatDateLabel(post.createdAt)}
                    </time>
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

      {lightbox && (
        <div className={styles.lightbox} role="dialog" aria-modal="true">
          <button
            type="button"
            className={styles.lightboxBackdrop}
            onClick={closeLightbox}
            aria-label="Zavrit nahled"
          />

          <div className={styles.lightboxPanel}>
            <header>
              <p>{lightbox.gameTitle}</p>
              <button type="button" onClick={closeLightbox}>
                Zavrit
              </button>
            </header>

            <div className={styles.lightboxImageWrap}>
              <Image
                src={lightbox.images[lightbox.index]}
                alt={`${lightbox.gameTitle} screenshot ${lightbox.index + 1}`}
                fill
                sizes="90vw"
                unoptimized
              />
            </div>

            <footer>
              <button type="button" onClick={() => shiftLightbox(-1)}>
                Predchozi
              </button>
              <span>
                {lightbox.index + 1} / {lightbox.images.length}
              </span>
              <button type="button" onClick={() => shiftLightbox(1)}>
                Dalsi
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
