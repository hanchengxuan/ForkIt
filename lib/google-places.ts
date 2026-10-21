import "server-only";
import type { PriceRange } from "./domain/budget";

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  cuisine: string;
  rating?: number;
  ratingCount?: number;
  priceRange?: PriceRange; // typical spend per person
  openNow?: boolean;
  photos: string[]; // our own /api/photo URLs, so the API key never reaches the browser
  // Shown when a card is opened. Optional: rooms saved before these existed don't have them.
  summary?: string;
  highlights?: string[];
  hours?: string[]; // Monday first, e.g. "Monday: 12:00 – 10:00 PM"
  phone?: string;
  website?: string;
  reviews?: Review[];
  mapsUrl: string;
  addedBy?: string; // member id, when someone picked this place by hand
};

export type Review = { author: string; rating: number; when: string; text: string };

export type Search = { area?: string; lat?: number; lng?: number; craving?: string };
export type LatLng = { latitude: number; longitude: number };
export type Suggestion = { id: string; main: string; secondary: string };

// Short labels; the client pairs each with an icon.
const HIGHLIGHTS = {
  servesVegetarianFood: "Vegetarian",
  goodForGroups: "Groups",
  reservable: "Bookings",
  outdoorSeating: "Outdoor",
  servesCocktails: "Cocktails",
} as const;

const PLACE_FIELDS = [
  "id",
  "location",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "priceRange",
  "primaryTypeDisplayName",
  "photos",
  "googleMapsUri",
  "currentOpeningHours.openNow",
  "editorialSummary",
  "regularOpeningHours.weekdayDescriptions",
  "nationalPhoneNumber",
  "websiteUri",
  "reviews",
  ...Object.keys(HIGHLIGHTS),
];
const SEARCH_FIELDS = PLACE_FIELDS.map((f) => `places.${f}`).join(",");

type GoogleMoney = { currencyCode: string; units?: string };

type GooglePlace = {
  id: string;
  location?: LatLng;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceRange?: { startPrice?: GoogleMoney; endPrice?: GoogleMoney };
  primaryTypeDisplayName?: { text: string };
  photos?: { name: string }[];
  googleMapsUri?: string;
  currentOpeningHours?: { openNow?: boolean };
  editorialSummary?: { text: string };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  reviews?: {
    rating?: number;
    text?: { text: string };
    authorAttribution?: { displayName?: string };
    relativePublishTimeDescription?: string;
  }[];
} & Partial<Record<keyof typeof HIGHLIGHTS, boolean>>;

export async function findRestaurants(
  search: Search,
): Promise<{ restaurants: Restaurant[]; source: "google" | "sample"; center?: LatLng; error?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { restaurants: SAMPLE, source: "sample", error: "GOOGLE_MAPS_API_KEY is not set" };
  try {
    let places = await searchGoogle(search, key, search.craving ? undefined : "restaurant");
    // Cravings search every kind of food place (bubble tea is a tea house, not a restaurant),
    // but a style like "bistro" only works as a restaurant search
    if (search.craving && places.length < 5) places = await searchGoogle(search, key, "restaurant");
    if (places.length === 0) return { restaurants: SAMPLE, source: "sample", error: "No restaurants found there" };
    const center = search.lat !== undefined && search.lng !== undefined ? { latitude: search.lat, longitude: search.lng } : places[0].location;
    return { restaurants: places.map(toRestaurant), source: "google", center };
  } catch (e) {
    // Keep the group moving with sample places rather than a dead end.
    console.error("Places search failed:", e);
    return { restaurants: SAMPLE, source: "sample", error: "Google Maps search failed" };
  }
}

const SEARCH_PAGES = 3; // 60 candidates, so a low budget still leaves a full deck

