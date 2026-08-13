/**
 * lib/schema/content-packs — per-vertical content packs (vendored).
 *
 * Vendored from hirobius site-engine `packages/schema/src/content-packs.ts`
 * (site-engine#118). Ported .ts → .mjs (type-only exports dropped). Re-sync on
 * contract change; do not fork the meaning.
 *
 * A pack is a better generation prior + a lower floor for a hand-written
 * config: trade-generic default services and CTA copy so a config with just
 * business facts still renders a complete page. Packs never contain business
 * facts (phone, hours, service areas, reviews, address) — those come from
 * intake only. `defineClient()` merges a pack in with override-only semantics:
 * any field the config sets explicitly wins.
 */

export const CONTENT_PACKS = {
  landscaping: {
    services: [
      {
        title: 'Lawn Care & Maintenance',
        description:
          'Regular mowing, edging, and fertilization to keep your lawn healthy and green all season.',
      },
      {
        title: 'Landscape Design & Installation',
        description:
          'Custom planting beds, shrubs, and hardscaping designed to fit your property and budget.',
      },
      {
        title: 'Mulching & Bed Maintenance',
        description: 'Fresh mulch and weed control to keep garden beds looking sharp year-round.',
      },
      {
        title: 'Irrigation & Drainage',
        description:
          'Sprinkler system installation and repair, plus drainage solutions for problem areas.',
      },
      {
        title: 'Seasonal Cleanup',
        description:
          'Spring and fall cleanups — leaf removal, bed prep, and pruning to reset your yard.',
      },
    ],
    ctaLabel: 'Get a Free Lawn Quote',
    sectionOrder: ['services', 'reviews', 'gallery', 'serviceAreaMap', 'contact'],
  },
  'junk-removal': {
    services: [
      {
        title: 'Residential Junk Removal',
        description:
          'Fast, full-service hauling for garages, basements, attics, and estate cleanouts.',
      },
      {
        title: 'Furniture & Appliance Removal',
        description:
          "We haul away old couches, mattresses, and appliances so you don't have to lift a finger.",
      },
      {
        title: 'Construction Debris Removal',
        description: 'Post-renovation and job-site debris hauled away quickly and responsibly.',
      },
      {
        title: 'Commercial Junk Removal',
        description: 'Office cleanouts and commercial hauling scheduled around your business hours.',
      },
      {
        title: 'Same-Day Junk Pickup',
        description: "Book today, and we'll often have your junk gone before the day is out.",
      },
    ],
    ctaLabel: 'Get a Free Hauling Quote',
    sectionOrder: ['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'],
  },
  'pressure-washing': {
    services: [
      {
        title: 'House Washing',
        description:
          'Soft washing that lifts dirt, mildew, and grime without damaging siding or paint.',
      },
      {
        title: 'Driveway & Concrete Cleaning',
        description: 'High-pressure cleaning that restores driveways, sidewalks, and patios like new.',
      },
      {
        title: 'Deck & Fence Washing',
        description: 'Gentle, effective cleaning that prepares wood surfaces for staining or sealing.',
      },
      {
        title: 'Roof Soft Washing',
        description:
          'Low-pressure roof cleaning that removes streaks and algae without harming shingles.',
      },
      {
        title: 'Gutter Cleaning',
        description:
          'Clogged-gutter clearing that protects your roofline and foundation from water damage.',
      },
    ],
    ctaLabel: 'Get a Free Washing Quote',
    sectionOrder: ['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'],
  },
  'concrete-fencing': {
    services: [
      {
        title: 'Concrete Driveways & Patios',
        description:
          'Poured concrete driveways, patios, and walkways built to last through every season.',
      },
      {
        title: 'Decorative & Stamped Concrete',
        description:
          'Stamped, stained, and exposed-aggregate finishes that add curb appeal without the upkeep.',
      },
      {
        title: 'Fence Installation & Repair',
        description:
          'Wood, vinyl, and chain-link fencing installed or repaired to keep your property secure.',
      },
      {
        title: 'Concrete Repair & Leveling',
        description: 'Crack repair and slab leveling that fix trip hazards and stop further damage.',
      },
      {
        title: 'Retaining Walls',
        description:
          'Retaining wall construction that manages grade and drainage while framing your yard.',
      },
    ],
    ctaLabel: 'Get a Free Project Estimate',
    sectionOrder: ['services', 'reviews', 'gallery', 'serviceAreaMap', 'contact'],
  },
};
