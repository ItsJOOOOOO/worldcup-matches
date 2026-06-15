require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Readable } = require("stream");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["*"],
  })
);

const SOURCE = process.env.STREAM_URL;

if (!SOURCE) {
  throw new Error("STREAM_URL is missing in .env or Render Environment Variables");
}

const SOURCE_ORIGIN = new URL(SOURCE).origin;

function toProxyUrl(url) {
  return `/proxy?url=${encodeURIComponent(url)}`;
}

function rewritePlaylist(text, baseUrl) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (full, uri) => {
          const absolute = new URL(uri, baseUrl).href;
          return `URI="${toProxyUrl(absolute)}"`;
        });
      }

      const absolute = new URL(trimmed, baseUrl).href;
      return toProxyUrl(absolute);
    })
    .join("\n");
}

async function fetchLikeVlc(url, req) {
  const headers = {
    "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
    Accept: "*/*",
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  return fetch(url, {
    headers,
    redirect: "follow",
  });
}

app.get("/", (req, res) => {
  res.send("Stream proxy is running");
});

app.get("/playlist.m3u8", async (req, res) => {
  try {
    const upstream = await fetchLikeVlc(SOURCE, req);

    console.log("Playlist status:", upstream.status);
    console.log("Playlist type:", upstream.headers.get("content-type"));

    const text = await upstream.text();

    console.log("First chars:", text.slice(0, 80));

    if (!text.includes("#EXTM3U")) {
      return res
        .status(500)
        .send("Source did not return M3U8 playlist:\n\n" + text);
    }

    const rewritten = rewritePlaylist(text, SOURCE);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    res.send(rewritten);
  } catch (error) {
    console.error("Playlist error:", error);
    res.status(500).send(error.message);
  }
});

app.get("/proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send("Missing url");
    }

    const target = new URL(targetUrl);

    if (target.origin !== SOURCE_ORIGIN) {
      return res.status(403).send("Blocked URL");
    }

    const upstream = await fetchLikeVlc(targetUrl, req);

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    res.status(upstream.status);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

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
      const rewritten = rewritePlaylist(text, targetUrl);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(rewritten);
    }

    res.setHeader("Content-Type", contentType);

    if (!upstream.body) {
      return res.end();
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send(error.message);
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Stream proxy running on port ${PORT}`);
});