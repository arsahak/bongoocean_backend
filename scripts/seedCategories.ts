import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { connectDB } from "../config/db";
import { Category } from "../models/category.model";

// Google's public product taxonomy (https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt)
// One line per category, at every depth, formatted as "<id> - Top > Sub > Leaf".
// Every ancestor of a leaf also appears as its own line, so parsing in depth order
// is enough to resolve each node's parent before its children are processed.
const TAXONOMY_FILE = path.join(__dirname, "data/googleProductTaxonomy.txt");

// Departments we deliberately don't seed by default — adult content, alcohol,
// and tobacco aren't appropriate as an out-of-the-box catalog default.
const EXCLUDED_PREFIXES = [
  "Mature",
  "Food, Beverages & Tobacco > Tobacco Products",
  "Food, Beverages & Tobacco > Beverages > Alcoholic Beverages",
];

const DEPARTMENT_DESCRIPTIONS: Record<string, string> = {
  "Animals & Pet Supplies":
    "Food, accessories, and care essentials for pets and animals",
  "Apparel & Accessories":
    "Clothing, footwear, jewelry, and accessories for everyone",
  "Arts & Entertainment":
    "Art supplies, party goods, and entertainment collectibles",
  "Baby & Toddler":
    "Everything for babies and toddlers, from feeding to diapering",
  "Business & Industrial":
    "Industrial equipment, supplies, and commercial products",
  "Cameras & Optics": "Cameras, lenses, and photography and optics equipment",
  Electronics: "Gadgets, devices, and electronic essentials",
  "Food, Beverages & Tobacco":
    "Packaged food, snacks, and non-alcoholic beverages",
  Furniture: "Indoor and outdoor furniture for every room",
  Hardware: "Tools, building materials, and hardware supplies",
  "Health & Beauty": "Skincare, cosmetics, and personal health essentials",
  "Home & Garden": "Home decor, kitchenware, and gardening supplies",
  "Luggage & Bags": "Bags, luggage, and travel accessories",
  Media: "Books, movies, music, and other media",
  "Office Supplies": "Stationery, office equipment, and workplace essentials",
  "Religious & Ceremonial":
    "Items for religious practice and ceremonial occasions",
  Software: "Computer software and digital licenses",
  "Sporting Goods": "Sporting goods and outdoor adventure gear",
  "Toys & Games": "Toys, games, and kids' essentials",
  "Vehicles & Parts": "Cars, motorbikes, watercraft, and vehicle parts",
};

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Simple deterministic string hash so the same category always locks to the
// same LoremFlickr photo (picsum.photos is unreachable from this network —
// its TLS handshake hangs, likely blocked upstream — LoremFlickr isn't).
const hashToLock = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
};

const imageFor = (fullPath: string) =>
  `https://loremflickr.com/1200/800?lock=${hashToLock(slugify(fullPath))}`;

// picsum.photos is unreachable from this network, so any category seeded
// before the switch to LoremFlickr still has a dead image URL — replace it.
const needsRepair = (url: string) => !url || url.includes("picsum.photos");

interface TaxonomyNode {
  depth: number;
  parts: string[];
}

const isExcluded = (fullPath: string) =>
  EXCLUDED_PREFIXES.some(
    (prefix) => fullPath === prefix || fullPath.startsWith(`${prefix} > `),
  );

const parseTaxonomy = (): TaxonomyNode[] => {
  const raw = fs.readFileSync(TAXONOMY_FILE, "utf-8");
  const nodes: TaxonomyNode[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf(" - ");
    if (separatorIndex === -1) continue;

    const fullPath = trimmed.slice(separatorIndex + 3).trim();
    if (isExcluded(fullPath)) continue;

    const parts = fullPath.split(">").map((part) => part.trim());
    nodes.push({ depth: parts.length, parts });
  }

  // Stable sort by depth so a node's parent path is always resolved first.
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.depth - b.node.depth || a.index - b.index)
    .map(({ node }) => node);
};

const run = async () => {
  await connectDB();

  const nodes = parseTaxonomy();
  const idByPath = new Map<string, mongoose.Types.ObjectId>();

  let created = 0;
  let existing = 0;
  let repaired = 0;
  let skippedNoParent = 0;

  for (const [index, node] of nodes.entries()) {
    const name = node.parts[node.parts.length - 1];
    const fullPathKey = node.parts.join(" > ");
    const parentPathKey = node.parts.slice(0, -1).join(" > ");
    const parentId =
      node.depth === 1 ? null : (idByPath.get(parentPathKey) ?? null);

    if (node.depth > 1 && !parentId) {
      skippedNoParent += 1;
      continue;
    }

    const found = await Category.findOne({ name });
    if (found) {
      existing += 1;
      idByPath.set(fullPathKey, found._id as mongoose.Types.ObjectId);
      if (needsRepair(found.image ?? "")) {
        found.image = imageFor(fullPathKey);
        await found.save();
        repaired += 1;
      }
    } else {
      try {
        const doc = await Category.create({
          name,
          description:
            node.depth === 1 ? (DEPARTMENT_DESCRIPTIONS[name] ?? "") : "",
          image: imageFor(fullPathKey),
          parent: parentId,
          isActive: true,
          sortOrder: created,
        });
        idByPath.set(fullPathKey, doc._id as mongoose.Types.ObjectId);
        created += 1;
      } catch (error) {
        // Another run (or a re-run racing itself) inserted this name first —
        // look it up instead of crashing the whole import.
        const isDuplicateKey =
          error instanceof Error &&
          "code" in error &&
          (error as { code?: number }).code === 11000;
        if (!isDuplicateKey) throw error;

        const winner = await Category.findOne({ name });
        if (winner) {
          existing += 1;
          idByPath.set(fullPathKey, winner._id as mongoose.Types.ObjectId);
        }
      }
    }

    if ((index + 1) % 250 === 0 || index === nodes.length - 1) {
      console.log(
        `Progress: ${index + 1}/${nodes.length} (${created} created, ${existing} existing)`,
      );
    }
  }

  console.log(
    `Categories ready: ${created} created, ${existing} already existed (${repaired} image repaired), ${skippedNoParent} skipped (missing parent).`,
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Category seeding failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
