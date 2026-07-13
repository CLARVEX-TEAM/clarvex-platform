import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { rateLimitGifs } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Klipy devuelve cada GIF con un objeto `file` que tiene tamaños (hd, md, sm, xs)
// y dentro de cada uno los formatos (gif, mp4, webp, jpg). Tomamos un .gif para
// el mensaje y un thumbnail ligero para la cuadrícula de búsqueda.
type KlipyFormat = { url?: string };
type KlipySize = { gif?: KlipyFormat; webp?: KlipyFormat; jpg?: KlipyFormat; mp4?: KlipyFormat };
type KlipyFile = { hd?: KlipySize; md?: KlipySize; sm?: KlipySize; xs?: KlipySize };

type KlipyItem = {
  id?: string | number;
  slug?: string;
  title?: string;
  file?: KlipyFile;
  files?: KlipyFile;
};

type KlipyResponse = {
  result?: boolean;
  data?: { data?: KlipyItem[] };
};

function pickGif(file: KlipyFile): string {
  return (
    file.md?.gif?.url ??
    file.hd?.gif?.url ??
    file.sm?.gif?.url ??
    file.xs?.gif?.url ??
    ""
  );
}

function pickPreview(file: KlipyFile): string {
  return (
    file.xs?.gif?.url ??
    file.sm?.gif?.url ??
    file.xs?.jpg?.url ??
    file.sm?.jpg?.url ??
    pickGif(file)
  );
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const limited = await rateLimitGifs(session.userId);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas de GIFs. Intenta en un momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const key = process.env.KLIPY_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Agrega KLIPY_API_KEY al .env para usar GIFs." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "celebration";

  // Klipy designs keys as path-based / not secret-grade; keep key in path (API requires it).
  // Do not log the full URL with the key.
  const url =
    `https://api.klipy.com/api/v1/${key}/gifs/search` +
    `?q=${encodeURIComponent(q)}&per_page=18&customer_id=${encodeURIComponent(session.userId)}`;

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 60 } });
  } catch {
    return NextResponse.json({ error: "No se pudo conectar con Klipy." }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: "Error con Klipy API." }, { status: 502 });

  const data = (await res.json()) as KlipyResponse;

  const gifs = (data.data?.data ?? [])
    .map((item) => {
      const file = item.file ?? item.files ?? {};
      return {
        id: String(item.id ?? item.slug ?? ""),
        title: item.title ?? "",
        url: pickGif(file),
        previewUrl: pickPreview(file)
      };
    })
    .filter((g) => g.url && g.id);

  return NextResponse.json({ gifs });
}
