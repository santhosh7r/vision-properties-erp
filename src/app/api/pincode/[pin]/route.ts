import { NextResponse } from "next/server";

// Pincode → district / state / country lookup, used by the customer address
// block (see components/CustomerFields).
//
// WHY A PROXY and not a fetch straight from the browser: api.postalpincode.in
// answers fine but sends no Access-Control-Allow-Origin header, so a direct
// call from the page is blocked by CORS. Going through our own origin also lets
// the result be cached and the response narrowed to the three fields the form
// actually fills.
//
// A pincode's district never changes, so the upstream answer is cached for a
// day; repeat lookups of the same PIN cost nothing.
const UPSTREAM = "https://api.postalpincode.in/pincode";
const CACHE_SECONDS = 86_400;

interface PostOffice {
  District?: string | null;
  State?: string | null;
  Country?: string | null;
}

export interface PincodeLookup {
  found: boolean;
  district: string;
  state: string;
  country: string;
}

const NOT_FOUND: PincodeLookup = { found: false, district: "", state: "", country: "" };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pin: string }> },
) {
  const { pin } = await params;
  // Only ever forward six digits — the value goes into a URL path upstream.
  if (!/^\d{6}$/.test(pin)) return NextResponse.json(NOT_FOUND);

  try {
    const res = await fetch(`${UPSTREAM}/${pin}`, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return NextResponse.json(NOT_FOUND);

    // Shape: [{ Status: "Success" | "Error", PostOffice: [...] | null }]
    const body = (await res.json()) as { Status?: string; PostOffice?: PostOffice[] | null }[];
    const first = Array.isArray(body) ? body[0] : undefined;
    const office = first?.Status === "Success" ? first.PostOffice?.[0] : undefined;
    if (!office) return NextResponse.json(NOT_FOUND);

    return NextResponse.json({
      found: true,
      district: (office.District ?? "").trim(),
      state: (office.State ?? "").trim(),
      country: (office.Country ?? "India").trim(),
    } satisfies PincodeLookup);
  } catch {
    // Upstream down, slow or unreachable. The form stays usable — the address
    // fields are plain inputs the user can always fill in by hand.
    return NextResponse.json(NOT_FOUND);
  }
}
