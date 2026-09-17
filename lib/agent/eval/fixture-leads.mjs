/**
 * lib/agent/eval/fixture-leads.mjs — the offline lead set for the model eval (ops#7).
 *
 * SYNTHETIC. Every business here is invented: names are made up, phone numbers
 * are in the reserved 555-01xx fictional range, websites use the reserved
 * `.example` TLD. Real scraped leads are unverified PII and stay out of git
 * (see scripts/export-agent-lead.mjs) — for the decision run on real leads, use
 * `--from-db N`, which reads them from Supabase at run time and commits nothing.
 *
 * Shape: two leads per palette-preset trade, one rich (hours, rating, notes,
 * address — what a good Outscraper row looks like) and one sparse (name, trade
 * and town only). Sparse leads are where a weaker model is most tempted to
 * fabricate, which is exactly what the judge penalises.
 *
 * @module agent/eval/fixture-leads
 */

const WEEKDAY_HOURS = {
  Monday: '7 AM–6 PM',
  Tuesday: '7 AM–6 PM',
  Wednesday: '7 AM–6 PM',
  Thursday: '7 AM–6 PM',
  Friday: '7 AM–6 PM',
  Saturday: '8 AM–2 PM',
  Sunday: 'Closed',
};

export const FIXTURE_LEADS = [
  {
    name: 'Cedar Hollow Lawn & Garden',
    category: 'landscaping',
    city: 'Boise',
    region: 'ID',
    phone: '(208) 555-0143',
    email: 'office@cedarhollow.example',
    website: 'https://cedarhollow.example',
    rating: 4.8,
    reviewCount: 112,
    notes:
      'Google Business Profile description: Family-owned lawn care, seasonal cleanups and ' +
      'water-wise xeriscape installs across the Treasure Valley. 112 Google reviews averaging 4.8★.',
    hours: WEEKDAY_HOURS,
    streetAddress: '1420 W Fairview Ave',
    photos: [],
  },
  {
    name: 'Tallgrass Yard Care',
    category: 'landscaping',
    city: 'Tulsa',
    region: 'OK',
    photos: [],
  },
  {
    name: 'Two Oaks Junk Hauling',
    category: 'junk removal service',
    city: 'Richmond',
    region: 'VA',
    phone: '(804) 555-0178',
    website: 'https://twooakshauling.example',
    rating: 4.9,
    reviewCount: 238,
    notes:
      'Google Business Profile description: Same-day pickup for furniture, appliances and ' +
      'garage cleanouts. Usable items are donated to local charities. Categories: Junk removal ' +
      'service, Demolition contractor.',
    hours: WEEKDAY_HOURS,
    streetAddress: '3100 Hull St',
    photos: [],
  },
  {
    name: 'Clearway Hauling',
    category: 'junk removal service',
    city: 'Fresno',
    region: 'CA',
    phone: '(559) 555-0121',
    photos: [],
  },
  {
    name: 'Laurel Cove Pressure Washing',
    category: 'pressure washing service',
    city: 'Asheville',
    region: 'NC',
    phone: '(828) 555-0164',
    website: 'https://laurelcove.example',
    rating: 4.7,
    reviewCount: 64,
    notes:
      'Google Business Profile description: Soft-wash roof cleaning, house washing, deck and ' +
      'driveway cleaning for homes in the mountains. Categories: Pressure washing service, ' +
      'Roof cleaning service.',
    hours: WEEKDAY_HOURS,
    photos: [],
  },
  {
    name: 'Brightside Exterior Cleaning',
    category: 'pressure washing service',
    city: 'Lubbock',
    region: 'TX',
    rating: 5,
    reviewCount: 7,
    photos: [],
  },
  {
    name: 'Juniata Stoneworks & Fence',
    category: 'concrete contractor',
    city: 'Harrisburg',
    region: 'PA',
    phone: '(717) 555-0187',
    website: 'https://juniatastoneworks.example',
    rating: 4.6,
    reviewCount: 41,
    notes:
      'Google Business Profile description: Stamped concrete patios, driveways, retaining walls, ' +
      'and vinyl or cedar fence installation. Categories: Concrete contractor, Fence contractor.',
    hours: WEEKDAY_HOURS,
    streetAddress: '800 S Cameron St',
    photos: [],
  },
  {
    name: 'Saguaro Line Fencing',
    category: 'fence contractor',
    city: 'Mesa',
    region: 'AZ',
    photos: [],
  },
];
