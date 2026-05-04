import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../constants/queryKeys";
import api, { axiosUpload } from "../../services/api";
import { generatePlaylistCover } from "../../utils/generatePlaylistCover";

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

const UploadPlaylistZip = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dropRef = useRef(null);

  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [zipFile, setZipFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle");
  const [manifest, setManifest] = useState([]);
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [globalError, setGlobalError] = useState("");
  const [createdPlaylistId, setCreatedPlaylistId] = useState("");

  const canUpload = useMemo(
    () =>
      playlistName.trim().length > 0 &&
      zipFile &&
      manifest.length > 0 &&
      stage !== "uploading",
    [playlistName, zipFile, manifest.length, stage],
  );

  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith(".zip")) handleZipSelected(file);
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
    setCreatedPlaylistId("");

    try {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(file);

      const manifestEntry = Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith("manifest.json"),
      );
      if (!manifestEntry) throw new Error("manifest.json not found in ZIP.");

      const raw = await manifestEntry.async("string");
      const data = JSON.parse(raw);

      if (!Array.isArray(data) || data.length === 0)
        throw new Error("manifest.json must be a non-empty JSON array.");

      data.forEach((entry, index) => {
        if (!entry.file) throw new Error(`Entry [${index}] missing "file".`);
        if (!entry.title) throw new Error(`Entry [${index}] missing "title".`);
        if (!entry.artist)
          throw new Error(`Entry [${index}] missing "artist".`);
        // tags optional — no required check
      });

      setManifest(data);
      setStage("idle");
    } catch (err) {
      setGlobalError(err.message);
      setZipFile(null);
      setManifest([]);
      setStage("idle");
    }
  };

  const handleUploadAll = async () => {
    if (!zipFile || !manifest.length || !playlistName.trim()) return;

    setGlobalError("");
    setStage("uploading");
    setProgress({ done: 0, total: manifest.length });
    setResults([]);
    setCreatedPlaylistId("");

    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(zipFile);
    const fileEntries = Object.values(zip.files).filter((f) => !f.dir);

    const uploadedSongIds = [];
    const uploadedCoverUrls = [];
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
          (entry.cover ? findZipEntry(fileEntries, entry.cover) : null) ||
          findZipEntry(fileEntries, `${baseName}.jpg`) ||
          findZipEntry(fileEntries, `${baseName}.jpeg`) ||
          findZipEntry(fileEntries, `${baseName}.png`) ||
          findZipEntry(fileEntries, `${baseName}.webp`) ||
          findZipEntry(fileEntries, `covers/${baseName}.jpg`) ||
          findZipEntry(fileEntries, `covers/${baseName}.jpeg`) ||
          findZipEntry(fileEntries, `covers/${baseName}.png`) ||
          findZipEntry(fileEntries, `covers/${baseName}.webp`) ||
          null;
        const fd = new FormData();
        fd.append("title", entry.title);
        fd.append("artist", entry.artist);
        const entryTags = Array.isArray(entry.tags) ? entry.tags : [];
        entryTags.forEach(t => fd.append('tags[]', String(t).trim().toLowerCase()));
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

        const res = await axiosUpload.post("/playlists/upload-song", fd);
        const payload = res.data || {};
        const songId = payload.songId || payload.song?.id;
        const coverUrl = payload.song?.coverUrl;

        if (songId && !uploadedSongIds.includes(songId))
          uploadedSongIds.push(songId);
        if (coverUrl) uploadedCoverUrls.push(coverUrl);

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

    if (!uploadedSongIds.length) {
      setStage("done");
      setCurrent("");
      return;
    }

    const coverUrl = uploadedCoverUrls.length
  ? (await generatePlaylistCover(uploadedCoverUrls.slice(0, 4))) || uploadedCoverUrls[0]
  : "";

    try {
      const playlistRes = await api.post("/playlists/with-cover", {
        name: playlistName.trim(),
        description: playlistDescription.trim(),
        songIds: uploadedSongIds,
        coverUrl,
        coverStoragePath: "",
      });
      setCreatedPlaylistId(playlistRes.data?.id || "");
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.ADMIN_PLAYLISTS] });
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });
      setStage("done");
    } catch (err) {
      setGlobalError(
        err.response?.data?.error || err.message || "Playlist creation failed.",
      );
      setStage("idle");
    }

    setCurrent("");
  };

  const handleReset = () => {
    setPlaylistName("");
    setPlaylistDescription("");
    setZipFile(null);
    setManifest([]);
    setResults([]);
    setStage("idle");
    setGlobalError("");
    setProgress({ done: 0, total: 0 });
    setCurrent("");
    setCreatedPlaylistId("");
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Upload Playlist</h1>
        <p style={styles.subheading}>ZIP → library playlist</p>
      </div>

      <div style={styles.card}>
        <div style={styles.formGrid}>
          <Field
            label="Playlist name"
            value={playlistName}
            onChange={setPlaylistName}
            placeholder="My Festival Set"
          />
          <Field
            label="Description"
            value={playlistDescription}
            onChange={setPlaylistDescription}
            placeholder="Optional description"
          />
        </div>

        <div style={styles.guide}>
          <p style={styles.guideTitle}>ZIP Structure</p>
          <pre style={styles.pre}>{`your-playlist.zip
├── songs/
│   ├── 01 - Song.mp3
│   └── 02 - Song.mp3
├── covers/               ← optional
│   ├── 01 - Song.jpg
│   └── 02 - Song.jpg
└── manifest.json`}</pre>
        </div>

        {globalError && <div style={styles.errorBox}>{globalError}</div>}

        {/* Drop zone */}
        {stage !== "uploading" && stage !== "done" && (
          <div
            ref={dropRef}
            style={{
              ...styles.dropZone,
              borderColor: dragging ? "#22c55e" : "#2d2d2d",
              background: dragging ? "rgba(34,197,94,0.05)" : "transparent",
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
              <p style={styles.previewTitle}>{manifest.length} songs ready</p>
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
                      {entry.artist}{Array.isArray(entry.tags) && entry.tags.length ? ' · ' + entry.tags.join(', ') : ''}
                    </p>
                  </div>
                  <span style={styles.manifestFile}>{entry.file}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleUploadAll}
              disabled={!canUpload}
              style={{ ...styles.uploadBtn, opacity: canUpload ? 1 : 0.5 }}
            >
              {!playlistName.trim()
                ? "Enter a playlist name above first"
                : `Upload All ${manifest.length} Songs`}
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
                    {r.error && (
                      <span style={styles.resultError}>{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {stage === "done" && (
              <div style={styles.doneActions}>
                <button onClick={handleReset} style={styles.resetBtn2}>
                  Upload Another
                </button>
                {createdPlaylistId ? (
                  <button
                    onClick={() => navigate(`/playlists/${createdPlaylistId}`)}
                    style={styles.viewBtn}
                  >
                    View Playlist
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/admin/music")}
                    style={styles.viewBtn}
                  >
                    View Library
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, placeholder }) => (
  <div style={styles.fieldGroup}>
    <label style={styles.label}>{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={styles.input}
    />
  </div>
);

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
    maxWidth: "760px",
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
  card: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 14,
    padding: 24,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 16,
  },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#9ca3af", fontSize: 12, fontWeight: 500 },
  input: {
    background: "#111",
    border: "1px solid #2d2d2d",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  guide: {
    background: "#111",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
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
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#f87171",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13,
    marginBottom: 16,
  },
  dropZone: {
    border: "2px dashed #2d2d2d",
    borderRadius: 14,
    padding: "42px 20px",
    textAlign: "center",
    transition: "all 0.2s",
    cursor: "default",
    marginBottom: 20,
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
    background: "#111",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
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
  manifestList: { maxHeight: 260, overflowY: "auto" },
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
    maxWidth: 170,
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
    background: "#111",
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
    maxHeight: 260,
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

export default UploadPlaylistZip;
