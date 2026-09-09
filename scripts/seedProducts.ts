import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/category.model";
import { Brand } from "../models/brand.model";
import { Product, type ProductUnit } from "../models/product.model";

const SKU_PREFIX = "BO-";
const SKU_WIDTH = 5;

// picsum.photos is unreachable from this network — loremflickr.com works and
// supports a keyword (for a contextually relevant real photo) plus a `lock`
// param for a deterministic, stable image per product.
const hashToLock = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
};

const imageFor = (keyword: string, seed: string, offset: number) =>
  `https://loremflickr.com/800/800/${encodeURIComponent(keyword)}?lock=${hashToLock(seed) + offset}`;

const randomInt = (min: number, max: number) =>
  Math.round((min + Math.random() * (max - min)) / 10) * 10;

const pick = <T,>(items: T[], index: number): T => items[index % items.length];

interface ProductType {
  // Candidate real leaf-category names to try, in order; falls back to
  // `department` (a guaranteed top-level category) if none exist.
  categoryNames: string[];
  department: string;
  keyword: string;
  typeLabel: string;
  brands: string[];
  variants: string[];
  count: number;
  priceMin: number;
  priceMax: number;
  unit: ProductUnit;
}

const productTypes: ProductType[] = [
  // ── Electronics (~180) ──────────────────────────────────────────────────
  {
    categoryNames: ["Mobile Phones", "Cell Phones"],
    department: "Electronics",
    keyword: "smartphone",
    typeLabel: "Smartphone",
    brands: ["Samsung", "Apple", "Xiaomi", "Realme", "Oppo", "Vivo", "OnePlus", "Nokia", "Infinix", "Tecno", "itel", "Redmi", "Honor"],
    variants: ["64GB, Black", "128GB, Blue", "256GB, Silver", "128GB, Green", "512GB, Titanium"],
    count: 25, priceMin: 8000, priceMax: 150000, unit: "pcs",
  },
  {
    categoryNames: ["Laptops"],
    department: "Electronics",
    keyword: "laptop",
    typeLabel: "Laptop",
    brands: ["Dell", "HP", "Lenovo", "Asus", "Acer", "Apple", "Microsoft"],
    variants: ["Core i5, 8GB RAM, 512GB SSD", "Core i7, 16GB RAM, 1TB SSD", "Ryzen 5, 8GB RAM, 256GB SSD", "Core i3, 8GB RAM, 512GB SSD"],
    count: 15, priceMin: 35000, priceMax: 220000, unit: "pcs",
  },
  {
    categoryNames: ["Televisions"],
    department: "Electronics",
    keyword: "television",
    typeLabel: "Smart LED TV",
    brands: ["Samsung", "LG", "Sony", "Walton", "Panasonic", "Sharp", "Toshiba", "Vision"],
    variants: ["32-inch HD", "43-inch Full HD", "55-inch 4K UHD", "65-inch 4K UHD"],
    count: 12, priceMin: 15000, priceMax: 180000, unit: "pcs",
  },
  {
    categoryNames: ["Headphones"],
    department: "Electronics",
    keyword: "headphones",
    typeLabel: "Headphones",
    brands: ["JBL", "Sony", "Bose", "Sennheiser", "Skullcandy", "Beats", "boAt", "Noise"],
    variants: ["Wireless Over-Ear", "Wireless Earbuds", "Wired In-Ear", "Noise Cancelling"],
    count: 15, priceMin: 500, priceMax: 25000, unit: "pcs",
  },
  {
    categoryNames: ["Portable Speakers", "Speakers"],
    department: "Electronics",
    keyword: "speaker",
    typeLabel: "Bluetooth Speaker",
    brands: ["JBL", "Sony", "Bose", "Anker"],
    variants: ["Portable Mini", "Waterproof Outdoor", "Party Speaker", "Compact Clip-On"],
    count: 10, priceMin: 1200, priceMax: 18000, unit: "pcs",
  },
  {
    categoryNames: ["Smart Watches", "Activity & Fitness Trackers"],
    department: "Electronics",
    keyword: "smartwatch",
    typeLabel: "Smart Watch",
    brands: ["Samsung", "Apple", "Garmin", "Fitbit", "Noise", "boAt"],
    variants: ["Fitness Edition", "GPS Edition", "Classic Edition", "Sport Band"],
    count: 12, priceMin: 2000, priceMax: 55000, unit: "pcs",
  },
  {
    categoryNames: ["Cameras"],
    department: "Cameras & Optics",
    keyword: "camera",
    typeLabel: "Digital Camera",
    brands: ["Canon", "Nikon", "Sony", "Fujifilm", "GoPro"],
    variants: ["Mirrorless", "DSLR", "Action Camera", "Point & Shoot"],
    count: 10, priceMin: 8000, priceMax: 180000, unit: "pcs",
  },
  {
    categoryNames: ["Refrigerators"],
    department: "Electronics",
    keyword: "refrigerator",
    typeLabel: "Refrigerator",
    brands: ["Samsung", "LG", "Walton", "Whirlpool", "Vision", "Singer"],
    variants: ["single door, 200L", "double door, 350L", "side-by-side, 500L"],
    count: 8, priceMin: 25000, priceMax: 150000, unit: "pcs",
  },
  {
    categoryNames: ["Air Conditioners"],
    department: "Electronics",
    keyword: "air-conditioner",
    typeLabel: "Air Conditioner",
    brands: ["Samsung", "LG", "Walton", "Vision"],
    variants: ["1 Ton Split", "1.5 Ton Split", "2 Ton Split"],
    count: 8, priceMin: 35000, priceMax: 120000, unit: "pcs",
  },
  {
    categoryNames: ["Washing Machines"],
    department: "Electronics",
    keyword: "washing-machine",
    typeLabel: "Washing Machine",
    brands: ["Samsung", "LG", "Walton", "Whirlpool", "Vision", "Singer"],
    variants: ["Top Load, 7kg", "Front Load, 8kg", "Semi-Automatic, 10kg"],
    count: 8, priceMin: 18000, priceMax: 90000, unit: "pcs",
  },
  {
    categoryNames: ["External Batteries", "Portable Batteries & Chargers"],
    department: "Electronics",
    keyword: "powerbank",
    typeLabel: "Power Bank",
    brands: ["Anker", "Xiaomi", "Samsung", "boAt", "pTron"],
    variants: ["10000mAh", "20000mAh", "30000mAh Fast Charge"],
    count: 10, priceMin: 800, priceMax: 6000, unit: "pcs",
  },
  {
    categoryNames: ["Wireless Routers"],
    department: "Electronics",
    keyword: "router",
    typeLabel: "Wi-Fi Router",
    brands: ["TP-Link", "D-Link", "Netgear"],
    variants: ["Dual-Band AC1200", "Mesh System", "Gigabit Gaming Router"],
    count: 8, priceMin: 1500, priceMax: 15000, unit: "pcs",
  },
  {
    categoryNames: ["Printers"],
    department: "Electronics",
    keyword: "printer",
    typeLabel: "Printer",
    brands: ["HP", "Canon", "Epson"],
    variants: ["Inkjet All-in-One", "Laser Monochrome", "Photo Printer"],
    count: 8, priceMin: 6000, priceMax: 45000, unit: "pcs",
  },
  {
    categoryNames: ["Video Game Console Accessories", "Game Consoles"],
    department: "Electronics",
    keyword: "gaming-console",
    typeLabel: "Gaming Console",
    brands: ["PlayStation", "Xbox", "Nintendo"],
    variants: ["Standard Edition", "Digital Edition", "Bundle Pack"],
    count: 8, priceMin: 25000, priceMax: 75000, unit: "pcs",
  },
  {
    categoryNames: ["Computer Memory", "Data Storage"],
    department: "Electronics",
    keyword: "memory-card",
    typeLabel: "Storage Drive",
    brands: ["SanDisk", "Kingston", "Samsung", "Western Digital", "Seagate"],
    variants: ["64GB microSD", "128GB Pen Drive", "1TB External HDD", "500GB SSD"],
    count: 10, priceMin: 500, priceMax: 9000, unit: "pcs",
  },
  {
    categoryNames: ["Cell Phone Cases", "Mobile Phone Accessories"],
    department: "Electronics",
    keyword: "phone-case",
    typeLabel: "Phone Accessory",
    brands: ["Anker", "boAt", "pTron", "Samsung"],
    variants: ["Protective Case", "Fast Charger", "USB-C Cable", "Screen Protector"],
    count: 13, priceMin: 150, priceMax: 2500, unit: "pcs",
  },

  // ── Apparel (~150) ───────────────────────────────────────────────────────
  {
    categoryNames: ["T-Shirts", "Shirts"],
    department: "Apparel & Accessories",
    keyword: "t-shirt",
    typeLabel: "T-Shirt",
    brands: ["Nike", "Adidas", "Puma", "H&M", "Zara", "Uniqlo", "Yellow", "Ecstasy"],
    variants: ["Small, Black", "Medium, White", "Large, Navy", "XL, Grey"],
    count: 20, priceMin: 350, priceMax: 2500, unit: "pcs",
  },
  {
    categoryNames: ["Dresses"],
    department: "Apparel & Accessories",
    keyword: "dress",
    typeLabel: "Dress",
    brands: ["Zara", "H&M", "Mango", "Aarong", "Yellow"],
    variants: ["Small, Floral", "Medium, Solid", "Large, Printed"],
    count: 15, priceMin: 800, priceMax: 6000, unit: "pcs",
  },
  {
    categoryNames: ["Jeans", "Pants"],
    department: "Apparel & Accessories",
    keyword: "jeans",
    typeLabel: "Jeans",
    brands: ["Levi's", "H&M", "Zara", "Uniqlo", "Gap"],
    variants: ["30 Waist, Slim", "32 Waist, Regular", "34 Waist, Straight", "36 Waist, Relaxed"],
    count: 15, priceMin: 900, priceMax: 4500, unit: "pcs",
  },
  {
    categoryNames: ["Athletic Shoes", "Shoes"],
    department: "Apparel & Accessories",
    keyword: "sneakers",
    typeLabel: "Sneakers",
    brands: ["Nike", "Adidas", "Puma", "Bata", "Apex", "Skechers", "Converse", "Vans"],
    variants: ["Size 40", "Size 41", "Size 42", "Size 43", "Size 44"],
    count: 25, priceMin: 1200, priceMax: 15000, unit: "pcs",
  },
  {
    categoryNames: ["Dress Shoes", "Formal Shoes"],
    department: "Apparel & Accessories",
    keyword: "formal-shoes",
    typeLabel: "Formal Shoes",
    brands: ["Bata", "Apex", "Jockey"],
    variants: ["Size 40, Black", "Size 42, Brown", "Size 44, Black"],
    count: 10, priceMin: 1500, priceMax: 8000, unit: "pcs",
  },
  {
    categoryNames: ["Handbags"],
    department: "Apparel & Accessories",
    keyword: "handbag",
    typeLabel: "Handbag",
    brands: ["Aarong", "Zara", "H&M"],
    variants: ["Tote", "Crossbody", "Clutch", "Shoulder Bag"],
    count: 12, priceMin: 900, priceMax: 8000, unit: "pcs",
  },
  {
    categoryNames: ["Belts"],
    department: "Apparel & Accessories",
    keyword: "belt",
    typeLabel: "Leather Belt",
    brands: ["Bata", "Apex"],
    variants: ["Black, 32-inch", "Brown, 34-inch", "Black, 36-inch"],
    count: 8, priceMin: 350, priceMax: 2000, unit: "pcs",
  },
  {
    categoryNames: ["Jackets", "Coats & Outerwear"],
    department: "Apparel & Accessories",
    keyword: "jacket",
    typeLabel: "Jacket",
    brands: ["The North Face", "Columbia", "Zara", "H&M"],
    variants: ["Small, Windbreaker", "Medium, Denim", "Large, Puffer"],
    count: 12, priceMin: 1200, priceMax: 9000, unit: "pcs",
  },
  {
    categoryNames: ["Activewear"],
    department: "Apparel & Accessories",
    keyword: "activewear",
    typeLabel: "Activewear Set",
    brands: ["Nike", "Adidas", "Under Armour", "Puma", "Reebok"],
    variants: ["Small, Training Set", "Medium, Running Set", "Large, Yoga Set"],
    count: 15, priceMin: 700, priceMax: 5000, unit: "pcs",
  },
  {
    categoryNames: ["Kids' Clothing", "Children's Clothing"],
    department: "Apparel & Accessories",
    keyword: "kids-clothing",
    typeLabel: "Kids' Outfit",
    brands: ["H&M", "Uniqlo", "Aarong"],
    variants: ["2-3 Years", "4-5 Years", "6-7 Years"],
    count: 10, priceMin: 400, priceMax: 2200, unit: "pcs",
  },
  {
    categoryNames: ["Ethnic Wear", "Traditional Clothing"],
    department: "Apparel & Accessories",
    keyword: "traditional-dress",
    typeLabel: "Ethnic Wear",
    brands: ["Aarong", "Yellow", "Rich"],
    variants: ["Small", "Medium", "Large"],
    count: 8, priceMin: 1200, priceMax: 12000, unit: "pcs",
  },

  // ── Cosmetics / Health & Beauty (~100) ─────────────────────────────────
  {
    categoryNames: ["Skin Care", "Skin Care Products"],
    department: "Health & Beauty",
    keyword: "skincare",
    typeLabel: "Skincare Cream",
    brands: ["L'Oréal", "Nivea", "Olay", "Himalaya", "Garnier", "Neutrogena", "Ponds", "Vaseline"],
    variants: ["Day Cream 50ml", "Night Cream 50ml", "Moisturizing Lotion 100ml", "Anti-Aging Serum 30ml"],
    count: 20, priceMin: 150, priceMax: 3000, unit: "pcs",
  },
  {
    categoryNames: ["Makeup", "Lip Makeup"],
    department: "Health & Beauty",
    keyword: "lipstick",
    typeLabel: "Makeup",
    brands: ["Maybelline", "L'Oréal"],
    variants: ["Matte Lipstick", "Liquid Foundation", "Kajal Eyeliner", "Compact Powder"],
    count: 15, priceMin: 200, priceMax: 2200, unit: "pcs",
  },
  {
    categoryNames: ["Hair Care", "Shampoo"],
    department: "Health & Beauty",
    keyword: "shampoo",
    typeLabel: "Shampoo",
    brands: ["Pantene", "Sunsilk", "Tresemmé", "Head & Shoulders", "Dove"],
    variants: ["200ml Anti-Dandruff", "340ml Smooth & Silky", "180ml Hair Fall Control"],
    count: 15, priceMin: 120, priceMax: 900, unit: "pcs",
  },
  {
    categoryNames: ["Oral Care", "Toothpaste"],
    department: "Health & Beauty",
    keyword: "toothpaste",
    typeLabel: "Toothpaste",
    brands: ["Colgate", "Sensodyne", "Oral-B"],
    variants: ["100g Whitening", "150g Sensitive Relief", "100g Cavity Protection"],
    count: 10, priceMin: 60, priceMax: 400, unit: "pcs",
  },
  {
    categoryNames: ["Bar Soap", "Body Wash"],
    department: "Health & Beauty",
    keyword: "soap",
    typeLabel: "Soap & Body Wash",
    brands: ["Dove", "Lifebuoy", "Dettol"],
    variants: ["75g Bar Soap", "250ml Body Wash", "3-Pack Bar Soap"],
    count: 10, priceMin: 40, priceMax: 500, unit: "pcs",
  },
  {
    categoryNames: ["Perfume", "Fragrances"],
    department: "Health & Beauty",
    keyword: "perfume",
    typeLabel: "Perfume",
    brands: ["L'Oréal", "Nivea"],
    variants: ["Eau de Parfum 50ml", "Body Mist 100ml", "Eau de Toilette 100ml"],
    count: 10, priceMin: 300, priceMax: 4500, unit: "pcs",
  },
  {
    categoryNames: ["Sunscreen"],
    department: "Health & Beauty",
    keyword: "sunscreen",
    typeLabel: "Sunscreen",
    brands: ["Neutrogena", "Nivea", "Garnier"],
    variants: ["SPF 50 50ml", "SPF 30 100ml"],
    count: 8, priceMin: 300, priceMax: 1800, unit: "pcs",
  },
  {
    categoryNames: ["Facial Cleansers", "Face Wash"],
    department: "Health & Beauty",
    keyword: "face-wash",
    typeLabel: "Face Wash",
    brands: ["Himalaya", "Garnier", "Neutrogena", "Ponds"],
    variants: ["100ml Oil Control", "150ml Deep Clean", "100ml Brightening"],
    count: 12, priceMin: 150, priceMax: 900, unit: "pcs",
  },

  // ── Home, toys, and other departments (~70) ─────────────────────────────
  {
    categoryNames: ["Sofas"],
    department: "Furniture",
    keyword: "sofa",
    typeLabel: "Sofa Set",
    brands: ["Otobi", "Hatil", "IKEA", "Akhtar Furniture", "Brothers Furniture", "Partex"],
    variants: ["3-Seater", "L-Shape Sectional", "2-Seater Loveseat"],
    count: 8, priceMin: 15000, priceMax: 120000, unit: "pcs",
  },
  {
    categoryNames: ["Kitchen & Dining", "Cookware & Bakeware"],
    department: "Home & Garden",
    keyword: "kitchenware",
    typeLabel: "Kitchenware Set",
    brands: ["Prestige", "Tefal", "Black+Decker"],
    variants: ["Non-Stick Cookware Set", "Pressure Cooker 5L", "Stainless Steel Utensil Set"],
    count: 10, priceMin: 800, priceMax: 9000, unit: "pcs",
  },
  {
    categoryNames: ["Toys"],
    department: "Toys & Games",
    keyword: "toy",
    typeLabel: "Toy",
    brands: ["LEGO", "Hasbro", "Mattel", "Fisher-Price", "Hot Wheels", "Nerf"],
    variants: ["Building Set", "Action Figure", "Remote Control Car", "Puzzle Set"],
    count: 12, priceMin: 300, priceMax: 6000, unit: "pcs",
  },
  {
    categoryNames: ["Bicycles"],
    department: "Sporting Goods",
    keyword: "bicycle",
    typeLabel: "Bicycle",
    brands: [],
    variants: ["Mountain Bike, 26-inch", "Road Bike, 700c", "Kids Bike, 20-inch"],
    count: 6, priceMin: 6000, priceMax: 45000, unit: "pcs",
  },
  {
    categoryNames: ["Diapers"],
    department: "Baby & Toddler",
    keyword: "diaper",
    typeLabel: "Diapers",
    brands: ["Pampers", "Huggies", "MamyPoko"],
    variants: ["Small, 50 Pack", "Medium, 44 Pack", "Large, 40 Pack"],
    count: 8, priceMin: 500, priceMax: 1800, unit: "pcs",
  },
  {
    categoryNames: ["Pet Food"],
    department: "Animals & Pet Supplies",
    keyword: "pet-food",
    typeLabel: "Pet Food",
    brands: ["Pedigree", "Whiskas", "Royal Canin"],
    variants: ["1.5kg Dry Food", "3kg Dry Food", "400g Wet Food Pack"],
    count: 6, priceMin: 300, priceMax: 3500, unit: "pcs",
  },
  {
    categoryNames: ["Writing Pens", "Pens"],
    department: "Office Supplies",
    keyword: "pen",
    typeLabel: "Stationery",
    brands: ["Parker", "Pilot", "Faber-Castell", "Staedtler"],
    variants: ["Ballpoint Pen Set", "Gel Pen Pack", "Sketch Pencil Set"],
    count: 6, priceMin: 50, priceMax: 2500, unit: "pcs",
  },
  {
    categoryNames: ["Luggage", "Suitcases"],
    department: "Luggage & Bags",
    keyword: "luggage",
    typeLabel: "Luggage",
    brands: ["Samsonite", "American Tourister", "VIP", "Wildcraft"],
    variants: ["20-inch Cabin", "24-inch Medium", "28-inch Large"],
    count: 6, priceMin: 3500, priceMax: 25000, unit: "pcs",
  },
  {
    categoryNames: ["Snack Foods", "Cookies & Biscuits"],
    department: "Food, Beverages & Tobacco",
    keyword: "snacks",
    typeLabel: "Packaged Snacks",
    brands: ["Pran", "Olympic Industries", "Britannia", "Bombay Sweets"],
    variants: ["Biscuit Pack", "Chips Pack", "Cookie Box"],
    count: 8, priceMin: 20, priceMax: 500, unit: "pcs",
  },
];

