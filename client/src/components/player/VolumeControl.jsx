import usePlayerStore from '../../store/playerStore';

export const VolumeControl = () => {
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  return (
    <input
      type='range'
      min={0}
      max={1}
      step={0.01}
      value={volume}
      onChange={(e) => setVolume(Number(e.target.value))}
      className='w-24 accent-blue-600'
    />
  );
};
