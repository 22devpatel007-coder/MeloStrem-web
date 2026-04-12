/**
 * client/src/routes/index.jsx
 *
 * FIX: Every protected page is now wrapped in <PageWrapper> so the
 * sidebar + scrollable main region are always rendered.
 *
 * Layout hierarchy:
 *   App.jsx  (h-screen flex flex-col overflow-hidden)
 *     └─ flex row div (flex-1 min-h-0 overflow-hidden)
 *         └─ AppRoutes
 *             └─ PageWrapper  ← renders Sidebar + scrollable <main>
 *                 └─ Page (Home, Search, etc.)
 *
 * Auth/Login/Register/ForgotPassword get their own full-screen layout — no PageWrapper.
 * Admin pages get PageWrapper so they also have the sidebar.
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import PageWrapper from '../components/layout/PageWrapper';
import Loader from '../components/ui/Loader';

// ── Eagerly loaded (on the critical path) ────────────────────────────────────
import Home           from '../pages/Home';
import Search         from '../pages/Search';
import Player         from '../pages/Player';
import Playlists      from '../pages/Playlists';
import PlaylistDetail from '../pages/PlaylistDetail';
import LikedSongs     from '../pages/LikedSongs';
import Login          from '../pages/Login';
import Register       from '../pages/Register';
import ForgotPassword from '../pages/ForgotPassword';

// ── Lazily loaded (code-split) ────────────────────────────────────────────────
const AdminDashboard    = lazy(() => import('../pages/admin/AdminDashboard'));
const MusicList         = lazy(() => import('../pages/admin/MusicList'));
const UploadMusic       = lazy(() => import('../pages/admin/UploadMusic'));
const BulkUpload        = lazy(() => import('../pages/admin/BulkUpload'));
const UploadPlaylistZip = lazy(() => import('../pages/admin/UploadPlaylistZip'));
const UsersList         = lazy(() => import('../pages/admin/UsersList'));
const ArtistDetail      = lazy(() => import('../pages/ArtistDetail'));
const AlbumDetail       = lazy(() => import('../pages/AlbumDetail'));

// ─── AppRoutes ────────────────────────────────────────────────────────────────

const AppRoutes = () => (
  <Suspense fallback={<Loader />}>
    <Routes>

      {/* ── Protected user routes — ALL wrapped in PageWrapper ── */}
      <Route
        path='/'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <Home />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/search'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <Search />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/player'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <Player />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/playlists'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <Playlists />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/playlists/:id'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <PlaylistDetail />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/liked'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <LikedSongs />
            </PageWrapper>
          </ProtectedRoute>
        }
      />

      {/* ── Artist & Album detail pages ── */}
      <Route
        path='/artist/:id'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <ArtistDetail />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path='/album/:id'
        element={
          <ProtectedRoute>
            <PageWrapper>
              <AlbumDetail />
            </PageWrapper>
          </ProtectedRoute>
        }
      />

      {/* ── Auth routes — full-screen, NO PageWrapper, NO sidebar ── */}
      <Route path='/login'           element={<Login />} />
      <Route path='/register'        element={<Register />} />
      <Route path='/forgot-password' element={<ForgotPassword />} />

      {/* ── Admin routes — PageWrapper gives them the sidebar too ── */}
      <Route
        path='/admin'
        element={
          <AdminRoute>
            <PageWrapper>
              <AdminDashboard />
            </PageWrapper>
          </AdminRoute>
        }
      />
      <Route
        path='/admin/music'
        element={
          <AdminRoute>
            <PageWrapper>
              <MusicList />
            </PageWrapper>
          </AdminRoute>
        }
      />
      <Route
        path='/admin/upload'
        element={
          <AdminRoute>
            <PageWrapper>
              <UploadMusic />
            </PageWrapper>
          </AdminRoute>
        }
      />
      <Route
        path='/admin/bulk'
        element={
          <AdminRoute>
            <PageWrapper>
              <BulkUpload />
            </PageWrapper>
          </AdminRoute>
        }
      />
      <Route
        path='/admin/playlist-zip'
        element={
          <AdminRoute>
            <PageWrapper>
              <UploadPlaylistZip />
            </PageWrapper>
          </AdminRoute>
        }
      />
      <Route
        path='/admin/users'
        element={
          <AdminRoute>
            <PageWrapper>
              <UsersList />
            </PageWrapper>
          </AdminRoute>
        }
      />

      {/* ── Fallback ── */}
      <Route path='*' element={<Navigate to='/' replace />} />

    </Routes>
  </Suspense>
);

export default AppRoutes;