import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type TenorResult = {
  id: string;
  title: string;
  media_formats: {
    gif?: { url: string };
    tinygif?: { url: string };
    nanogif?: { url: string };
  };
};

type TenorResponse = { results: TenorResult[]; error?: string };

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const key = process.env.TENOR_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Agrega TENOR_API_KEY al .env para usar GIFs." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "celebration";

  const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${key}&limit=18&media_filter=tinygif,gif&contentfilter=medium`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return NextResponse.json({ error: "Error con Tenor API." }, { status: 502 });

  const data = await res.json() as TenorResponse;

  const gifs = (data.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.media_formats.gif?.url ?? r.media_formats.tinygif?.url ?? "",
    previewUrl: r.media_formats.tinygif?.url ?? r.media_formats.nanogif?.url ?? r.media_formats.gif?.url ?? ""
  })).filter((g) => g.url);

  return NextResponse.json({ gifs });
}
