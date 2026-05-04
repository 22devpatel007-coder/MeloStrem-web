/**
 * client/src/routes/index.jsx
 *
 * TASK 5.3 — Dead Code Audit: ONE CHANGE ONLY
 * ─────────────────────────────────────────────
 * BEFORE:  path='/player'
 * AFTER:   path='/player/:id'
 *
 * Root cause: Player.jsx calls useParams() to read `id`, but the route had
 * no :id segment, so id was always undefined and the page always showed
 * "Song not found". This one-character fix restores the intended behavior.
 *
 * NO other lines changed. All other routes, imports, and layout wrappers
 * are identical to the previous version.
 *
 * Layout hierarchy (unchanged):
 *   App.jsx  (h-screen flex flex-col overflow-clip)
 *     └─ flex row div (flex-1 min-h-0 overflow-hidden)
 *         └─ AppRoutes
 *             └─ PageWrapper  ← renders Sidebar + scrollable <main>
 *                 └─ Page (Home, Search, Player, etc.)
 *
 * Auth routes (Login, Register, ForgotPassword) — no PageWrapper, full-screen.
 * Admin routes — PageWrapper gives them the sidebar.
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
const UserDetail = lazy(() => import('../pages/admin/UserDetail'));
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

      {/*
       * TASK 5.3 FIX — path changed from '/player' to '/player/:id'
       *
       * Before: path='/player'   → useParams().id was always undefined
       * After:  path='/player/:id' → useParams().id correctly reads the song ID
       *
       * Usage:  navigate(`/player/${song.id}`)  or  <Link to={`/player/${song.id}`}>
       */}
      <Route
        path='/player/:id'
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
      <Route
  path='/admin/users/:uid'
  element={
    <AdminRoute>
      <PageWrapper>
        <UserDetail />
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