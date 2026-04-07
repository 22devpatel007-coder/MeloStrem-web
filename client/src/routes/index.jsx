import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import  Loader from '../components/ui/Loader';
import Home from '../pages/Home';
import Search from '../pages/Search';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Player from '../pages/Player';
import Playlists from '../pages/Playlists';
import PlaylistDetail from '../pages/PlaylistDetail';
import LikedSongs from '../pages/LikedSongs';

const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const MusicList = lazy(() => import('../pages/admin/MusicList'));
const UploadMusic = lazy(() => import('../pages/admin/UploadMusic'));
const BulkUpload = lazy(() => import('../pages/admin/BulkUpload'));
const UploadPlaylistZip = lazy(() => import('../pages/admin/UploadPlaylistZip'));
const UsersList = lazy(() => import('../pages/admin/UsersList'));

const AppRoutes = () => (
  <Suspense fallback={<Loader />}>
    <Routes>
      <Route path='/' element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path='/search' element={<ProtectedRoute><Search /></ProtectedRoute>} />
      <Route path='/player' element={<ProtectedRoute><Player /></ProtectedRoute>} />
      <Route path='/playlists' element={<ProtectedRoute><Playlists /></ProtectedRoute>} />
      <Route path='/playlists/:id' element={<ProtectedRoute><PlaylistDetail /></ProtectedRoute>} />
      <Route path='/liked' element={<ProtectedRoute><LikedSongs /></ProtectedRoute>} />
      <Route path='/login' element={<Login />} />
      <Route path='/register' element={<Register />} />
      <Route path='/admin' element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path='/admin/music' element={<AdminRoute><MusicList /></AdminRoute>} />
      <Route path='/admin/upload' element={<AdminRoute><UploadMusic /></AdminRoute>} />
      <Route path='/admin/bulk' element={<AdminRoute><BulkUpload /></AdminRoute>} />
      <Route path='/admin/playlist-zip' element={<AdminRoute><UploadPlaylistZip /></AdminRoute>} />
      <Route path='/admin/users' element={<AdminRoute><UsersList /></AdminRoute>} />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
