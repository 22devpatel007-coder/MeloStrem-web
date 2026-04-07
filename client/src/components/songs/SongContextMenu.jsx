import { useAuth } from '../../hooks/useAuth';
import useQueueStore from '../../store/queueStore';
import usePlayerStore from '../../store/playerStore';

export const SongContextMenu = ({ song, onAddToPlaylist, onDelete, onLike }) => {
  const { isAdmin } = useAuth();
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const playSong = usePlayerStore((s) => s.playSong);

  return (
    <div className='absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-40'>
      <button className='block w-full text-left px-4 py-2 text-sm hover:bg-gray-50' onClick={() => playSong(song)}>Play</button>
      <button className='block w-full text-left px-4 py-2 text-sm hover:bg-gray-50' onClick={() => addToQueue(song)}>Add to Queue</button>
      <button className='block w-full text-left px-4 py-2 text-sm hover:bg-gray-50' onClick={() => onAddToPlaylist?.(song)}>Add to Playlist</button>
      <button className='block w-full text-left px-4 py-2 text-sm hover:bg-gray-50' onClick={() => onLike?.(song)}>Like</button>
      {isAdmin && <button className='block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50' onClick={() => onDelete?.(song)}>Delete</button>}
    </div>
  );
};
