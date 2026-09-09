import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Brand } from "../models/brand.model";

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// picsum.photos is unreachable from this network (TLS handshake hangs,
// likely blocked upstream) — ui-avatars.com renders a plain PNG initials
// badge instead, which also sidesteps Next.js's SVG image-optimizer gate.
const logoFor = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=600&background=0D8ABC&color=ffffff&bold=true`;

const needsRepair = (url: string) => !url || url.includes("picsum.photos");

// Real, widely recognized brands (global + South Asian/Bangladeshi, since
// this is a Bangla-market platform), grouped by the product domain they're
// known for. Logos are placeholder initials badges (see logoFor above) — no
// free bulk logo-lookup API is currently usable (Clearbit is discontinued,
// logo.dev/Brandfetch require a paid key), so upload each brand's real logo
// from the dashboard once you're ready to use it for actual listings.
const brandGroups: Array<{ description: string; names: string[] }> = [
  {
    description: "Mobile phones, computers, and consumer electronics",
    names: [
      "Samsung", "Apple", "Sony", "LG", "Xiaomi", "Huawei", "OnePlus",
      "Panasonic", "Philips", "Sharp", "Toshiba", "Realme", "Oppo", "Vivo",
      "Nokia", "Motorola", "Google", "Dell", "HP", "Lenovo", "Asus", "Acer",
      "Microsoft", "Intel", "AMD", "Nvidia", "Walton", "Symphony",
      "Minister", "Marcel", "Vision", "Singer", "Infinix", "Tecno", "itel",
      "Redmi", "Honor", "ZTE",
    ],
  },
  {
    description: "Audio, wearables, and mobile/computer accessories",
    names: [
      "JBL", "Bose", "Logitech", "Anker", "Sennheiser", "Skullcandy",
      "Beats", "Razer", "HyperX", "Fitbit", "Garmin", "TP-Link", "D-Link",
      "Netgear", "Belkin", "SanDisk", "Western Digital", "Seagate",
      "Kingston", "Corsair", "boAt", "Noise", "pTron", "Zebronics",
    ],
  },
  {
    description: "Cameras, lenses, and photography/optics equipment",
    names: ["Canon", "Nikon", "Fujifilm", "GoPro", "DJI", "Epson"],
  },
  {
    description: "Apparel, footwear, and fashion accessories",
    names: [
      "Nike", "Adidas", "Puma", "Reebok", "Under Armour", "New Balance",
      "Levi's", "H&M", "Zara", "Uniqlo", "Gap", "Tommy Hilfiger",
      "Calvin Klein", "Lacoste", "Fila", "Converse", "Vans", "Skechers",
      "Crocs", "Timberland", "The North Face", "Columbia", "Aarong",
      "Yellow", "Ecstasy", "Cat's Eye", "Rich", "Sailor", "Bata", "Apex",
      "Jockey", "Mango", "Esprit",
    ],
  },
  {
    description: "Skincare, cosmetics, and personal care",
    names: [
      "L'Oréal", "Nivea", "Dove", "Garnier", "Neutrogena", "Olay",
      "Maybelline", "Vaseline", "Ponds", "Himalaya", "Johnson & Johnson",
      "Colgate", "Sensodyne", "Oral-B", "Gillette", "Head & Shoulders",
      "Pantene", "Tresemmé", "Sunsilk", "Dettol", "Lifebuoy", "Emami",
    ],
  },
  {
    description: "Home appliances, furniture, and household goods",
    names: [
      "IKEA", "Otobi", "Hatil", "Akhtar Furniture", "Brothers Furniture",
      "Partex", "Whirlpool", "Miele", "Dyson", "Tefal", "Prestige",
      "Black+Decker", "Bosch",
    ],
  },
  {
    description: "Sporting goods and outdoor gear",
    names: ["Wilson", "Spalding", "Decathlon", "Yonex", "Head", "Speedo"],
  },
  {
    description: "Toys, games, and kids' entertainment",
    names: [
      "LEGO", "Hasbro", "Mattel", "Fisher-Price", "Hot Wheels", "Barbie",
      "Nerf", "PlayStation", "Xbox", "Nintendo",
    ],
  },
  {
    description: "Vehicles, motorcycles, and automotive parts",
    names: [
      "Toyota", "Honda", "Suzuki", "Hyundai", "Nissan", "Ford", "Yamaha",
      "Bajaj", "TVS", "Hero", "Runner",
    ],
  },
  {
    description: "Baby and toddler essentials",
    names: ["Pampers", "Huggies", "Johnson's Baby", "MamyPoko", "Chicco"],
  },
  {
    description: "Bags, luggage, and travel gear",
    names: ["Samsonite", "American Tourister", "Wildcraft", "VIP"],
  },
  {
    description: "Office supplies and stationery",
    names: ["Xerox", "Faber-Castell", "Parker", "Pilot", "Staedtler"],
  },
  {
    description: "Software and digital tools",
    names: ["Adobe", "Autodesk", "McAfee", "Norton"],
  },
  {
    description: "Packaged food, snacks, and beverages",
    names: [
      "Coca-Cola", "Pepsi", "Nestlé", "Unilever", "Pran", "Akij Food",
      "Bombay Sweets", "Fresh", "ACI", "Square", "Radhuni", "Ispahani",
      "Britannia", "Olympic Industries", "Bashundhara", "City Group",
      "Meghna Group", "Kellogg's", "Danone",
    ],
  },
  {
    description: "Pet food, toys, and accessories",
    names: ["Pedigree", "Whiskas", "Royal Canin"],
  },
];

const defaultBrands = brandGroups
  .flatMap(({ description, names }) =>
    names.map((name) => ({ name, description, isActive: true })),
  )
  .map((entry) => ({ ...entry, logo: logoFor(entry.name) }));

const run = async () => {
  await connectDB();

  let created = 0;
  let existing = 0;
  let repaired = 0;

  for (const [index, brand] of defaultBrands.entries()) {
    const found = await Brand.findOne({ name: brand.name });
    if (found) {
      existing += 1;
      if (needsRepair(found.logo ?? "")) {
        found.logo = brand.logo;
        await found.save();
        repaired += 1;
      }
      continue;
    }

    await Brand.create({
      ...brand,
      sortOrder: index * 10,
    });
    created += 1;
  }

  console.log(
    `Default brands ready: ${created} created, ${existing} already existed (${repaired} logo repaired).`,
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Brand seeding failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
