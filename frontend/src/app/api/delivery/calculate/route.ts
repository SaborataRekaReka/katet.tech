import { NextResponse } from "next/server";

type Coordinates = {
  lat: number;
  lng: number;
};

type YandexGeocodeResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          Point?: {
            pos?: string;
          };
          metaDataProperty?: {
            GeocoderMetaData?: {
              text?: string;
            };
          };
        };
      }>;
    };
  };
};

const MOSCOW_CENTER: Coordinates = { lat: 55.7558, lng: 37.6176 };
const MKAD_RADIUS_KM = 19;
const COST_PER_KM = 90;

// Coordinates are [lat, lng].
const MKAD_POLYGON: Array<[number, number]> = [
  [55.911621, 37.441421],
  [55.897261, 37.65213],
  [55.852421, 37.784119],
  [55.774529, 37.854233],
  [55.685547, 37.835083],
  [55.574244, 37.750244],
  [55.515949, 37.651977],
  [55.484871, 37.484131],
  [55.533508, 37.355804],
  [55.608135, 37.289505],
  [55.682098, 37.338715],
  [55.751659, 37.380981],
  [55.835876, 37.391052],
  [55.911621, 37.441421],
];

const MOSCOW_REGION_CITIES = [
  "одинцово",
  "химки",
  "мытищи",
  "люберцы",
  "балашиха",
  "королев",
  "подольск",
  "красногорск",
  "домодедово",
  "щелково",
  "реутов",
  "жуковский",
  "видное",
  "коломна",
  "серпухов",
  "электросталь",
  "ногинск",
  "раменское",
];

function normalizeAddress(input: string) {
  return input.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}

function enhanceAddress(address: string) {
  const normalized = normalizeAddress(address);
  if (
    normalized.includes("москва") ||
    normalized.includes("московская") ||
    normalized.includes("область")
  ) {
    return address;
  }

  if (MOSCOW_REGION_CITIES.some((city) => normalized.includes(city))) {
    return `${address}, Московская область`;
  }

  if (/^[а-яa-z\s]+\d+/iu.test(normalized)) {
    return `${address}, Москва`;
  }

  return `${address}, Московская область`;
}

function degToRad(value: number) {
  return value * (Math.PI / 180);
}

function haversineKm(a: Coordinates, b: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(a.lat)) * Math.cos(degToRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isInsidePolygon(point: Coordinates, polygon: Array<[number, number]>) {
  let inside = false;
  let prevIndex = polygon.length - 1;

  for (let index = 0; index < polygon.length; index += 1) {
    const [latCurrent, lngCurrent] = polygon[index];
    const [latPrev, lngPrev] = polygon[prevIndex];

    const intersects =
      latCurrent > point.lat !== latPrev > point.lat &&
      point.lng < ((lngPrev - lngCurrent) * (point.lat - latCurrent)) / (latPrev - latCurrent) + lngCurrent;

    if (intersects) inside = !inside;
    prevIndex = index;
  }

  return inside;
}

function parsePointPosition(position: string) {
  const [lngRaw, latRaw] = position.split(" ");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  let address = "";
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { address?: unknown };
    address = String(body.address || "").trim();
  } else {
    const formData = await request.formData();
    address = String(formData.get("address") || "").trim();
  }

  if (!address) {
    return errorResponse("Укажите адрес доставки.", 400);
  }

  const geocodeApiKey = process.env.YANDEX_GEOCODE_API_KEY || "0b7bd89f-ee11-49a5-87c2-8b614a5889fe";
  const normalizedAddress = enhanceAddress(address);

  const geocodeUrl = new URL("https://geocode-maps.yandex.ru/1.x/");
  geocodeUrl.searchParams.set("apikey", geocodeApiKey);
  geocodeUrl.searchParams.set("geocode", normalizedAddress);
  geocodeUrl.searchParams.set("format", "json");
  geocodeUrl.searchParams.set("results", "1");

  const geocodeResponse = await fetch(geocodeUrl, {
    headers: {
      Referer: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000/",
      "User-Agent": "Katet Delivery Calculator",
    },
    cache: "no-store",
  });

  if (!geocodeResponse.ok) {
    return errorResponse("Не удалось выполнить геокодирование адреса.", 502);
  }

  const geocodeData = (await geocodeResponse.json()) as YandexGeocodeResponse;
  const firstGeoObject = geocodeData.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const position = firstGeoObject?.Point?.pos;
  const coordinates = position ? parsePointPosition(position) : null;

  if (!coordinates) {
    return errorResponse("Адрес не найден. Укажите более точный адрес.", 404);
  }

  const distanceKm = haversineKm(MOSCOW_CENTER, coordinates);
  const insideMkad = isInsidePolygon(coordinates, MKAD_POLYGON);
  const excessKm = insideMkad ? 0 : Math.max(0, Math.ceil(distanceKm - MKAD_RADIUS_KM));
  const costRub = insideMkad ? 0 : excessKm * COST_PER_KM;

  return NextResponse.json({
    address,
    normalizedAddress,
    resolvedAddress: firstGeoObject?.metaDataProperty?.GeocoderMetaData?.text || normalizedAddress,
    coordinates,
    distanceKm,
    insideMkad,
    excessKm,
    costRub,
    ratePerKm: COST_PER_KM,
  });
}