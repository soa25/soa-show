import path from "path";
import { readdir, readFile } from "fs/promises";
import CoverflowCarousel from "./components/CoverflowCarousel";
import type { Sculpture } from "./data/sculptures";

const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

// Prices keyed by lowercase title
const PRICES: Record<string, number> = {
  "party dress":       8000,
  "up we go":          7500,
  "quality time":      4500,
  "pat cake":          6500,
  "apple of my eye":   9500,
  "feeling great":     9200,
  "relaxing with mum": 8500,
  "joyous moment":     4000,
  "happy trio":        4500,
  "happiness":         9000,
  "i like it mum":     5600,
  "dancing away":      10000,
  "swallow":           3000,
  "traveling mum":     2000,
  "proud of my hair":  4000,
  "learners":          1300,
  "life cycle":        1000,
  "imagination":       2400,
  "flying birds":      3700,
  "torso":             2000,
  "watching bird":     800,
  "joyful trio":       4800,
  "the ballerina":     5200,
  "family time":       12500,
  "paired for life":   5000,
  "peacock":           5500,
};

// Sculptors keyed by lowercase title (only for non-Dominic works)
const SCULPTORS: Record<string, string> = {
  "swallow":           "Stanford Derere",
  "traveling mum":     "Lameck Million",
  "proud of my hair":  "David White",
  "learners":          "Boet Nyariri",
  "life cycle":        "Tawanda Makore",
  "imagination":       "Sylvester Samanyanga",
  "flying birds":      "Benedick Mazuvamana",
  "torso":             "Garrison Machinjili",
  "watching bird":     "Paddington Tapfumaneyi",
};

// Materials keyed by lowercase title
const MATERIALS: Record<string, string> = {
  "party dress":       "Springstone",
  "up we go":          "Springstone",
  "quality time":      "Springstone",
  "pat cake":          "Springstone",
  "apple of my eye":   "Springstone and Dolomite",
  "feeling great":     "Springstone and Dolomite",
  "relaxing with mum": "Springstone",
  "joyous moment":     "Springstone",
  "happy trio":        "Springstone and Dolomite",
  "happiness":         "Springstone",
  "i like it mum":     "Springstone",
  "dancing away":      "Springstone and Cobalt",
  "swallow":           "Serpentine and Dolomite",
  "traveling mum":     "Springstone",
  "proud of my hair":  "Springstone",
  "learners":          "Springstone",
  "imagination":       "Serpentine",
  "flying birds":      "Springstone",
  "torso":             "Brown Serpentine",
  "watching bird":     "Cobalt",
  "joyful trio":       "Springstone",
  "the ballerina":     "Springstone and Dolomite",
  "family time":       "Springstone",
  "paired for life":   "Springstone",
  "peacock":           "Springstone and Dolomite",
};

// Dimensions keyed by lowercase title (× is the multiplication sign U+00D7)
const DIMENSIONS: Record<string, string> = {
  "party dress":       "28.5 × 6.3 × 4 in",
  "up we go":          "22 × 18 × 3 in",
  "quality time":      "12 × 18 × 5 in",
  "pat cake":          "16 × 14 × 5 in",
  "apple of my eye":   "35 × 15 × 8 in",
  "feeling great":     "31 × 22 × 8 in",
  "relaxing with mum": "17 × 21 × 5 in",
  "joyous moment":     "18 × 19 × 4 in",
  "happy trio":        "16 × 27 × 4 in",
  "happiness":         "37 × 9 × 7 in",
  "i like it mum":     "25 × 7 × 6 in",
  "dancing away":      "40 × 22 × 9 in",
  "traveling mum":     "27 × 9 × 10 in",
  "proud of my hair":  "20 × 12 × 9 in",
  "learners":          "19 × 8 × 8 in",
  "life cycle":        "13 × 11 × 7 in",
  "imagination":       "20 × 14 × 8 in",
  "flying birds":      "29 × 12 × 6 in",
  "torso":             "21 × 8 × 7 in",
  "watching bird":     "17.5 × 8 × 3 in",
  "joyful trio":       "24 × 16 × 8 in",
  "the ballerina":     "26 × 19 × 7 in",
  "family time":       "58 × 18 × 8 in",
};

// Known sculptor name suffixes to strip from filenames before titling.
// Extend this list if other sculptors are added.
const SCULPTOR_SUFFIXES = ["-dominic", "-benhura", "-dominic-benhura"];

function toTitleCase(filename: string): string {
  let stem = filename.replace(IMAGE_RE, ""); // strip extension

  // Remove any trailing sculptor suffix (case-insensitive)
  for (const suffix of SCULPTOR_SUFFIXES) {
    if (stem.toLowerCase().endsWith(suffix)) {
      stem = stem.slice(0, stem.length - suffix.length);
      break;
    }
  }

  return stem
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function Home() {
  const dir = path.join(process.cwd(), "public", "sculptures");

  let filenames: string[] = [];
  try {
    filenames = (await readdir(dir))
      .filter(f => IMAGE_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    // /public/sculptures/ not found — carousel will show empty state
  }

  // Apply manual ordering from order.json if present.
  // Any files not listed in order.json are appended at the end.
  try {
    const order: string[] = JSON.parse(
      await readFile(path.join(dir, "order.json"), "utf-8")
    );
    const fileSet = new Set(filenames);
    const head = order.filter(f => fileSet.has(f));
    const headSet = new Set(head);
    const tail = filenames.filter(f => !headSet.has(f));
    filenames = [...head, ...tail];
  } catch {
    // no order.json — keep alphabetical
  }

  const sculptures: Sculpture[] = filenames.map((filename, i) => {
    const title = toTitleCase(filename);
    return {
      id: i + 1,
      title,
      sculptor: SCULPTORS[title.toLowerCase()] ?? "Dominic Benhura",
      price:      PRICES[title.toLowerCase()],
      stone:      MATERIALS[title.toLowerCase()],
      dimensions: DIMENSIONS[title.toLowerCase()],
      image: `/sculptures/${filename}`,
    };
  });

  return <CoverflowCarousel sculptures={sculptures} />;
}
