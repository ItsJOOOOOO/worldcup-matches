import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const STREAM_URL =
  import.meta.env.VITE_STREAM_URL || "http://localhost:5001/playlist.m3u8";

export default function App() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("جاري تجهيز البث...");
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,

        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 30,

        liveSyncDurationCount: 6,
        liveMaxLatencyDurationCount: 12,

        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
      });

      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("البث جاهز. اضغط تشغيل.");
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        setStatus("البث يعمل الآن");
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.log("HLS ERROR:", data);

        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setStatus("تقطيع في الشبكة، جاري إعادة الاتصال...");
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setStatus("مشكلة في الفيديو، جاري الإصلاح...");
            hls.recoverMediaError();
          } else {
            setError("تعذر تشغيل البث");
            hls.destroy();
          }
        }
      });

      return () => {
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = STREAM_URL;
      setStatus("البث جاهز. اضغط تشغيل.");
    } else {
      setError("المتصفح لا يدعم تشغيل HLS");
    }
  }, []);

  const playStream = async () => {
    try {
      setError("");
      await videoRef.current.play();
      setStatus("البث يعمل الآن");
    } catch (err) {
      setError("اضغط تشغيل مرة أخرى أو فعّل الصوت بعد التشغيل");
    }
  };

  return (
    <div
      style={{
        background: "#050505",
        color: "white",
        minHeight: "100vh",
        padding: 30,
        direction: "rtl",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 10 }}>مشاهدة المباراة</h1>

        <p style={{ color: "#aaa", marginBottom: 20 }}>
          بث مباشر بجودة مناسبة للموبايل والكمبيوتر
        </p>

        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            background: "#111",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <video
            ref={videoRef}
            controls
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              background: "black",
            }}
          />
        </div>

        <button
          onClick={playStream}
          style={{
            marginTop: 16,
            background: "#e50914",
            color: "white",
            border: 0,
            padding: "12px 22px",
            borderRadius: 12,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          تشغيل البث
        </button>

        <p style={{ marginTop: 14, color: "#bbb" }}>{status}</p>

        {error && (
          <p style={{ marginTop: 14, color: "#ff4b4b", fontWeight: "bold" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}