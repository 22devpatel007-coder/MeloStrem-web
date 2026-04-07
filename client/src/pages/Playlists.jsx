import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Loader from '../components/ui/Loader';
import { useUserPlaylists, useAdminPlaylists, usePlaylistMutations } from '../hooks/usePlaylists';
import CreatePlaylistModal from '../components/playlists/CreatePlaylistModal';

const Playlists = () => {
	const { playlists, loading: userLoading } = useUserPlaylists();
	const { adminPlaylists, loading: adminLoading } = useAdminPlaylists();
	const { deletePlaylist } = usePlaylistMutations();
	const [showCreate, setShowCreate] = useState(false);

	if (userLoading || adminLoading) return <Loader />;

	return (
		<div style={{ minHeight: '100vh', background: '#0f0f0f' }}>
			<Navbar />
			<div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 90px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
					<h1 style={{ color: '#fff', fontSize: 22 }}>Playlists</h1>
					<button
						onClick={() => setShowCreate(true)}
						style={{ background: '#22c55e', color: '#000', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}
					>
						New Playlist
					</button>
				</div>

				<h2 style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Your Playlists</h2>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
					{playlists.map((pl) => (
						<div key={pl.id} style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 10, overflow: 'hidden' }}>
							<Link to={`/playlists/${pl.id}`} style={{ textDecoration: 'none' }}>
								<div style={{ aspectRatio: '1 / 1', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>♪</div>
								<div style={{ padding: 10 }}>
									<p style={{ color: '#fff', fontSize: 13, marginBottom: 4 }}>{pl.name}</p>
									<p style={{ color: '#6b7280', fontSize: 11 }}>{pl.songIds?.length || 0} songs</p>
								</div>
							</Link>
							<div style={{ padding: '0 10px 10px' }}>
								<button
									onClick={() => deletePlaylist(pl.id)}
									style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}
								>
									Delete
								</button>
							</div>
						</div>
					))}
				</div>

				<h2 style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Library Playlists</h2>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
					{adminPlaylists.map((pl) => (
						<Link
							key={pl.id}
							to={`/playlists/${pl.id}`}
							style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}
						>
							<div style={{ aspectRatio: '1 / 1', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>♪</div>
							<div style={{ padding: 10 }}>
								<p style={{ color: '#fff', fontSize: 13, marginBottom: 4 }}>{pl.name}</p>
								<p style={{ color: '#6b7280', fontSize: 11 }}>{pl.songIds?.length || 0} songs</p>
							</div>
						</Link>
					))}
				</div>
			</div>
			{showCreate && <CreatePlaylistModal onClose={() => setShowCreate(false)} />}
		</div>
	);
};

export default Playlists;
