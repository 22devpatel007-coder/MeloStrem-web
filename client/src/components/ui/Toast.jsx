import { useEffect } from 'react';

const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };

export const Toast = ({ message, type = 'info', duration = 3000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm shadow-lg ${colors[type]}`}>
      {message}
    </div>
  );
};