async function searchGoogle({ area, lat, lng, craving }: Search, key: string, includedType?: string): Promise<GooglePlace[]> {
  const what = craving || "restaurants";
  const hasCoords = lat !== undefined && lng !== undefined;
  const all: GooglePlace[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < SEARCH_PAGES; page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": `${SEARCH_FIELDS},nextPageToken` },
      body: JSON.stringify({
        textQuery: area ? `${what} in ${area}` : what,
        ...(includedType && { includedType }),
        pageSize: 20,
        ...(hasCoords && { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 2000 } } }),
        ...(pageToken && { pageToken }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (all.length) break; // a later page failing still leaves a usable list
      throw new Error(`Places API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { places?: GooglePlace[]; nextPageToken?: string };
    all.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

const AREA_TYPES = ["(regions)"];
const FOOD_TYPES = ["restaurant", "cafe", "bar", "bakery", "meal_takeaway"]; // Google allows at most 5

/** Typeahead for an area ("Newtown, NSW") or a specific restaurant near the room. Empty without a key. */
export async function suggest(input: string, kind: "area" | "restaurant", near?: LatLng): Promise<Suggestion[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: kind === "area" ? AREA_TYPES : FOOD_TYPES,
      ...(near && { locationBias: { circle: { center: near, radius: 5000 } } }),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Places autocomplete ${res.status}: ${await res.text()}`);
  type Prediction = { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } };
  const { suggestions = [] } = (await res.json()) as { suggestions?: { placePrediction?: Prediction }[] };
  return suggestions.flatMap(({ placePrediction: p }) =>
    p ? [{ id: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }] : [],
  );
}

/** One restaurant by its Google place id, for adding a specific place to a room. */
export async function placeDetails(id: string): Promise<Restaurant> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_FIELDS.join(",") },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Place details ${res.status}: ${await res.text()}`);
  return toRestaurant((await res.json()) as GooglePlace);
}

function toPriceRange(r: GooglePlace["priceRange"]): PriceRange | undefined {
  if (!r?.startPrice) return undefined;
  const to = Number(r.endPrice?.units);
  return { from: Number(r.startPrice.units ?? 0), ...(to > 0 && { to }), currency: r.startPrice.currencyCode };
}

function toRestaurant(p: GooglePlace): Restaurant {
  return {
    id: p.id,
    name: p.displayName?.text ?? "Unnamed place",
    address: p.formattedAddress ?? "",
    cuisine: p.primaryTypeDisplayName?.text ?? "Restaurant",
    rating: p.rating,
    ratingCount: p.userRatingCount,
    priceRange: toPriceRange(p.priceRange),
    openNow: p.currentOpeningHours?.openNow,
    photos: (p.photos ?? []).slice(0, 6).map((ph) => `/api/photo?name=${encodeURIComponent(ph.name)}`),
    summary: p.editorialSummary?.text,
    highlights: (Object.keys(HIGHLIGHTS) as (keyof typeof HIGHLIGHTS)[]).filter((k) => p[k]).map((k) => HIGHLIGHTS[k]),
    hours: p.regularOpeningHours?.weekdayDescriptions,
    phone: p.nationalPhoneNumber,
    website: p.websiteUri,
    reviews: (p.reviews ?? [])
      .filter((r) => r.text?.text)
      .slice(0, 3)
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? "Google user",
        rating: r.rating ?? 0,
        when: r.relativePublishTimeDescription ?? "",
        text: r.text!.text,
      })),
    mapsUrl: p.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName?.text ?? "")}`,
  };
}

const sample = (
  id: string,
  name: string,
  cuisine: string,
  level: 1 | 2 | 3 | 4,
  rating: number,
  vegetarian: boolean,
  summary: string,
): Restaurant => ({
  id: `sample-${id}`,
  name,
  cuisine,
  priceRange: SAMPLE_PRICES[level - 1],
  rating,
  ratingCount: 120 + id.length * 37,
  openNow: true,
  summary,
  highlights: [vegetarian && HIGHLIGHTS.servesVegetarianFood, HIGHLIGHTS.goodForGroups].filter((h) => h !== false),
  address: "Sample data — add a Google Maps key for real places",
  photos: [],
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
});

const SAMPLE_PRICES: PriceRange[] = [
  { from: 10, to: 20, currency: "USD" },
  { from: 20, to: 40, currency: "USD" },
  { from: 40, to: 80, currency: "USD" },
  { from: 80, currency: "USD" },
];

const SAMPLE: Restaurant[] = [
  sample("ramen", "Ichiban Ramen Bar", "Ramen", 2, 4.6, true, "Rich tonkotsu broth and springy noodles made in-house."),
  sample("pizza", "Forno Rosso", "Pizza", 2, 4.4, true, "Wood-fired Neapolitan pizza with a blistered crust."),
  sample("taco", "Taqueria La Luz", "Mexican", 1, 4.5, true, "Street-style tacos on fresh corn tortillas."),
  sample("bbq", "Smoke & Ember BBQ", "Barbecue", 3, 4.3, false, "Low-and-slow brisket and ribs from a 12-hour smoker."),
  sample("sushi", "Kaze Sushi", "Japanese", 4, 4.8, false, "Omakase counter with fish flown in daily."),
  sample("thai", "Bangkok Street", "Thai", 1, 4.2, true, "Fiery curries and pad see ew, Bangkok-market style."),
  sample("burger", "Patty Club", "Burgers", 2, 4.1, true, "Smash burgers, crinkle fries and thick shakes."),
  sample("dumpling", "Golden Dumpling House", "Chinese", 1, 4.7, true, "Hand-folded dumplings, best shared by the dozen."),
  sample("greek", "Olive & Thyme", "Greek", 2, 4.4, true, "Charcoal souvlaki, mezze plates and warm pita."),
  sample("korean", "Seoul Fire K-BBQ", "Korean BBQ", 3, 4.6, false, "Grill-your-own marinated meats with endless banchan."),
  sample("indian", "Masala Lane", "Indian", 2, 4.5, true, "Slow-cooked curries and naan straight from the tandoor."),
  sample("steak", "The Cut Steakhouse", "Steakhouse", 4, 4.5, false, "Dry-aged steaks and a serious red wine list."),
];
