import { Link } from 'react-router-dom';

export const PlaylistCard = ({ playlist }) => (
  <Link to={`/playlists/${playlist.id}`} className='block rounded-xl overflow-hidden border border-gray-200 hover:shadow-md transition-shadow'>
    {playlist.coverUrl
      ? <img src={playlist.coverUrl} alt={playlist.name} className='w-full aspect-square object-cover' />
      : <div className='w-full aspect-square bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-4xl'>♪</div>
    }
    <div className='p-3'>
      <p className='font-semibold truncate'>{playlist.name}</p>
      <p className='text-xs text-gray-500'>{playlist.songs?.length ?? 0} songs</p>
    </div>
  </Link>
);
