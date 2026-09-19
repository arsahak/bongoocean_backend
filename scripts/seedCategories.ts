import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/category.model";
import { CATEGORY_TREE, type CategoryTreeNode } from "./data/categoryTree";

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

let created = 0;
let existing = 0;
let repaired = 0;

const seedNode = async (
  node: CategoryTreeNode,
  parentId: mongoose.Types.ObjectId | null,
  ancestry: string[],
  sortOrder: number,
): Promise<void> => {
  const fullPath = [...ancestry, node.name].join(" > ");

  const found = await Category.findOne({ name: node.name });
  let id: mongoose.Types.ObjectId;

  if (found) {
    existing += 1;
    id = found._id as mongoose.Types.ObjectId;
    if (needsRepair(found.image ?? "")) {
      found.image = imageFor(fullPath);
      await found.save();
      repaired += 1;
    }
  } else {
    const doc = await Category.create({
      name: node.name,
      description: node.description ?? "",
      image: imageFor(fullPath),
      parent: parentId,
      isActive: true,
      sortOrder,
    });
    id = doc._id as mongoose.Types.ObjectId;
    created += 1;
  }

  const children = node.children ?? [];
  for (const [index, child] of children.entries()) {
    await seedNode(child, id, [...ancestry, node.name], index);
  }
};

const run = async () => {
  await connectDB();

  for (const [index, department] of CATEGORY_TREE.entries()) {
    await seedNode(department, null, [], index);
  }

  console.log(
    `Categories ready: ${created} created, ${existing} already existed (${repaired} image repaired).`,
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Category seeding failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
