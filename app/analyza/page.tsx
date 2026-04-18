"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type SeasonName = "Jaro" | "Leto" | "Podzim" | "Zima";

type SeasonMeta = {
  label: SeasonName;
  months: number[];
};

const MONTH_NAMES = [
  "Leden",
  "Unor",
  "Brezen",
  "Duben",
  "Kveten",
  "Cerven",
  "Cervenec",
  "Srpen",
  "Zari",
  "Rijen",
  "Listopad",
  "Prosinec",
] as const;

const WEEKDAY_NAMES = ["Po", "Ut", "St", "Ct", "Pa", "So", "Ne"] as const;

const SEASONS: SeasonMeta[] = [
  { label: "Jaro", months: [2, 3, 4] },
  { label: "Leto", months: [5, 6, 7] },
  { label: "Podzim", months: [8, 9, 10] },
  { label: "Zima", months: [11, 0, 1] },
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTopGameName(posts: GamePost[]) {
  const counts = new Map<string, number>();

  for (const post of posts) {
    counts.set(post.gameTitle, (counts.get(post.gameTitle) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { game: "-", count: 0 };
  }

  return { game: sorted[0][0], count: sorted[0][1] };
}

export default function AnalysisPage() {
  const [posts, setPosts] = useState<GamePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedYearRankIndex, setSelectedYearRankIndex] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    slides: { src: string; title: string }[];
    index: number;
  } | null>(null);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await fetch("/api/posts", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Nepodarilo se nacist analyzu.");
        }

        const data = (await response.json()) as { posts?: GamePost[] };
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch {
        setErrorMessage("Data pro analyzu se nepodarilo nacist.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadPosts();
  }, []);

  const yearRanking = useMemo(() => {
    const perYear = new Map<number, number>();

    for (const post of posts) {
      const year = new Date(post.createdAt).getFullYear();
      perYear.set(year, (perYear.get(year) || 0) + 1);
    }

    return [...perYear.entries()]
      .sort((a, b) => {
        if (b[1] === a[1]) {
          return b[0] - a[0];
        }

        return b[1] - a[1];
      })
      .map(([year, count]) => ({ year, count }));
  }, [posts]);

  const selectedYear =
    yearRanking.length > 0
      ? yearRanking[Math.min(selectedYearRankIndex, yearRanking.length - 1)]
          .year
      : new Date().getFullYear();

  const selectedYearPosts = useMemo(
    () =>
      posts.filter(
        (post) => new Date(post.createdAt).getFullYear() === selectedYear,
      ),
    [posts, selectedYear],
  );

  const monthAnalytics = useMemo(
    () =>
      MONTH_NAMES.map((monthLabel, monthIndex) => {
        const monthPosts = selectedYearPosts.filter(
          (post) => new Date(post.createdAt).getMonth() === monthIndex,
        );

        const topGame = getTopGameName(monthPosts);

        return {
          monthLabel,
          total: monthPosts.length,
          topGame,
        };
      }),
    [selectedYearPosts],
  );

  const seasonAnalytics = useMemo(
    () =>
      SEASONS.map((season) => {
        const seasonPosts = selectedYearPosts.filter((post) => {
          const month = new Date(post.createdAt).getMonth();
          return season.months.includes(month);
        });

        return {
          label: season.label,
          total: seasonPosts.length,
          topGame: getTopGameName(seasonPosts),
        };
      }),
    [selectedYearPosts],
  );

  const calendarMap = useMemo(() => {
    const map = new Map<string, GamePost[]>();

    for (const post of selectedYearPosts) {
      const postDate = new Date(post.createdAt);
      if (postDate.getMonth() !== selectedMonth) {
        continue;
      }

      const key = localDateKey(postDate);
      const bucket = map.get(key) || [];
      bucket.push(post);
      map.set(key, bucket);
    }

    return map;
  }, [selectedYearPosts, selectedMonth]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    // Convert JS weekday (Sun=0) to Monday-first index.
    const offset = (firstDay.getDay() + 6) % 7;

    const cells: Array<number | null> = [];
    for (let i = 0; i < offset; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [selectedYear, selectedMonth]);

  const selectedDayPosts = useMemo(() => {
    if (!selectedDayKey) {
      return [];
    }

    const list = calendarMap.get(selectedDayKey) || [];
    return [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [calendarMap, selectedDayKey]);

  const selectedYearRankPosition = Math.min(
    selectedYearRankIndex + 1,
    Math.max(yearRanking.length, 1),
  );

  const openPostLightbox = (post: GamePost, index: number) => {
    setLightbox({
      slides: post.images.map((imageSrc, imageIndex) => ({
        src: imageSrc,
        title: `${post.gameTitle} - ${imageIndex + 1}/${post.images.length}`,
      })),
      index,
    });
  };

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>analyza timeline</p>
            <h1>Herni prehled podle obdobi roku</h1>
            <p>
              Sleduj nejhranejsi hry po mesicich, porovnej sezony a vyber
              konkretni den v kalendari pro detail prispevku.
            </p>
          </div>
          <Link href="/" className={styles.backLink}>
            Zpet na timeline
          </Link>
        </section>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <section className={styles.yearSwitcher}>
          <h2>Roky podle poctu zaznamu</h2>
          <div className={styles.yearControls}>
            <button
              type="button"
              disabled={selectedYearRankIndex <= 0}
              onClick={() => {
                setSelectedDayKey(null);
                setSelectedYearRankIndex((current) => Math.max(current - 1, 0));
              }}
            >
              Predchozi rok
            </button>
            <p>
              <strong>{selectedYear}</strong>
              <span>
                Rank {selectedYearRankPosition}/
                {Math.max(yearRanking.length, 1)}
              </span>
            </p>
            <button
              type="button"
              disabled={selectedYearRankIndex >= yearRanking.length - 1}
              onClick={() => {
                setSelectedDayKey(null);
                setSelectedYearRankIndex((current) =>
                  Math.min(current + 1, yearRanking.length - 1),
                );
              }}
            >
              Dalsi rok
            </button>
          </div>
          <div className={styles.yearChips}>
            {yearRanking.map((yearStat, index) => (
              <button
                key={yearStat.year}
                type="button"
                className={
                  index === selectedYearRankIndex ? styles.chipActive : ""
                }
                onClick={() => {
                  setSelectedDayKey(null);
                  setSelectedYearRankIndex(index);
                }}
              >
                {yearStat.year} ({yearStat.count})
              </button>
            ))}
            {!isLoading && yearRanking.length === 0 && <p>Zatim bez dat.</p>}
          </div>
        </section>

        <section className={styles.analyticsGrid}>
          <article className={styles.analyticsCard}>
            <h3>Nejhranejsi hra podle mesicu</h3>
            <ul>
              {monthAnalytics.map((month) => (
                <li key={month.monthLabel}>
                  <span>{month.monthLabel}</span>
                  <strong>{month.topGame.game}</strong>
                  <small>{month.total} zaznamu</small>
                </li>
              ))}
            </ul>
          </article>

          <article className={styles.analyticsCard}>
            <h3>Sezonalni prehled</h3>
            <ul>
              {seasonAnalytics.map((season) => (
                <li key={season.label}>
                  <span>{season.label}</span>
                  <strong>{season.topGame.game}</strong>
                  <small>{season.total} zaznamu</small>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className={styles.calendarSection}>
          <div className={styles.calendarTop}>
            <h2>Kalendar prispevku</h2>
            <div className={styles.monthControls}>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null);
                  setSelectedMonth((current) => (current + 11) % 12);
                }}
              >
                Predchozi mesic
              </button>
              <p>{MONTH_NAMES[selectedMonth]}</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null);
                  setSelectedMonth((current) => (current + 1) % 12);
                }}
              >
                Dalsi mesic
              </button>
            </div>
          </div>

          <div className={styles.calendarGrid}>
            {WEEKDAY_NAMES.map((name) => (
              <span key={name} className={styles.weekday}>
                {name}
              </span>
            ))}
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return (
                  <span key={`empty-${idx}`} className={styles.dayEmpty} />
                );
              }

              const date = new Date(selectedYear, selectedMonth, day);
              const key = localDateKey(date);
              const count = (calendarMap.get(key) || []).length;
              const isSelected = selectedDayKey === key;

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.dayCell} ${isSelected ? styles.dayCellActive : ""}`}
                  onClick={() => setSelectedDayKey(key)}
                >
                  <span>{day}</span>
                  <small>{count > 0 ? `${count}x` : "-"}</small>
                </button>
              );
            })}
          </div>

          <div className={styles.dayDetail}>
            <h3>
              {selectedDayKey
                ? `Prispevky pro ${selectedDayKey}`
                : "Vyber den v kalendari"}
            </h3>

            {!selectedDayKey && (
              <p>Klikni na den v kalendari a uvidis konkretni prispevky.</p>
            )}

            {selectedDayKey && selectedDayPosts.length === 0 && (
              <p>Pro tento den zatim nejsou zadne prispevky.</p>
            )}

            <ul>
              {selectedDayPosts.map((post) => (
                <li key={post.id} className={styles.dayPostCard}>
                  <div className={styles.dayPostHead}>
                    <div>
                      <strong>{post.gameTitle}</strong>
                      <small>
                        {new Intl.DateTimeFormat("cs-CZ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(post.createdAt))}
                      </small>
                    </div>
                    <p>{post.images.length} fotek</p>
                  </div>

                  <div className={styles.dayPostPreviewGrid}>
                    {post.images.slice(0, 6).map((imageSrc, imageIndex) => {
                      const showMoreLabel =
                        imageIndex === 5 && post.images.length > 6;

                      return (
                        <figure key={`${post.id}-preview-${imageIndex}`}>
                          <button
                            type="button"
                            onClick={() => openPostLightbox(post, imageIndex)}
                            aria-label={`Otevrit fotku ${imageIndex + 1} ze hry ${post.gameTitle}`}
                          >
                            <Image
                              src={imageSrc}
                              alt={`${post.gameTitle} foto ${imageIndex + 1}`}
                              fill
                              sizes="(max-width: 700px) 45vw, 220px"
                              unoptimized
                            />
                            {showMoreLabel && (
                              <figcaption>+{post.images.length - 6}</figcaption>
                            )}
                          </button>
                        </figure>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
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
