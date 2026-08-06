"use client";

import { useState, useLayoutEffect, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import type { Sculpture } from "../data/sculptures";

// ─── Fixed coverflow constants ────────────────────────────────────────────────
const PHOTO_RATIO  = 0.65;                                   // photo : card height
const TILT         = 52;                                     // rotateY° for side cards
const TILT_COS     = Math.cos(TILT * Math.PI / 180);        // ≈ 0.616
const Z_OFF        = [0, -140, -210, -280] as const;        // translateZ per offset
const SCALES       = [1, 0.82, 0.68, 0.54] as const;       // scale per offset
const OPS          = [1,    1,  0.5,    0] as const;        // opacity per offset

// ─── Gallery routing ──────────────────────────────────────────────────────────
// Titles (lowercase) that belong to House of Stone rather than Slab of Africa.
const HOUSE_OF_STONE_TITLES = new Set([
  "party dress",
  "swallow",
  "traveling mum",
  "proud of my hair",
  "learners",
  "life cycle",
  "imagination",
  "flying birds",
  "torso",
  "watching bird",
  "the ballerina",
  "joyful trio",
  "family time",
  "paired for life",
]);

const MIN_PEEK        = 24;    // minimum px a side card must show on screen
const FRICTION        = 0.978; // velocity multiplier per frame (≈ 2 s deceleration)
const FRAME_MS        = 16.67; // target rAF interval, used to convert px/ms → card-units/frame
const TOUCH_VEL_SCALE = 0.38;  // scales touch release velocity — tune for feel
const SNAP_SPRING     = 0.20;  // spring coefficient for post-momentum card snap

// ─── Responsive dimension calculator ─────────────────────────────────────────
// Called once on mount and on every resize.
// Returns card dimensions and coverflow x-offsets tuned to the current viewport.
function calcDims(vw: number, vh: number) {
  // Card width: at most 80% of viewport width, capped at 340px
  const cardW = Math.min(340, Math.floor(vw * 0.80));

  // Card height: maintain 320:504 aspect ratio, but never overflow the UI chrome.
  // UI chrome = header (~52px) + controls (~72px) + footer (~36px) ≈ 140px total.
  const byAspect   = Math.floor(cardW * (504 / 320));
  const byViewport = vh - 140;
  const cardH      = Math.max(Math.min(byAspect, byViewport, 535), 260);

  // X offsets: scale from desktop values, then clamp so side cards always peek MIN_PEEK px.
  const unit      = cardW / 340;
  const sideHalf  = Math.round(cardW * SCALES[1] * TILT_COS / 2); // half visible-width at ±1
  const maxOff1   = vw / 2 + sideHalf - MIN_PEEK;
  const rawOff1   = 338 * unit;
  const xOff1     = Math.round(Math.min(rawOff1, maxOff1));
  const compress  = rawOff1 > 0 ? xOff1 / rawOff1 : 1;          // compression ratio

  const xOffs = [
    0,
    xOff1,
    Math.round(530 * unit * compress),
    Math.round(625 * unit * compress),
  ] as const;

  return { cardW, cardH, xOffs };
}

// ─── Continuous coverflow card style ─────────────────────────────────────────
// offset is a float (e.g. 0.0 = centred, 1.4 = between slot 1 and 2).
// Linearly interpolates between the discrete lookup tables.
function calcCardStyle(offset: number, xOffs: readonly number[]) {
  const abs = Math.abs(offset);
  if (abs > 3.6) return null;
  const dir = offset < 0 ? -1 : 1;
  const i0  = Math.min(Math.floor(abs), xOffs.length - 1);
  const i1  = Math.min(i0 + 1, xOffs.length - 1);
  const frac = abs - Math.floor(abs);

  const lerp = (a: number, b: number) => a + (b - a) * frac;

  const x       = dir  * lerp(xOffs[i0],   xOffs[i1]);
  const z       =        lerp(Z_OFF[Math.min(i0, Z_OFF.length   - 1)],
                               Z_OFF[Math.min(i1, Z_OFF.length   - 1)]);
  const scale   =        lerp(SCALES[Math.min(i0, SCALES.length - 1)],
                               SCALES[Math.min(i1, SCALES.length - 1)]);
  const opacity = Math.max(0,
                    lerp(OPS[Math.min(i0, OPS.length - 1)],
                          OPS[Math.min(i1, OPS.length - 1)]));
  // Tilt ramps from 0° at centre to full TILT° at ±1, then stays constant
  const rotateY = -dir * Math.min(abs, 1) * TILT;
  const zIndex  = Math.round(10 - abs * 2);

  return { x, z, scale, opacity, rotateY, zIndex };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PhotoPlaceholder({ n }: { n: number }) {
  return (
    <div className="absolute inset-0 bg-black flex items-end justify-end p-5">
      <span
        aria-hidden
        style={{
          opacity: 0.04,
          fontSize: 120,
          lineHeight: 1,
          fontWeight: 300,
          fontFamily: "var(--font-cormorant)",
          userSelect: "none",
        }}
      >
        {String(n).padStart(2, "0")}
      </span>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
      <line x1="0" y1="1"  x2="22" y2="1"  stroke="currentColor" strokeWidth="1.25" />
      <line x1="0" y1="7"  x2="22" y2="7"  stroke="currentColor" strokeWidth="1.25" />
      <line x1="0" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M1 1L17 17M17 1L1 17" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M11 3L5 9L11 15" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M7 3L13 9L7 15" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
    </svg>
  );
}

// ─── Main carousel ────────────────────────────────────────────────────────────
interface Props { sculptures: Sculpture[] }

export default function CoverflowCarousel({ sculptures }: Props) {
  // ── UI state (triggers re-renders) ────────────────────────────────────────
  const [displayIndex, setDisplayIndex] = useState(0); // nearest centred card
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [aboutOpen,    setAboutOpen]    = useState(false);
  const [inquireIndex, setInquireIndex] = useState<number | null>(null);

  // ── Responsive dimensions ─────────────────────────────────────────────────
  const [cardW, setCardW] = useState(340);
  const [cardH, setCardH] = useState(535);

  // ── Momentum scroll refs (never trigger re-renders) ───────────────────────
  const scrollPosRef     = useRef(0);          // continuous position, 0…N-1
  const velRef           = useRef(0);          // card-units per ms
  const momentumRafRef   = useRef<number | null>(null);
  const xOffsRef         = useRef<readonly number[]>([0, 338, 530, 625]);
  const cardWRef         = useRef(340);
  const displayIdxRef    = useRef(0);          // shadow of displayIndex to avoid stale closures
  const cardEls          = useRef<HTMLDivElement[]>([]);   // card DOM elements, indexed by i

  // Touch tracking
  const touchRafRef      = useRef<number | null>(null);
  const pendingScrollRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const velSamplesRef    = useRef<{ x: number; t: number }[]>([]);

  // Mouse/stylus tracking
  const ptrStartRef   = useRef<{ x: number; y: number; scroll: number } | null>(null);
  const ptrSamplesRef = useRef<{ x: number; t: number }[]>([]);
  const isDragRef     = useRef(false); // true if pointer moved enough to count as a drag

  const rowRef = useRef<HTMLDivElement>(null);

  // ── Responsive resize ─────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const update = () => {
      const d = calcDims(window.innerWidth, window.innerHeight);
      setCardW(d.cardW);
      setCardH(d.cardH);
      xOffsRef.current = d.xOffs;
      cardWRef.current = d.cardW;
      // Reposition cards with new dimensions immediately
      updatePositions();
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photoH = Math.floor(cardH * PHOTO_RATIO);
  const infoH  = cardH - photoH;

  // ── Core: apply current scrollPos to card DOM elements ───────────────────
  function updatePositions() {
    const pos = scrollPosRef.current;
    sculptures.forEach((_, i) => {
      const el = cardEls.current[i];
      if (!el) return;
      const offset = i - pos;
      const s = calcCardStyle(offset, xOffsRef.current);
      if (!s) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      el.style.opacity        = String(s.opacity);
      el.style.zIndex         = String(s.zIndex);
      el.style.pointerEvents  = "auto";
      el.style.transform      =
        `translateX(${s.x}px) translateZ(${s.z}px) scale(${s.scale}) rotateY(${s.rotateY}deg)`;
    });

    // Sync the counter / inquire modal (cheap integer comparison)
    const ni = Math.max(0, Math.min(sculptures.length - 1, Math.round(pos)));
    if (ni !== displayIdxRef.current) {
      displayIdxRef.current = ni;
      setDisplayIndex(ni);
    }
  }

  // ── Momentum loop ─────────────────────────────────────────────────────────
  function startMomentum() {
    if (momentumRafRef.current !== null) cancelAnimationFrame(momentumRafRef.current);
    const step = () => {
      velRef.current *= FRICTION;
      scrollPosRef.current = Math.max(
        0, Math.min(sculptures.length - 1, scrollPosRef.current + velRef.current)
      );
      if (scrollPosRef.current <= 0 || scrollPosRef.current >= sculptures.length - 1) {
        velRef.current = 0;
      }
      updatePositions();
      if (Math.abs(velRef.current) > 0.002) {
        momentumRafRef.current = requestAnimationFrame(step);
      } else {
        snapStep(); // hand off to soft snap once momentum dies
      }
    };
    momentumRafRef.current = requestAnimationFrame(step);
  }

  // ── Soft snap: spring to nearest card after momentum fades ────────────────
  function snapStep() {
    const target = Math.round(
      Math.max(0, Math.min(sculptures.length - 1, scrollPosRef.current))
    );
    const diff = target - scrollPosRef.current;
    if (Math.abs(diff) < 0.0008) {
      scrollPosRef.current = target;
      updatePositions();
      momentumRafRef.current = null;
      return;
    }
    scrollPosRef.current += diff * SNAP_SPRING;
    updatePositions();
    momentumRafRef.current = requestAnimationFrame(snapStep);
  }

  // ── Preload all images ────────────────────────────────────────────────────
  useEffect(() => {
    sculptures.forEach(s => {
      if (!s.image) return;
      const link = document.createElement("link");
      link.rel  = "preload";
      link.as   = "image";
      link.href = s.image;
      document.head.appendChild(link);
    });
  }, [sculptures]);

  // ── Initial card positioning (after first render populates cardEls) ───────
  useEffect(() => { updatePositions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard: nudge momentum ──────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  { velRef.current -= 0.018; startMomentum(); }
      if (e.key === "ArrowRight") { velRef.current += 0.018; startMomentum(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trackpad / wheel: scroll freely, no cooldown ─────────────────────────
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
      if (ax < 5 || ay > ax * 1.2) return;
      e.preventDefault();
      scrollPosRef.current = Math.max(
        0, Math.min(sculptures.length - 1,
          scrollPosRef.current + e.deltaX / cardWRef.current
        )
      );
      updatePositions();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch: free drag → momentum on release ────────────────────────────────
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    let sx = 0, sy = 0;
    let axis: "h" | "v" | null = null;

    const cancelTouchRaf = () => {
      if (touchRafRef.current !== null) {
        cancelAnimationFrame(touchRafRef.current);
        touchRafRef.current = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      // Halt any ongoing momentum
      if (momentumRafRef.current !== null) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
      velRef.current = 0;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      axis = null;
      dragStartScrollRef.current = scrollPosRef.current;
      velSamplesRef.current = [{ x: sx, t: performance.now() }];
    };

    const onTouchMove = (e: TouchEvent) => {
      if (axis === "v") return;
      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const adx = Math.abs(cx - sx), ady = Math.abs(cy - sy);
      if (axis === null && (adx > 4 || ady > 4)) axis = adx >= ady ? "h" : "v";
      if (axis !== "h") return;
      e.preventDefault();

      // Record velocity sample (keep last 80 ms)
      const now = performance.now();
      velSamplesRef.current.push({ x: cx, t: now });
      velSamplesRef.current = velSamplesRef.current.filter(s => now - s.t <= 80);

      // Direct 1:1 update — no rAF throttle so card tracks finger exactly
      scrollPosRef.current = Math.max(
        0, Math.min(sculptures.length - 1,
          dragStartScrollRef.current - (cx - sx) / cardWRef.current)
      );
      updatePositions();
    };

    const onTouchEnd = () => {
      cancelTouchRaf();
      if (axis !== "h") { axis = null; return; }
      axis = null;

      // Derive velocity from recent samples.
      // Convert px/ms → card-units/frame so the momentum step (which runs per rAF)
      // adds the right amount per frame instead of a near-zero per-ms value.
      const samples = velSamplesRef.current;
      if (samples.length >= 2) {
        const oldest = samples[0], newest = samples[samples.length - 1];
        const dt = newest.t - oldest.t;
        if (dt > 0) {
          velRef.current =
            -(newest.x - oldest.x) / dt * FRAME_MS / cardWRef.current * TOUCH_VEL_SCALE;
        }
      }
      startMomentum();
    };

    const onTouchCancel = () => { cancelTouchRaf(); axis = null; velRef.current = 0; };

    el.addEventListener("touchstart",  onTouchStart,  { passive: true });
    el.addEventListener("touchmove",   onTouchMove,   { passive: false });
    el.addEventListener("touchend",    onTouchEnd,    { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart",  onTouchStart);
      el.removeEventListener("touchmove",   onTouchMove);
      el.removeEventListener("touchend",    onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pointer (mouse/stylus): free drag → momentum ──────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    velRef.current = 0;
    isDragRef.current = false;
    ptrStartRef.current  = { x: e.clientX, y: e.clientY, scroll: scrollPosRef.current };
    ptrSamplesRef.current = [{ x: e.clientX, t: performance.now() }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrStartRef.current) return;
    const dx = e.clientX - ptrStartRef.current.x;
    const dy = e.clientY - ptrStartRef.current.y;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (Math.abs(dx) > 4) isDragRef.current = true;
    e.preventDefault();
    const now = performance.now();
    ptrSamplesRef.current.push({ x: e.clientX, t: now });
    ptrSamplesRef.current = ptrSamplesRef.current.filter(s => now - s.t <= 80);
    scrollPosRef.current = Math.max(
      0, Math.min(sculptures.length - 1, ptrStartRef.current.scroll - dx / cardWRef.current)
    );
    updatePositions();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!ptrStartRef.current) return;
    const wasTap = !isDragRef.current;
    ptrStartRef.current = null;
    const samples = ptrSamplesRef.current;
    if (samples.length >= 2) {
      const oldest = samples[0], newest = samples[samples.length - 1];
      const dt = newest.t - oldest.t;
      if (dt > 0) velRef.current = -(newest.x - oldest.x) / dt / cardWRef.current;
    }
    startMomentum();
    // setPointerCapture routes pointerup to the row, so click never reaches the card.
    // Detect taps here instead using pointer coordinates vs card bounding rects.
    if (wasTap) {
      const px = e.clientX, py = e.clientY;
      const idx = cardEls.current.findIndex(el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
      });
      if (idx !== -1) setInquireIndex(idx);
    }
  };
  const onPointerCancel = () => { ptrStartRef.current = null; velRef.current = 0; };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (sculptures.length === 0) {
    return (
      <div
        className="h-screen overflow-hidden bg-transparent flex items-center justify-center"
        style={{ height: "100dvh" }}
      >
        <p className="text-white/20 text-xs tracking-[0.3em] uppercase">
          Add images to /public/sculptures/
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // h-screen = 100vh fallback; inline style overrides with 100dvh (excludes iOS toolbar)
    // overflow-hidden + position:fixed (on body via CSS) = zero scroll, zero bounce
    <div
      className="h-screen overflow-hidden bg-transparent text-white flex flex-col select-none"
      style={{ height: "100dvh" }}
    >

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center justify-between px-6 pt-4 pb-3 sm:px-10 sm:pt-9 sm:pb-8">
        <h1 className="text-[11px] tracking-[0.3em] uppercase text-white/55 font-light">
          Exhibition Catalogue
        </h1>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-white/40 hover:text-white/80 transition-colors"
        >
          <HamburgerIcon />
        </button>
      </header>

      {/* ── Main ── */}
      {/*
        min-h-0 is critical: without it, a flex child's min-height defaults to
        "auto" (its content size), which can overflow the parent even with flex-1.
      */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center">

        {/* Carousel row — pointer + touch events captured here */}
        <div
          ref={rowRef}
          className="relative w-full shrink-0"
          style={{
            height: cardH,
            touchAction: "pan-y", // hand vertical to browser, horizontal to us
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <button
            onClick={() => { velRef.current -= 0.018; startMomentum(); }}
            disabled={displayIndex === 0}
            aria-label="Previous"
            className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-30 p-3 text-white/30 hover:text-white/70 disabled:opacity-10 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft />
          </button>

          <div
            className="absolute inset-0"
            style={{ perspective: "1100px", perspectiveOrigin: "50% 50%" }}
          >
            {sculptures.map((s, i) => (
              <div
                key={s.id}
                ref={el => { if (el) cardEls.current[i] = el; }}
                onClick={() => { if (!isDragRef.current) setInquireIndex(i); }}
                style={{
                  position: "absolute",
                  left: `calc(50% - ${cardW / 2}px)`,
                  width: cardW,
                  height: cardH,
                  opacity: 0,          // updatePositions() sets the real value after mount
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                  cursor: "pointer",
                }}
              >
                <div
                  className="relative w-full h-full overflow-hidden"
                  style={{
                    boxShadow: i === displayIndex
                      ? "0 40px 90px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.06)"
                      : "0 20px 50px rgba(0,0,0,0.7)",
                  }}
                >
                      {/* Photo — black background so sculptures bleed seamlessly */}
                      <div className="relative bg-black" style={{ height: photoH }}>
                        {s.image ? (
                          <Image
                            src={s.image}
                            alt={s.title}
                            fill
                            className="object-contain"
                            sizes={`${cardW}px`}
                            priority={Math.abs(i - displayIndex) <= 1}
                          />
                        ) : (
                          <PhotoPlaceholder n={i + 1} />
                        )}
                      </div>

                      {/* Info panel */}
                      <div
                        className="flex flex-col justify-between px-5 py-4 sm:px-6 sm:py-5"
                        style={{
                          height: infoH,
                          background: "linear-gradient(to bottom, #111a11, #141c14)",
                        }}
                      >
                        <div>
                          <h2
                            className="text-white leading-tight"
                            style={{
                              fontFamily: "var(--font-cormorant)",
                              // clamp so title never overflows on very small cards
                              fontSize: `clamp(1rem, ${cardW * 0.0048}rem, 1.55rem)`,
                              fontWeight: 300,
                              letterSpacing: "0.01em",
                            }}
                          >
                            {s.title}
                          </h2>
                          {s.stone && (
                            <p className="text-white/30 text-[9px] tracking-[0.22em] uppercase mt-1.5">
                              {s.stone}
                            </p>
                          )}
                          {s.dimensions && (
                            <p className="text-white/30 text-[9px] tracking-[0.12em] mt-1" style={{ fontWeight: 300 }}>
                              {s.dimensions}
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between mb-2">
                            <p className="text-white/60 text-[9px] tracking-[0.18em] uppercase">
                              {s.sculptor}
                            </p>
                            {s.price ? (
                              <p
                                className="text-white/75"
                                style={{ fontSize: "0.8rem", fontWeight: 300, letterSpacing: "0.05em" }}
                              >
                                ${s.price.toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                          {HOUSE_OF_STONE_TITLES.has(s.title.toLowerCase()) ? (
                            <p
                              className="text-right"
                              style={{
                                fontSize: "7.5px",
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                color: "rgba(255,255,255,0.18)",
                                userSelect: "none",
                              }}
                            >
                              House of Stone
                            </p>
                          ) : (
                            <a
                              href="https://slabofafrica.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="block text-right"
                              style={{
                                fontSize: "7.5px",
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                color: "rgba(255,255,255,0.18)",
                                textDecoration: "none",
                              }}
                            >
                              Slab of Africa
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { velRef.current += 0.018; startMomentum(); }}
            disabled={displayIndex === sculptures.length - 1}
            aria-label="Next"
            className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-30 p-3 text-white/30 hover:text-white/70 disabled:opacity-10 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight />
          </button>
        </div>

        {/* Inquire button */}
        <div className="shrink-0 mt-4 sm:mt-8">
          <button
            onClick={() => setInquireIndex(displayIndex)}
            className="px-10 py-3 text-[10px] tracking-[0.35em] uppercase bg-[#D6D2CC] text-[#111] hover:bg-[#E2DFDA] transition-all duration-200"
          >
            Inquire
          </button>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="shrink-0 flex items-center justify-between px-5 py-3 sm:px-10 sm:py-7 border-t border-white/[0.04]">
        <p className="text-[8px] tracking-[0.4em] uppercase text-white/14">
          All works available for acquisition
        </p>
        <p className="text-white/14 text-[9px] tracking-[0.35em] font-mono">
          {String(displayIndex + 1).padStart(2, "0")}
          &nbsp;—&nbsp;
          {String(sculptures.length).padStart(2, "0")}
        </p>
      </footer>

      {/* ── Inquire modal ── */}
      {(() => {
        const s = sculptures[inquireIndex ?? displayIndex];
        const isHouseOfStone = s ? HOUSE_OF_STONE_TITLES.has(s.title.toLowerCase()) : false;
        const contact = isHouseOfStone
          ? { gallery: "House of Stone", email: "sales@houseofstone-ngo.org", phone: null }
          : { gallery: "Slab of Africa",  email: "shaan@slabofafrica.com",      phone: "+1 925 326 8551" };
        return (
          <AnimatePresence>
            {inquireIndex !== null && (
              <motion.div
                className="fixed inset-0 z-40 flex items-center justify-center p-6"
                style={{ background: "rgba(5, 14, 5, 0.92)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                onClick={() => setInquireIndex(null)}
              >
                <motion.div
                  className="relative w-full max-w-xs flex flex-col gap-6 p-8"
                  style={{ background: "#0e180e", border: "1px solid rgba(255,255,255,0.08)" }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.22, delay: 0.04 }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* X */}
                  <button
                    onClick={() => setInquireIndex(null)}
                    aria-label="Close"
                    className="absolute top-4 right-4 text-white/25 hover:text-white/65 transition-colors"
                  >
                    <CloseIcon />
                  </button>

                  {/* Sculpture title */}
                  <div>
                    <p className="text-[8px] tracking-[0.3em] uppercase text-white/28 mb-1">Inquire</p>
                    <h3
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "1.45rem",
                        fontWeight: 300,
                        letterSpacing: "0.01em",
                        color: "rgba(255,255,255,0.88)",
                      }}
                    >
                      {s?.title}
                    </h3>
                  </div>

                  {/* Divider */}
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.07)" }} />

                  {/* Contact details */}
                  <div className="flex flex-col gap-4">
                    <p className="text-white/45 text-[11px] tracking-[0.04em]" style={{ fontWeight: 300 }}>
                      To purchase this piece please contact
                    </p>
                    <p className="text-[8px] tracking-[0.28em] uppercase text-white/28">{contact.gallery}</p>
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-white/70 hover:text-white transition-colors"
                      style={{ fontSize: "0.82rem", letterSpacing: "0.02em", fontWeight: 300 }}
                    >
                      {contact.email}
                    </a>
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone.replace(/\s/g, "")}`}
                        className="text-white/70 hover:text-white transition-colors"
                        style={{ fontSize: "0.82rem", letterSpacing: "0.02em", fontWeight: 300 }}
                      >
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        );
      })()}

      {/* ── Menu overlay ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col"
            style={{
              background: "rgba(232, 227, 218, 0.90)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            onClick={() => { setMenuOpen(false); setAboutOpen(false); }}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 sm:top-9 sm:right-10 p-3 text-black/35 hover:text-black/75 transition-colors"
              onClick={e => { e.stopPropagation(); setMenuOpen(false); setAboutOpen(false); }}
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>

            {/* Content — centred for menu, top-aligned + scrollable for about */}
            <div
              className={`flex-1 flex flex-col items-center overflow-hidden px-6 sm:px-12 ${aboutOpen ? "justify-start" : "justify-center"}`}
            >
              <AnimatePresence mode="wait">
                {aboutOpen ? (
                  <motion.div
                    key="about"
                    className="w-full max-w-xl overflow-y-auto"
                    style={{ maxHeight: "calc(100dvh - 72px)", paddingTop: "64px", paddingBottom: "72px" }}
                    onClick={e => e.stopPropagation()}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.22 }}
                  >
                    {/* Back */}
                    <button
                      className="mb-10 text-[9px] tracking-[0.3em] uppercase text-black/35 hover:text-black/65 transition-colors"
                      onClick={() => setAboutOpen(false)}
                    >
                      ← Back
                    </button>

                    {/* Name */}
                    <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "clamp(2.2rem, 7vw, 3.4rem)", fontWeight: 300, letterSpacing: "0.01em", color: "rgba(0,0,0,0.86)", lineHeight: 1.1, marginBottom: "0.6rem" }}>
                      Dominic Benhura
                    </h2>
                    <div style={{ height: "1px", background: "rgba(0,0,0,0.1)", marginBottom: "2.5rem", marginTop: "1.5rem" }} />

                    {/* Photo 1 */}
                    <div style={{ width: "100%", marginBottom: "2.8rem", lineHeight: 0 }}>
                      <Image
                        src="/images/dom-1.jpeg"
                        alt="Dominic Benhura"
                        width={576}
                        height={384}
                        style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                      />
                    </div>

                    {/* Sections — first half */}
                    {[
                      {
                        heading: "Early Life",
                        body: [
                          "Born in 1968 in the small Zimbabwean village of Murewa, a hundred kilometres northeast of Harare, Dominic Benhura is critically acclaimed as one of the premier stone sculptors in the world, with exhibitions spanning over three decades across Africa, America, Asia, and Europe.",
                          "Life dealt him an early blow. His father died before he was born, and Benhura entered the world into poverty, herding cattle in rural Murewa and experimenting with clay as a boy. He was a gifted student, and his academic ability opened the door that would change everything. At the age of ten, he went to live with his uncle, Sekuru Gutsa, in the Harare suburb of Tafara, to further his studies — and it was there that he was introduced to sculpture by his cousin, Tapfuma Gutsa, an established artist in his own right. Tapfuma Gutsa had gained art and wood carving experience at Serima Mission, and quickly became Dominic's friend and mentor.",
                          "Benhura began by helping to polish Tapfuma's pieces, then tried his hand with chisel and hammer, eventually carving small offcuts before moving on to larger stone. The transition from clay to stone happened almost by accident — the clay available to him wasn't suitable for the work he wanted to make, and stone became his medium by necessity and then by passion. From the beginning he showed immense talent, and was working professionally by the age of twelve.",
                        ],
                      },
                      {
                        heading: "Recognition & Training",
                        body: [
                          "In 1986, he won first place at the National Gallery of Zimbabwe's Annual Schools Competition — an early signal of what was to come. He began training and showing at Chapungu Sculpture Park, one of the most important platforms for Zimbabwean sculpture, and was later invited to the Millesgarten Sculpture Park and Museum in Sweden, joining its resident artist programme in 1990 and remaining until 1995.",
                          "That residency was formative. It gave him the space and resources to work at larger scale, and it opened the door to international travel and exposure. Through workshops in Botswana, the United States, Belgium, the Netherlands, Denmark, and Germany, his outlook broadened and his techniques deepened. Through the years, his willingness to innovate led to many new approaches: threading cored stone onto metal rods, using nails bound together and glued into stone to depict thorns, and freely incorporating any material available to him.",
                        ],
                      },
                      {
                        heading: "Artistic Vision",
                        body: [
                          "Where his forerunners' work was mostly static, Benhura created forms in motion — figures mid-leap, children mid-laugh, a body caught between gravity and flight. His approach is quietly revolutionary. He has an exceptional ability to portray human feeling through form rather than facial expression, and has pushed the boundaries of materials traditionally used in Zimbabwean stone sculpture: using one stone inlaid into another to create decorative effects, and incorporating metal, wood, and wire to give his work new and unique qualities.",
                          "The subjects are expansive — plants, animals, birds, the full spectrum of human experience. Though he is most drawn to women and children, a reflection of being raised by his mother after his father died before he was born. Family runs through almost everything he makes.",
                          "As Benhura has said of his own work: \"Most of my sculptures are experiments in form, contrast and texture. For my themes, I'm inspired by everything around me. Obviously there are pieces which have greater emotional significance to me than others… My sculpture begins from forms that inspire me. I have a deep respect for the work of the first generation Zimbabwean sculptors but I do not feel limited in any way by my cultural heritage.\"",
                        ],
                      },
                    ].map(({ heading, body }) => (
                      <div key={heading} style={{ marginBottom: "2.2rem" }}>
                        <p style={{ fontSize: "8.5px", letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(0,0,0,0.38)", fontWeight: 400, marginBottom: "0.75rem" }}>
                          {heading}
                        </p>
                        {body.map((para, i) => (
                          <p key={i} style={{ fontSize: "0.85rem", lineHeight: 1.9, color: "rgba(0,0,0,0.62)", fontWeight: 300, marginBottom: i < body.length - 1 ? "1rem" : 0 }}>
                            {para}
                          </p>
                        ))}
                      </div>
                    ))}

                    {/* Photo 2 */}
                    <div style={{ width: "100%", marginBottom: "2.8rem", marginTop: "0.6rem", lineHeight: 0 }}>
                      <Image
                        src="/images/dom-2.jpeg"
                        alt="Dominic Benhura"
                        width={576}
                        height={384}
                        style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                      />
                    </div>

                    {/* Sections — second half */}
                    {[
                      {
                        heading: "International Reach",
                        body: [
                          "The reach of his work is hard to overstate. His Leap Frog series is viewed by millions annually as a permanent installation at Hartsfield International Airport in Atlanta, the world's busiest. In 2003, he personally presented Swing Me Mama to Nelson Mandela, which now stands in the permanent collection of the Nelson Mandela Foundation in Johannesburg. The British Museum holds an example of his work in its permanent collection.",
                          "His sculptures can also be found at the Leiden Botanical Gardens in Holland, Benson Park in Colorado, and the Singapore Botanic Garden, as well as in the embassies of Norway, the Netherlands, and Sweden in Zimbabwe. Among his most recognised individual works are Euphorbia Tree, Our H.I.V. Friend, The Dance of the Rainbirds, and Lazy Sunday.",
                          "In January 2016, Benhura was commissioned to sculpt a statue of President Robert Mugabe, erected at the Zimbabwe State House. Benhura framed the piece as a tribute — Mugabe, whatever his legacy, was the head of state who presided over the era in which Zimbabwean stone sculpture achieved its greatest international recognition, and Benhura has spoken of him as a figure who inspired his generation. The commission speaks to Benhura's standing within Zimbabwe itself: he is not simply an artist who succeeded abroad, but one whose significance is acknowledged at the highest levels of the country he comes from.",
                        ],
                      },
                      {
                        heading: "Materials",
                        body: [
                          "Dominic's primary medium is springstone, a metamorphic rock found in the ancient geological formations of Zimbabwe and southern Africa. Dense, fine-grained, and ranging in colour from deep charcoal to near black, springstone has a hardness and smoothness that rewards the kind of intricate surface work Benhura is known for — polished to a near-mirror finish in some passages, left deliberately rough in others. It is the stone most associated with the Zimbabwean sculptural tradition, and Benhura has spent a lifetime learning its possibilities and its limits.",
                          "The works presented in this Marin exhibition also incorporate dolomite and cobalt stone — materials Benhura uses for their contrasting texture and colour. Dolomite, a pale crystalline rock, introduces warmth and lightness against the dark springstone, often used to evoke skin, fabric, or light catching a surface. Cobalt stone brings a cooler, more electric quality — appearing in pieces like Dancing Away to amplify a sense of energy and motion. Together these materials allow Benhura to work in contrast, using the stones themselves as a kind of palette.",
                        ],
                      },
                      {
                        heading: "Awards & Honours",
                        body: [
                          "His awards are numerous, spanning local, regional, and international recognition — including the Key to Delray Beach from the Mayor of Delray Beach, Florida; the National Gallery of Zimbabwe Award of Distinction in the Visual Arts; multiple NAMA awards including Outstanding Achievement in 3D Visual Arts and the People's Choice Award; JCI Zimbabwe's Ten Outstanding Young Zimbabweans; and the World's Children's Prize for the Rights of the Child.",
                        ],
                      },
                      {
                        heading: "Philanthropy",
                        body: [
                          "His philanthropic work is as much a part of his identity as the sculpture itself. He has donated pieces to children's hospitals, clinics, and global peace initiatives around the world. Within Zimbabwe, he joined forces with the late music icon Oliver Mtukudzi to help build, equip, and staff local schools and clinics — including constructing a library at his former secondary school, Kambarami, in Murehwa.",
                        ],
                      },
                      {
                        heading: "Dominic Studios",
                        body: [
                          "Dominic Studios, his Harare atelier, is home to a close-knit group of some of the finest sculptors on the continent — a place where the next generation of Zimbabwean stone carvers learns the craft from one of its living masters. He is a national treasure in Zimbabwe, and one of the most important artistic voices the continent has produced.",
                        ],
                      },
                    ].map(({ heading, body }) => (
                      <div key={heading} style={{ marginBottom: "2.2rem" }}>
                        <p style={{ fontSize: "8.5px", letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(0,0,0,0.38)", fontWeight: 400, marginBottom: "0.75rem" }}>
                          {heading}
                        </p>
                        {body.map((para, i) => (
                          <p key={i} style={{ fontSize: "0.85rem", lineHeight: 1.9, color: "rgba(0,0,0,0.62)", fontWeight: 300, marginBottom: i < body.length - 1 ? "1rem" : 0 }}>
                            {para}
                          </p>
                        ))}
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.nav
                    key="menu"
                    className="flex flex-col items-center gap-7 sm:gap-9"
                    onClick={e => e.stopPropagation()}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.22 }}
                  >
                    {/* Exhibition date */}
                    <p style={{
                      fontFamily: "var(--font-cormorant)",
                      fontSize: "clamp(0.75rem, 2.2vw, 0.95rem)",
                      fontWeight: 300,
                      letterSpacing: "0.18em",
                      color: "rgba(0,0,0,0.35)",
                      textAlign: "center",
                      textTransform: "uppercase",
                      marginBottom: "2.8rem",
                    }}>
                      July 8th to October
                    </p>

                    {/* "About the Artist" — in-page panel */}
                    <button
                      onClick={() => setAboutOpen(true)}
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "clamp(1.5rem, 4.5vw, 2.2rem)",
                        fontWeight: 300,
                        letterSpacing: "0.02em",
                        color: "rgba(0,0,0,0.72)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                      className="hover:text-black transition-colors text-center"
                    >
                      About the Artist
                    </button>

                    {/* External links */}
                    {[
                      { label: "Slab of Africa",              href: "https://slabofafrica.com" },
                      { label: "House of Stone",              href: "https://www.houseofstone-ngo.org/" },
                      { label: "Marin Art and Garden Center", href: "https://maringarden.org/" },
                    ].map(({ label, href }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMenuOpen(false)}
                        style={{
                          fontFamily: "var(--font-cormorant)",
                          fontSize: "clamp(1.5rem, 4.5vw, 2.2rem)",
                          fontWeight: 300,
                          letterSpacing: "0.02em",
                          color: "rgba(0,0,0,0.72)",
                          textDecoration: "none",
                        }}
                        className="hover:text-black transition-colors text-center"
                      >
                        {label}
                      </a>
                    ))}
                  </motion.nav>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
