import React from 'react';

export const Loader = ({ fullScreen = true, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-9 h-9 border-3',
    lg: 'w-16 h-16 border-4'
  };

  const spinner = (
    <div className={`rounded-full animate-spin border-[#2d2d2d] border-t-[#22c55e] ${sizeClasses[size] || sizeClasses.md}`} />
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f0f0f]">
        {spinner}
      </div>
    );
  }

  return <div className="flex justify-center items-center p-4">{spinner}</div>;
};

export default Loader;
