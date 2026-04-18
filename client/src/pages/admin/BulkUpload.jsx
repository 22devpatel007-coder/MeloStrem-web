/**
 * client/src/pages/admin/BulkUpload.jsx
 *
 * BUG-012 FIX — React Query cache invalidation after bulk upload completes.
 *
 * WHAT CHANGED vs previous version:
 *   1. Imported useQueryClient from @tanstack/react-query.
 *   2. Imported QUERY_KEYS from constants/queryKeys.
 *   3. At the end of handleUploadAll, before setStage("done"), calls:
 *        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SONGS] })
 *      This ensures that after a bulk upload, any page reading the songs cache
 *      (MusicList, Home, Search) will refetch on their next render instead of
 *      showing the old song list for up to 2 minutes.
 *
 * WHAT DID NOT CHANGE:
 *   - ZIP parsing, JSZip loading, manifest validation — identical
 *   - Upload loop, FormData construction, placeholder cover logic — identical
 *   - handleReset, drag-and-drop handlers — identical
 *   - All styles — identical
 *   - ZipIcon — identical
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query"; // ← BUG-012 FIX
import { axiosUpload } from "../../services/api";
import { QUERY_KEYS } from "../../constants/queryKeys"; // ← BUG-012 FIX

const JSZIP_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

const loadJSZip = () =>
  new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip);
    const script = document.createElement("script");
    script.src = JSZIP_CDN;
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(script);
  });

const normalizeZipPath = (value) =>
  String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();

const getBaseName = (value) => {
  const normalized = normalizeZipPath(value);
  const parts = normalized.split("/");
  return parts[parts.length - 1];
};

const findZipEntry = (entries, requestedPath) => {
  const normalizedRequested = normalizeZipPath(requestedPath);
  const requestedBase = getBaseName(requestedPath);
  return (
    entries.find(
      (entry) => normalizeZipPath(entry.name) === normalizedRequested,
    ) ||
    entries.find((entry) => getBaseName(entry.name) === requestedBase) ||
    null
  );
};

const createPlaceholderCoverFile = async (baseName) =>
  new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#555555";
      ctx.font = "bold 160px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪", 200, 210);
    }
    canvas.toBlob((blob) => {
      resolve(
        new File([blob || new Blob()], `${baseName}-cover.png`, {
          type: "image/png",
        }),
      );
    }, "image/png");
  });

const BulkUpload = () => {
  const queryClient = useQueryClient(); // ← BUG-012 FIX
  const navigate = useNavigate();
  const dropRef = useRef(null);

  const [zipFile, setZipFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle");
  const [manifest, setManifest] = useState([]);
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [globalError, setGlobalError] = useState("");

  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".zip")) handleZipSelected(file);
    else setGlobalError("Please drop a .zip file.");
  };
  const onFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleZipSelected(file);
  };

  const handleZipSelected = async (file) => {
    setGlobalError("");
    setZipFile(file);
    setStage("parsing");
    setManifest([]);
    setResults([]);

    try {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(file);

      const manifestEntry = Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith("manifest.json"),
      );
      if (!manifestEntry)
        throw new Error(
          "manifest.json not found in ZIP. See format requirements above.",
        );

      const raw = await manifestEntry.async("string");
      const data = JSON.parse(raw);

      if (!Array.isArray(data) || data.length === 0)
        throw new Error("manifest.json must be a non-empty JSON array.");

      data.forEach((entry, i) => {
        if (!entry.file) throw new Error(`Entry [${i}] missing "file" field.`);
        if (!entry.title)
          throw new Error(`Entry [${i}] missing "title" field.`);
        if (!entry.artist)
          throw new Error(`Entry [${i}] missing "artist" field.`);
        if (!entry.genre)
          throw new Error(`Entry [${i}] missing "genre" field.`);
      });

      setManifest(data);
      setStage("idle");
    } catch (err) {
      setGlobalError(err.message);
      setStage("idle");
      setZipFile(null);
    }
  };

  const handleUploadAll = async () => {
    if (!zipFile || !manifest.length) return;
    setGlobalError("");
    setStage("uploading");
    setProgress({ done: 0, total: manifest.length });
    setResults([]);

    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(zipFile);
    const fileEntries = Object.values(zip.files).filter((f) => !f.dir);
    const newResults = [];

    for (let i = 0; i < manifest.length; i++) {
      const entry = manifest[i];
      setCurrent(entry.title);

      try {
        const songEntry = findZipEntry(fileEntries, entry.file);
        if (!songEntry) throw new Error(`File not found in ZIP: ${entry.file}`);

        const songBlob = await songEntry.async("blob");
        const songFile = new File([songBlob], entry.file, {
          type: "audio/mpeg",
        });

        const baseName = getBaseName(entry.file).replace(/\.[^.]+$/, "");
        const coverEntry =
          findZipEntry(fileEntries, `${baseName}.jpg`) ||
          findZipEntry(fileEntries, `${baseName}.jpeg`) ||
          findZipEntry(fileEntries, `${baseName}.png`) ||
          findZipEntry(fileEntries, `${baseName}.webp`) ||
          null;

        const fd = new FormData();
        fd.append("title", entry.title);
        fd.append("artist", entry.artist);
        fd.append("genre", entry.genre);
        fd.append("duration", String(entry.duration || 0));
        fd.append("song", songFile);

        if (coverEntry) {
          const ext = coverEntry.name.split(".").pop();
          const coverBlob = await coverEntry.async("blob");
          fd.append(
            "cover",
            new File([coverBlob], `${baseName}.${ext}`, {
              type: `image/${ext}`,
            }),
          );
        } else {
          const placeholderFile = await createPlaceholderCoverFile(baseName);
          fd.append("cover", placeholderFile);
        }

        await axiosUpload.post("/songs", fd);
        newResults.push({ title: entry.title, status: "success" });
      } catch (err) {
        newResults.push({
          title: entry.title,
          status: "error",
          error: err.response?.data?.error || err.message,
        });
      }

      setProgress({ done: i + 1, total: manifest.length });
      setResults([...newResults]);
    }

    setCurrent("");

    // BUG-012 FIX: Invalidate the shared songs cache after all uploads complete.
    // Without this, MusicList and any other page reading QUERY_KEYS.SONGS would
    // serve the pre-upload song list for up to 2 minutes. The invalidation fires
    // once for the entire batch — not per-song — to avoid flooding React Query
    // with redundant invalidation calls during the loop.
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SONGS] });

    setStage("done");
  };

  const handleReset = () => {
    setZipFile(null);
    setManifest([]);
    setResults([]);
    setStage("idle");
    setGlobalError("");
    setProgress({ done: 0, total: 0 });
    setCurrent("");
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Bulk Upload</h1>
        <p style={styles.subheading}>
          Upload multiple songs at once via a ZIP file
        </p>
      </div>

      {/* Format guide */}
      <div style={styles.guide}>
        <p style={styles.guideTitle}>ZIP Structure</p>
        <pre style={styles.pre}>{`your-songs.zip
├── songs/
│   ├── 01 - Song Title.mp3
│   └── 02 - Another Song.mp3
├── covers/               ← optional
│   ├── 01 - Song Title.jpg
│   └── 02 - Another Song.png
└── manifest.json`}</pre>
        <p style={{ ...styles.guideTitle, marginTop: 12 }}>manifest.json</p>
        <pre style={styles.pre}>{`[
  {
    "file":     "01 - Song Title.mp3",
    "title":    "Song Title",
    "artist":   "Artist Name",
    "genre":    "Pop",
    "duration": 214
  }
]`}</pre>
        <p style={styles.guideNote}>
          Duration is in <strong>seconds</strong>. Cover is matched by filename
          stem (e.g. <code style={styles.code}>01 - Song Title.jpg</code> for{" "}
          <code style={styles.code}>01 - Song Title.mp3</code>). If no cover is
          found a placeholder is used.
        </p>
      </div>

      {globalError && <div style={styles.errorBox}>{globalError}</div>}

      {/* Drop zone */}
      {stage !== "uploading" && stage !== "done" && (
        <div
          ref={dropRef}
          style={{
            ...styles.dropZone,
            borderColor: dragging ? "#22c55e" : "#2d2d2d",
            background: dragging ? "rgba(34,197,94,0.05)" : "#111",
            boxShadow: dragging ? "0 0 0 3px rgba(34,197,94,0.15)" : "none",
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div style={styles.dropIcon}>
            <ZipIcon />
          </div>
          {zipFile ? (
            <>
              <p style={styles.dropTitle}>
                <span style={{ color: "#22c55e" }}>✓</span> {zipFile.name}
              </p>
              <p style={styles.dropSub}>
                {(zipFile.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </>
          ) : (
            <>
              <p style={styles.dropTitle}>Drop your ZIP here</p>
              <p style={styles.dropSub}>or click to browse</p>
            </>
          )}
          <label style={styles.browseBtn}>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={onFileInput}
              style={{ display: "none" }}
            />
            {zipFile ? "Choose different file" : "Browse ZIP"}
          </label>
        </div>
      )}

      {/* Manifest preview */}
      {manifest.length > 0 && stage !== "uploading" && stage !== "done" && (
        <div style={styles.preview}>
          <div style={styles.previewHeader}>
            <p style={styles.previewTitle}>
              {manifest.length} songs ready to upload
            </p>
            <button onClick={handleReset} style={styles.resetBtn}>
              Clear
            </button>
          </div>
          <div style={styles.manifestList}>
            {manifest.map((entry, i) => (
              <div key={i} style={styles.manifestRow}>
                <span style={styles.manifestNum}>{i + 1}</span>
                <div style={styles.manifestInfo}>
                  <p style={styles.manifestTitle}>{entry.title}</p>
                  <p style={styles.manifestArtist}>
                    {entry.artist} · {entry.genre}
                    {entry.duration
                      ? ` · ${Math.floor(entry.duration / 60)}:${String(Math.floor(entry.duration % 60)).padStart(2, "0")}`
                      : ""}
                  </p>
                </div>
                <span style={styles.manifestFile}>{entry.file}</span>
              </div>
            ))}
          </div>
          <button onClick={handleUploadAll} style={styles.uploadBtn}>
            Upload All {manifest.length} Songs
          </button>
        </div>
      )}

      {/* Progress */}
      {(stage === "uploading" || stage === "done") && (
        <div style={styles.progressCard}>
          <div style={styles.progressHeader}>
            <p style={styles.progressTitle}>
              {stage === "done"
                ? `Done — ${successCount} uploaded, ${errorCount} failed`
                : `Uploading ${progress.done} / ${progress.total}`}
            </p>
            <span style={styles.progressPct}>{pct}%</span>
          </div>
          <div style={styles.progressBarWrap}>
            <div style={{ ...styles.progressBarFill, width: `${pct}%` }} />
          </div>
          {current && <p style={styles.currentLabel}>Currently: {current}</p>}

          {results.length > 0 && (
            <div style={styles.resultList}>
              {results.map((r, i) => (
                <div key={i} style={styles.resultRow}>
                  <span
                    style={{
                      ...styles.resultStatus,
                      color: r.status === "success" ? "#22c55e" : "#f87171",
                    }}
                  >
                    {r.status === "success" ? "✓" : "✕"}
                  </span>
                  <span style={styles.resultTitle}>{r.title}</span>
                  {r.error && <span style={styles.resultError}>{r.error}</span>}
                </div>
              ))}
            </div>
          )}

          {stage === "done" && (
            <div style={styles.doneActions}>
              <button onClick={handleReset} style={styles.resetBtn2}>
                Upload More
              </button>
              <button
                onClick={() => navigate("/admin/music")}
                style={styles.viewBtn}
              >
                View Library
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ZipIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#6b7280"
    strokeWidth="1.5"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="13" x2="12" y2="17" />
    <polyline points="10 15 12 17 14 15" />
  </svg>
);

const styles = {
  container: {
    maxWidth: "720px",
    margin: "0 auto",
    padding: "32px 20px 80px",
    fontFamily: "'Inter', sans-serif",
  },
  pageHeader: { marginBottom: 24 },
  heading: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    marginBottom: 4,
  },
  subheading: { color: "#6b7280", fontSize: 13 },
  guide: {
    background: "#111",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  guideTitle: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 8,
  },
  pre: {
    background: "#0a0a0a",
    border: "1px solid #2d2d2d",
    borderRadius: 8,
    padding: "12px 14px",
    color: "#9ca3af",
    fontSize: 12,
    fontFamily: "'Fira Code', monospace",
    overflowX: "auto",
    margin: 0,
  },
  guideNote: { color: "#6b7280", fontSize: 12, marginTop: 12, lineHeight: 1.6 },
  code: {
    background: "#1a1a1a",
    color: "#22c55e",
    borderRadius: 4,
    padding: "1px 5px",
    fontSize: 11,
    fontFamily: "monospace",
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#f87171",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13,
    marginBottom: 20,
  },
  dropZone: {
    border: "2px dashed #2d2d2d",
    borderRadius: 14,
    padding: "48px 24px",
    textAlign: "center",
    transition: "all 0.2s",
    cursor: "default",
    marginBottom: 24,
  },
  dropIcon: { display: "flex", justifyContent: "center", marginBottom: 16 },
  dropTitle: { color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 6 },
  dropSub: { color: "#6b7280", fontSize: 13, marginBottom: 20 },
  browseBtn: {
    display: "inline-block",
    background: "#22c55e",
    color: "#000",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  preview: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid #2d2d2d",
  },
  previewTitle: { color: "#fff", fontSize: 14, fontWeight: 600 },
  resetBtn: {
    background: "none",
    border: "1px solid #2d2d2d",
    color: "#9ca3af",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  manifestList: { maxHeight: 300, overflowY: "auto" },
  manifestRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "1px solid #1f1f1f",
  },
  manifestNum: {
    color: "#4b5563",
    fontSize: 12,
    width: 20,
    textAlign: "center",
    flexShrink: 0,
  },
  manifestInfo: { flex: 1, minWidth: 0 },
  manifestTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  manifestArtist: { color: "#6b7280", fontSize: 11 },
  manifestFile: {
    color: "#4b5563",
    fontSize: 11,
    flexShrink: 0,
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  uploadBtn: {
    display: "block",
    width: "100%",
    background: "#22c55e",
    color: "#000",
    border: "none",
    padding: "14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  progressCard: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    padding: 20,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  progressTitle: { color: "#fff", fontSize: 14, fontWeight: 600 },
  progressPct: { color: "#22c55e", fontSize: 14, fontWeight: 700 },
  progressBarWrap: {
    height: 6,
    background: "#2d2d2d",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    background: "#22c55e",
    borderRadius: 3,
    transition: "width 0.3s",
  },
  currentLabel: { color: "#6b7280", fontSize: 12, marginBottom: 16 },
  resultList: {
    maxHeight: 280,
    overflowY: "auto",
    borderTop: "1px solid #2d2d2d",
    paddingTop: 12,
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
  },
  resultStatus: { fontSize: 14, fontWeight: 700, flexShrink: 0, width: 18 },
  resultTitle: {
    color: "#e5e7eb",
    fontSize: 13,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  resultError: {
    color: "#f87171",
    fontSize: 11,
    flexShrink: 0,
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  doneActions: {
    display: "flex",
    gap: 10,
    marginTop: 20,
    justifyContent: "flex-end",
  },
  resetBtn2: {
    background: "#2d2d2d",
    color: "#9ca3af",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  viewBtn: {
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};

export default BulkUpload;