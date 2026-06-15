const { Readable } = require("stream");

const STREAMS = {
  "egypt-brazil": "https://s3.eu-north-1.amazonaws.com/sirtv-a2f5f6ef/hls/siiirtv2/_hd/stream"
};

function encodeUrl(url) {
  return Buffer.from(url, "utf8").toString("base64url");
}

function decodeUrl(encoded) {
  return Buffer.from(encoded, "base64url").toString("utf8");
}

function proxyUrl(matchId, targetUrl) {
  return `/api/stream/${matchId}/proxy/${encodeUrl(targetUrl)}`;
}

function rewritePlaylist(text, baseUrl, matchId) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (full, uri) => {
          const absoluteUrl = new URL(uri, baseUrl).href;
          return `URI="${proxyUrl(matchId, absoluteUrl)}"`;
        });
      }

      const absoluteUrl = new URL(trimmed, baseUrl).href;
      return proxyUrl(matchId, absoluteUrl);
    })
    .join("\n");
}

async function fetchLikeVlc(url, req) {
  const headers = {
    "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
    "Accept": "*/*"
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  return fetch(url, {
    headers,
    redirect: "follow"
  });
}

app.get("/api/stream/:matchId/playlist.m3u8", async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const streamUrl = STREAMS[matchId];

    if (!streamUrl) {
      return res.status(404).json({ message: "Stream not found" });
    }

    const upstream = await fetchLikeVlc(streamUrl, req);
    const text = await upstream.text();

    const rewritten = rewritePlaylist(text, streamUrl, matchId);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache");

    res.send(rewritten);
  } catch (error) {
    console.error("Playlist proxy error:", error);
    res.status(500).json({
      message: "Failed to load playlist",
      error: error.message
    });
  }
});

app.get("/api/stream/:matchId/proxy/:encodedUrl", async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const originalStream = STREAMS[matchId];

    if (!originalStream) {
      return res.status(404).json({ message: "Stream not found" });
    }

    const targetUrl = decodeUrl(req.params.encodedUrl);

    const allowedOrigin = new URL(originalStream).origin;
    const targetOrigin = new URL(targetUrl).origin;

    if (allowedOrigin !== targetOrigin) {
      return res.status(403).json({ message: "Blocked proxy url" });
    }

    const upstream = await fetchLikeVlc(targetUrl, req);

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    res.status(upstream.status);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    const isPlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      targetUrl.includes(".m3u8");

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, targetUrl, matchId);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(rewritten);
    }

    res.setHeader("Content-Type", contentType);

    if (!upstream.body) {
      return res.end();
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error("Stream proxy error:", error);
    res.status(500).json({
      message: "Failed to proxy stream",
      error: error.message
    });
  }
});