const shortDescriptionFor = (typeLabel: string, brand: string | null) =>
  brand
    ? `Genuine ${brand} ${typeLabel.toLowerCase()} — everyday quality at a fair price.`
    : `A reliable, everyday ${typeLabel.toLowerCase()}.`;

const overviewFor = (title: string, typeLabel: string) =>
  `${title} is part of our ${typeLabel.toLowerCase()} lineup, picked for solid everyday quality and value. Full specifications and care instructions are included in the box.`;

const run = async () => {
  await connectDB();

  const categoryCache = new Map<string, mongoose.Types.ObjectId>();
  const resolveCategory = async (
    candidates: string[],
    department: string,
  ): Promise<mongoose.Types.ObjectId | null> => {
    for (const name of [...candidates, department]) {
      if (categoryCache.has(name)) return categoryCache.get(name)!;
      const found = await Category.findOne({ name });
      if (found) {
        categoryCache.set(name, found._id as mongoose.Types.ObjectId);
        return found._id as mongoose.Types.ObjectId;
      }
    }
    return null;
  };

  const brandCache = new Map<string, mongoose.Types.ObjectId | null>();
  const resolveBrand = async (
    name: string,
  ): Promise<mongoose.Types.ObjectId | null> => {
    if (brandCache.has(name)) return brandCache.get(name)!;
    const found = await Brand.findOne({ name });
    const id = found ? (found._id as mongoose.Types.ObjectId) : null;
    brandCache.set(name, id);
    return id;
  };

  let skuCounter = 1;
  let created = 0;
  let existing = 0;
  let skippedNoCategory = 0;

  for (const type of productTypes) {
    const categoryId = await resolveCategory(type.categoryNames, type.department);
    if (!categoryId) {
      skippedNoCategory += type.count;
      console.warn(`No category found for "${type.typeLabel}" — skipped ${type.count}.`);
      continue;
    }

    for (let i = 0; i < type.count; i += 1) {
      const brandName = type.brands.length ? pick(type.brands, i) : null;
      const brandId = brandName ? await resolveBrand(brandName) : null;
      const variant = pick(type.variants, i);
      const title = brandName
        ? `${brandName} ${type.typeLabel} — ${variant}`
        : `${type.typeLabel} — ${variant}`;

      const sku = `${SKU_PREFIX}${String(skuCounter).padStart(SKU_WIDTH, "0")}`;
      skuCounter += 1;

      const found = await Product.findOne({ sku });
      if (found) {
        existing += 1;
        continue;
      }

      const price = randomInt(type.priceMin, type.priceMax);
      const hasDiscount = Math.random() < 0.3;
      const discountPrice = hasDiscount
        ? Math.max(1, Math.round((price * (0.7 + Math.random() * 0.2)) / 10) * 10)
        : undefined;

      const imageSeed = sku;
      const featureImage = imageFor(type.keyword, imageSeed, 0);
      const galleryImages = [1, 2, 3].map((offset) =>
        imageFor(type.keyword, imageSeed, offset),
      );

      await Product.create({
        title,
        sku,
        category: categoryId,
        brand: brandId,
        shortDescription: shortDescriptionFor(type.typeLabel, brandName),
        overview: overviewFor(title, type.typeLabel),
        featureImage,
        galleryImages,
        price,
        discountPrice,
        unit: type.unit,
        weight: 0,
        stock: Math.round(5 + Math.random() * 195),
        isActive: true,
        isFeatured: Math.random() < 0.06,
        sortOrder: created,
      });
      created += 1;
    }
  }

  console.log(
    `Products ready: ${created} created, ${existing} already existed, ${skippedNoCategory} skipped (no matching category).`,
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Product seeding failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
