import { NextResponse } from "next/server";

type IpApiResponse = {
  city?: string | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export const dynamic = "force-dynamic";

function normalizeCityName(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function readClientIp(request: Request) {
  const directHeaders = ["x-real-ip", "cf-connecting-ip", "x-client-ip"];
  for (const headerName of directHeaders) {
    const value = request.headers.get(headerName);
    if (value) return value.trim();
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;

  const [firstIp] = forwarded.split(",");
  return firstIp?.trim() || null;
}

function readHeaderCity(request: Request) {
  const value = request.headers.get("x-vercel-ip-city") || request.headers.get("x-appengine-city");
  return normalizeCityName(value);
}

async function fetchCityByIp(ip: string | null) {
  const endpoint = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/";
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      "User-Agent": "Katet City Detector",
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as IpApiResponse;
  return normalizeCityName(payload.city);
}

export async function GET(request: Request) {
  const headerCity = readHeaderCity(request);
  if (headerCity) {
    return NextResponse.json({ city: headerCity }, { headers: NO_STORE_HEADERS });
  }

  try {
    const city = await fetchCityByIp(readClientIp(request));
    return NextResponse.json({ city }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ city: null }, { headers: NO_STORE_HEADERS });
  }
}
