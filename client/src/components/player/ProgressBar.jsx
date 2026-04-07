import usePlayerStore from '../../store/playerStore';
import { formatDuration } from '../../utils/formatters';

export const ProgressBar = () => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  return (
    <div className='flex items-center gap-2 w-full'>
      <span className='text-xs text-gray-500 w-10 text-right'>{formatDuration(currentTime)}</span>
      <input
        type='range'
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={(e) => setCurrentTime(Number(e.target.value))}
        className='flex-1 accent-blue-600'
      />
      <span className='text-xs text-gray-500 w-10'>{formatDuration(duration)}</span>
    </div>
  );
};
