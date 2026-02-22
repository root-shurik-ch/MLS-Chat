import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

function getMeta(html: string, property: string): string | null {
  // Handles both attribute orderings: property/name before content, and content before property/name
  for (const attr of ['property', 'name']) {
    for (const [a, b] of [['content', attr], [attr, 'content']]) {
      const re = new RegExp(
        `<meta[^>]+${a}=["']([^"']+)["'][^>]+${b}=["']${property}["'][^>]*>`,
        'i'
      );
      const m = html.match(re);
      if (m?.[1]) return decode(m[1].trim());
    }
  }
  return null;
}

function getTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m?.[1] ? decode(m[1].trim()) : null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return new Response(JSON.stringify({ error: "Invalid url" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MinimumChatPreview/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
      redirect: "follow",
    });
    clearTimeout(tid);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: 422,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) {
      return new Response(JSON.stringify({ error: "Not HTML" }), {
        status: 422,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Read at most 64 KB — meta tags are always in <head>
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No body");
    let html = "";
    let bytes = 0;
    const dec = new TextDecoder();
    while (bytes < 65536) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      bytes += value.length;
      if (html.includes("</head>")) break;
    }
    reader.cancel();

    const title       = getMeta(html, "og:title")       ?? getTitle(html);
    const description = getMeta(html, "og:description") ?? getMeta(html, "description");
    const siteName    = getMeta(html, "og:site_name");
    let   image       = getMeta(html, "og:image");

    // Resolve relative image URLs
    if (image && !image.startsWith("http")) {
      const base = new URL(url);
      image = image.startsWith("/")
        ? `${base.protocol}//${base.host}${image}`
        : `${base.protocol}//${base.host}/${image}`;
    }

    const domain = new URL(url).hostname.replace(/^www\./, "");

    return new Response(
      JSON.stringify({
        url,
        title:       title       ?? null,
        description: description ?? null,
        image:       image       ?? null,
        site_name:   siteName    ?? domain,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 422,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
