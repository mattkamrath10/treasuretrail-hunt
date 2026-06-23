-- =====================================================================
-- Seed the first batch of blog articles (Phase 2 — "first articles").
--
-- Idempotent: upserts by slug, so re-running updates the same rows rather
-- than duplicating. Bodies use dollar-quoting ($md$...$md$) so apostrophes
-- in the markdown don't need escaping. All rows are published immediately.
--
-- Safe to run only AFTER 20260623000000_blog_posts.sql (creates the table).
-- =====================================================================

insert into public.blog_posts
  (slug, title, seo_title, meta_description, excerpt, body_md, category, tags,
   county, city, faq, author, read_minutes, status, published_at)
values
-- 1) Estate sales — Fresno County ------------------------------------
(
  'estate-sales-fresno-county-guide',
  'Estate Sales in Fresno County: A Treasure Hunter''s Guide',
  'Estate Sales in Fresno County: Buyer''s Guide',
  'How to find, prep for, and win the best estate sales across Fresno County, CA — timing, pricing, and the items worth showing up early for.',
  'Everything you need to find and win estate sales across Fresno County — from where to look to how to negotiate on the last day.',
  $md$Estate sales are one of the richest hunting grounds in the Central Valley, and Fresno County runs them almost every weekend. Whether you collect, resell, or just love a good find, knowing how these sales work is the difference between leftovers and treasure.

## Where estate sales happen in Fresno County

Most sales cluster around Fresno, Clovis, and the older neighborhoods where homes have decades of accumulated belongings. Northeast Fresno and the Tower District tend to produce vintage furniture, mid-century decor, and collectibles, while rural properties toward Sanger and Kingsburg often hide tools, farm equipment, and Americana.

## When to go (and what it means for price)

- **Day one, first hour:** full selection, full price. Go now for rare or high-demand items.
- **Day one, afternoon:** light haggling starts. Good balance of selection and flexibility.
- **Final day:** deep discounts, often 50% off or "fill a box for $5." Go now for volume and resale lots.

## What to bring

Cash in small bills, a tape measure, a phone for quick value checks, and your own boxes or bags. Sellers rarely provide packing material, and the best deals go to buyers who can grab and go.

## Items worth showing up early for

Sterling silver, costume jewelry, vintage tools, cast iron, first-edition books, mid-century furniture, and anything Pyrex. These move fast because resellers know their value.

If you want to skip the guesswork, browse upcoming [estate sales near you](/live) on TreasureTrail — listings update as hosts post new sales across the Valley.
$md$,
  'estate-sales',
  array['estate sales','fresno county','central valley','reselling','collectibles'],
  'Fresno County', 'Fresno',
  $faq$[
    {"q":"What day is best for estate sales in Fresno?","a":"For selection go on the first morning; for the deepest discounts go on the final day, when many sales offer 50% off or bulk pricing."},
    {"q":"Do Fresno estate sales take cards?","a":"Some larger companies do, but cash in small bills is always safest and often gets you a better price."},
    {"q":"How do I find estate sales near me?","a":"Check TreasureTrail's live events for sales posted across Fresno County and the Central Valley, and arrive early for the best items."}
  ]$faq$,
  'TreasureTrail', 3, 'published', now()
),
-- 2) Garage sales — Central Valley routes ----------------------------
(
  'central-valley-garage-sale-route-tips',
  'How to Plan a Winning Garage Sale Route in the Central Valley',
  'Central Valley Garage Sale Route Tips',
  'Plan an efficient garage sale route across the Central Valley — map your stops, time your morning, and find the best yard sales from Madera to Bakersfield.',
  'Stop driving in circles. Here''s how to map an efficient Saturday garage sale route across the Central Valley.',
  $md$A great garage sale Saturday is won the night before. The hunters who come home with full trunks aren''t lucky — they planned a tight route and started early.

## Build your list Friday night

Scan listings and note addresses, start times, and any "early birds welcome" notes. Group stops by town — Madera, Fresno, Visalia, and Bakersfield each have their own rhythm — so you''re not crisscrossing Highway 99 all morning.

## Map it by neighborhood, not by distance

Cluster sales that are within a few minutes of each other and hit them in a loop. Older, established neighborhoods usually have more sales packed close together, which means less driving and more browsing.

## Time your morning

- **6:30–7:30 AM:** the serious hunting window. Best items, least competition.
- **7:30–9:30 AM:** the sweet spot for families and casual finds.
- **After 11 AM:** sellers want it gone — great time to make a bundle offer.

## Negotiate kindly

Garage sale pricing is meant to move. A friendly "would you take five for these three?" works far better than lowballing. Bring small bills so you can pay exact change.

Ready to plan this weekend? Browse [garage sales near you](/live) on TreasureTrail and save the ones you want to hit.
$md$,
  'garage-sales',
  array['garage sales','yard sales','central valley','route planning','madera','bakersfield'],
  'Madera County', null,
  $faq$[
    {"q":"What time should I start garage sale hunting?","a":"Serious hunters start between 6:30 and 7:30 AM for the best selection; bundle deals are easiest after 11 AM when sellers want to clear out."},
    {"q":"How do I plan an efficient route?","a":"Group sales by neighborhood rather than by distance, and hit clustered stops in a loop to minimize driving along Highway 99."}
  ]$faq$,
  'TreasureTrail', 3, 'published', now()
),
-- 3) Flea markets — Tulare County ------------------------------------
(
  'tulare-county-flea-market-finds',
  'Flea Market Finds in Tulare County: What to Buy and How to Haggle',
  'Tulare County Flea Market Finds & Haggling',
  'A practical guide to Tulare County flea markets — what''s worth buying, how to haggle without offending, and how to spot resale value fast.',
  'What to buy, what to skip, and how to haggle the right way at Tulare County flea markets.',
  $md$Flea markets reward the patient and the prepared. In Tulare County, the mix of vendors means you can find everything from tools to vintage glass in a single morning — if you know what to look for.

## What''s worth buying

- **Tools and hardware:** vintage hand tools hold value and sell quickly.
- **Glassware and Pyrex:** patterned pieces have a strong resale market.
- **Vintage clothing and denim:** older Levi''s and workwear are in high demand.
- **Toys and collectibles:** Hot Wheels, action figures, and tin toys.

## What to skip

Mass-produced modern decor, anything with missing parts you can''t replace, and "antiques" with no maker''s marks unless the price is trivial.

## How to haggle without offending

Start with genuine interest, ask "what''s your best on this?", and counter once — politely. Buying multiple items from one vendor is your best leverage. Cash always beats a card at the table.

## Spot resale value fast

Learn a handful of maker''s marks, keep a price-check app handy, and trust patterns over hunches. The more you go, the faster your eye gets.

Find upcoming [flea markets and swap meets](/live) near Visalia and across Tulare County on TreasureTrail.
$md$,
  'flea-markets',
  array['flea markets','tulare county','visalia','haggling','reselling','collectibles'],
  'Tulare County', 'Visalia',
  $faq$[
    {"q":"What sells best from flea markets?","a":"Vintage tools, patterned Pyrex and glassware, older denim and workwear, and collectible toys all have strong resale demand."},
    {"q":"How do I haggle politely?","a":"Show genuine interest, ask for the vendor's best price, counter once, and buy multiple items from one seller for the best leverage — cash in hand."}
  ]$faq$,
  'TreasureTrail', 3, 'published', now()
),
-- 4) Hot Wheels — collecting & value ---------------------------------
(
  'hot-wheels-hunting-value-guide',
  'Hot Wheels Hunting: How to Spot Valuable Cars in the Wild',
  'Hot Wheels Hunting & Value Guide',
  'Learn how to spot valuable Hot Wheels at garage sales, flea markets, and estate sales — Treasure Hunts, Super Treasure Hunts, and what drives resale value.',
  'Treasure Hunts, Super Treasure Hunts, and errors — how to spot the Hot Wheels worth real money.',
  $md$Hot Wheels are everywhere in the Central Valley''s sales and swap meets, which is exactly why they''re a great hunt. Most cost a dollar; a few are worth a hundred times that. Knowing the difference is the whole game.

## Treasure Hunts vs. Super Treasure Hunts

- **Treasure Hunt (TH):** look for the flame-in-a-circle logo on the card or car. Limited production, more collectible.
- **Super Treasure Hunt (STH):** the real prize. Spectraflame paint, Real Rider rubber tires, and a "TH" with the same circle logo. These command the highest prices.

## What drives value

Condition and packaging matter most. A mint car on an unbent card is worth far more than a loose one. Early castings, rare colors, and factory errors (missing tampos, wrong wheels) can spike value dramatically.

## Where to hunt locally

Estate sales and garage sales in older neighborhoods often have collections built over decades. Flea markets in Fresno, Visalia, and Bakersfield usually have at least one dedicated vendor — and end-of-day bundle deals.

## Protect your finds

Store carded cars upright away from sunlight, and keep loose cars in protective cases. UV fades Spectraflame paint fast.

Browse our [collectibles guides](/blog/category/collectibles) for more, or find [local sales](/live) where collections turn up.
$md$,
  'hot-wheels',
  array['hot wheels','collectibles','treasure hunt','super treasure hunt','reselling'],
  null, null,
  $faq$[
    {"q":"How do I spot a Super Treasure Hunt?","a":"Look for Spectraflame paint, Real Rider rubber tires, and the flame-in-a-circle 'TH' logo. These are the most valuable mainline Hot Wheels."},
    {"q":"Does the packaging matter for value?","a":"Yes — a mint car on an unbent card is worth far more than a loose one. Condition and packaging are the biggest value drivers after rarity."}
  ]$faq$,
  'TreasureTrail', 3, 'published', now()
),
-- 5) Reselling — Kern County beginners -------------------------------
(
  'reselling-for-beginners-kern-county',
  'Reselling for Beginners: Turn Central Valley Finds into Profit',
  'Reselling for Beginners in Kern County',
  'A beginner''s guide to reselling in Kern County and the Central Valley — what to source, how to price, and where to sell flips for the best margin.',
  'New to flipping? Here''s how to source, price, and sell your Central Valley finds for real profit.',
  $md$Reselling turns a weekend hobby into real income, and the Central Valley is a sourcing goldmine. Bakersfield and the rest of Kern County run estate sales, garage sales, and flea markets year-round — here''s how to start flipping with confidence.

## Start with what you know

Pick one category — tools, clothing, toys, kitchenware — and learn it deeply before branching out. Specialists spot value faster and price more accurately than generalists.

## Source smart

- **Estate sales:** best for higher-value, single-owner items.
- **Garage sales:** best for cheap volume and surprise gems.
- **Flea markets:** best for end-of-day bundle deals.

## Price for profit

Check recent sold prices (not asking prices) before you buy. A good rule of thumb: buy at no more than a third of what you can realistically sell for, to cover fees, shipping, and your time.

## Where to sell

Online marketplaces work for shippable, higher-value items. For bulky or local goods, list them where Central Valley buyers are already looking — including the [TreasureTrail marketplace](/marketplace).

## Keep simple records

Track what you paid, what you sold it for, and your fees. Even a basic spreadsheet shows you which categories actually make money.

Ready to flip your first find? List it on the [marketplace](/marketplace) and browse [local sales](/live) to source your next one.
$md$,
  'reselling',
  array['reselling','flipping','kern county','bakersfield','sourcing','beginners'],
  'Kern County', 'Bakersfield',
  $faq$[
    {"q":"How much should I pay when reselling?","a":"A common rule is to buy at no more than a third of the realistic resale price, which leaves room for fees, shipping, and your time."},
    {"q":"Where should I sell my finds?","a":"Ship higher-value items via online marketplaces; for bulky or local goods, list where Central Valley buyers already look, like the TreasureTrail marketplace."}
  ]$faq$,
  'TreasureTrail', 4, 'published', now()
)
on conflict (slug) do update set
  title            = excluded.title,
  seo_title        = excluded.seo_title,
  meta_description = excluded.meta_description,
  excerpt          = excluded.excerpt,
  body_md          = excluded.body_md,
  category         = excluded.category,
  tags             = excluded.tags,
  county           = excluded.county,
  city             = excluded.city,
  faq              = excluded.faq,
  author           = excluded.author,
  read_minutes     = excluded.read_minutes,
  status           = excluded.status,
  published_at     = coalesce(public.blog_posts.published_at, excluded.published_at),
  updated_at       = now();
