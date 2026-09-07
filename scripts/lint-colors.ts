/**
 * lint-colors.ts
 *
 * Scans .tsx files under src/app/ for hardcoded Tailwind color classes.
 * Files under src/components/ui/ (shadcn primitives) are exempt.
 *
 * Exit 0 = clean, Exit 1 = violations found.
 */

import { globSync } from "node:fs";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const ROOT = process.cwd();

const TAILWIND_COLORS = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

const PREFIXES = [
  "bg",
  "text",
  "border",
  "ring",
  "outline",
  "from",
  "to",
  "via",
] as const;

// Build a single regex that matches:
//  1. {prefix}-white or {prefix}-black
//  2. {prefix}-{color}-{shade}
//  3. Arbitrary color values: [#...], [rgb(...], [hsl(...
const prefixGroup = PREFIXES.join("|");
const colorGroup = TAILWIND_COLORS.join("|");

const hardcodedClassPattern = new RegExp(
  `(?:^|\\s)(?:${prefixGroup})-(?:white|black|(?:${colorGroup})-\\d{2,3})(?=\\s|$|"|'|\`)` +
    `|\\[#[0-9a-fA-F]` +
    `|\\[rgb\\(` +
    `|\\[hsl\\(`,
);

interface Violation {
  file: string;
  line: number;
  match: string;
}

const violations: Violation[] = [];

const files = globSync("src/app/**/*.tsx", { cwd: ROOT });

for (const filePath of files) {
  // Exempt shadcn primitives
  if (filePath.includes("src/components/ui/")) {
    continue;
  }

  const fullPath = `${ROOT}/${filePath}`;
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find all matches in the line
    let remaining = line;
    let offset = 0;
    while (remaining.length > 0) {
      const m = hardcodedClassPattern.exec(remaining);
      if (!m) break;
      violations.push({
        file: relative(ROOT, fullPath),
        line: i + 1,
        match: m[0].trim(),
      });
      offset = m.index + m[0].length;
      remaining = remaining.slice(offset);
    }
  }
}

if (violations.length === 0) {
  console.log("No hardcoded color classes found.");
  process.exit(0);
} else {
  console.error(
    `Found ${violations.length} hardcoded color class${violations.length === 1 ? "" : "es"}:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.match}`);
  }
  console.error(
    "\nReplace with design-token classes (e.g. bg-surface, text-primary).",
  );
  process.exit(1);
}
