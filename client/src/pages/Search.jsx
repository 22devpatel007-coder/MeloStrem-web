import { useSearchParams } from "react-router-dom";
import SongList from "../components/songs/SongList";
import SearchBar from "../components/search/SearchBar";
import Loader from "../components/ui/Loader";
import { useSearch } from "../hooks/useSearch";

const Search = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const { data, isLoading, isError } = useSearch(query);
  const songs = data?.songs ?? [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <SearchBar />
      </div>

      <div style={styles.resultInfo}>
        {query.length >= 2 ? (
          <p style={styles.resultText}>
            Results for <span style={styles.resultQuery}>"{query}"</span>
            {!isLoading && (
              <span style={styles.resultCount}> — {songs.length} found</span>
            )}
          </p>
        ) : (
          <p style={styles.hintText}>Type at least 2 characters to search</p>
        )}
      </div>

      {isError && (
        <p style={styles.errorText}>Search failed. Please try again.</p>
      )}

      {isLoading ? <Loader /> : <SongList songs={songs} />}
    </div>
  );
};

const styles = {
  container: { padding: "32px 20px 0" },
  header: { marginBottom: "28px" },
  resultInfo: { marginBottom: "20px" },
  resultText: { color: "#9ca3af", fontSize: "14px" },
  resultQuery: { color: "#fff", fontWeight: "600" },
  resultCount: { color: "#6b7280" },
  hintText: { color: "#6b7280", fontSize: "14px" },
  errorText: { color: "#f87171", fontSize: "14px", marginBottom: "16px" },
};

export default Search;
