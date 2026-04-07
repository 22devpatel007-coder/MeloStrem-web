import React from 'react';

const Sidebar = () => {
  return (
    <aside className="w-64 bg-[#1a1a1a] h-full flex flex-col pt-4 hidden md:flex border-r border-[#2d2d2d]">
      <div className="px-6 mb-8 text-xl font-bold text-white">MeloStream Sidebar</div>
      <nav className="flex flex-col gap-2 px-4">
        <a href="/home" className="text-gray-400 hover:text-white px-2 py-2 rounded-md hover:bg-[#2d2d2d] transition-colors">Home</a>
        <a href="/search" className="text-gray-400 hover:text-white px-2 py-2 rounded-md hover:bg-[#2d2d2d] transition-colors">Search</a>
        <a href="/playlists" className="text-gray-400 hover:text-white px-2 py-2 rounded-md hover:bg-[#2d2d2d] transition-colors">Playlists</a>
        <a href="/liked" className="text-gray-400 hover:text-white px-2 py-2 rounded-md hover:bg-[#2d2d2d] transition-colors">Liked Songs</a>
      </nav>
    </aside>
  );
};

export default Sidebar;
