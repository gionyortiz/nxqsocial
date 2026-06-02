'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { X, Camera, Trash2, Globe, MapPin, User, FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/utils';
import { trackFirstEvent } from '@/lib/analytics';

const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_BANNER_SIZE = 8 * 1024 * 1024;

interface ProfileSnapshot {
  displayName: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

interface Props {
  profile: ProfileSnapshot;
  onClose: () => void;
  onSaved: (updated: Partial<ProfileSnapshot>) => void;
}

export function ProfileEditModal({ profile, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');

  // Avatar
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [doRemoveAvatar, setDoRemoveAvatar] = useState(false);

  // Banner
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [doRemoveBanner, setDoRemoveBanner] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const validateImage = (file: File, kind: 'avatar' | 'banner') => {
    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      return `${kind === 'avatar' ? 'Profile photo' : 'Banner image'} must be JPG, PNG, WEBP or GIF.`;
    }

    const sizeLimit = kind === 'avatar' ? MAX_AVATAR_SIZE : MAX_BANNER_SIZE;
    if (file.size > sizeLimit) {
      return `${kind === 'avatar' ? 'Profile photo' : 'Banner image'} must be smaller than ${Math.round(sizeLimit / 1024 / 1024)} MB.`;
    }

    return null;
  };

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImage(file, 'avatar');
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }
    setError('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setDoRemoveAvatar(false);
    e.target.value = '';
  };

  const pickBanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImage(file, 'banner');
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }
    setError('');
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setDoRemoveBanner(false);
    e.target.value = '';
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setDoRemoveAvatar(true);
  };

  const clearBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setDoRemoveBanner(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const updates: Partial<ProfileSnapshot> = {};
    try {
      // Avatar
      if (doRemoveAvatar) {
        await api.delete('/users/me/avatar');
        updates.avatarUrl = undefined;
      } else if (avatarFile) {
        const fd = new FormData();
        fd.append('avatar', avatarFile);
        const { data } = await api.patch('/users/me/avatar', fd);
        // Cache-bust so the browser does not serve a previously-cached 404 or old image.
        updates.avatarUrl = data.avatarUrl ? `${data.avatarUrl}?v=${Date.now()}` : data.avatarUrl;
      }

      // Banner
      if (doRemoveBanner) {
        await api.delete('/users/me/banner');
        updates.bannerUrl = undefined;
      } else if (bannerFile) {
        const fd = new FormData();
        fd.append('banner', bannerFile);
        const { data } = await api.patch('/users/me/banner', fd);
        updates.bannerUrl = data.bannerUrl ? `${data.bannerUrl}?v=${Date.now()}` : data.bannerUrl;
      }

      // Profile text fields
      const { data: prof } = await api.put('/users/me/profile', {
        displayName: displayName.trim() || undefined,
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim() || undefined,
      });
      updates.displayName = prof.displayName;
      updates.bio = prof.bio;
      updates.location = prof.location;
      updates.website = prof.website;

      const finalAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : profile.avatarUrl;
      const finalBanner = updates.bannerUrl !== undefined ? updates.bannerUrl : profile.bannerUrl;
      const finalBio = updates.bio !== undefined ? updates.bio : profile.bio;
      const finalWebsite = updates.website !== undefined ? updates.website : profile.website;

      if (!profile.avatarUrl && !!finalAvatar) {
        void trackFirstEvent('avatar_added', 'avatar_added');
      }
      if (!profile.bannerUrl && !!finalBanner) {
        void trackFirstEvent('banner_added', 'banner_added');
      }
      if (!profile.bio?.trim() && !!finalBio?.trim()) {
        void trackFirstEvent('bio_added', 'bio_added');
      }
      if (!profile.website?.trim() && !!finalWebsite?.trim()) {
        void trackFirstEvent('website_added', 'website_added');
      }

      if (!!finalAvatar && !!finalBanner && !!finalBio?.trim() && !!finalWebsite?.trim()) {
        void trackFirstEvent('profile_completed', 'profile_completed');
      }

      onSaved(updates);
      onClose();
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const rawMessage = data?.message ?? data?.error;
      const message = Array.isArray(rawMessage) ? rawMessage.join('. ') : rawMessage;
      let friendly: string;
      if (status === 401) friendly = 'Your session expired. Please sign in again.';
      else if (status === 403) friendly = 'You do not have permission to update this profile.';
      else if (status === 413) friendly = 'Image is too large. Please choose a smaller file.';
      else if (status === 422 || status === 400) friendly = message || 'Some fields are invalid. Please review and try again.';
      else if (status >= 500) friendly = 'Server error. Please try again in a moment.';
      else friendly = message || err?.message || 'Failed to save. Please try again.';
      // eslint-disable-next-line no-console
      console.error('[ProfileEditModal] save failed', { status, data });
      setError(friendly);
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = avatarPreview ?? (!doRemoveAvatar ? resolveMediaUrl(profile.avatarUrl) || null : null);
  const currentBanner = bannerPreview ?? (!doRemoveBanner ? resolveMediaUrl(profile.bannerUrl) || null : null);
  const hasAvatar = !!(currentAvatar);
  const hasBanner = !!(profile.bannerUrl || bannerFile) && !doRemoveBanner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Banner */}
        <div className="relative h-36 bg-gradient-to-br from-purple-600 via-violet-500 to-pink-500 overflow-hidden group">
          {currentBanner && (
            <Image src={currentBanner} alt="banner" fill className="object-cover" sizes="100vw" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white rounded-full text-xs font-semibold transition-colors"
            >
              <Camera size={13} /> Change banner
            </button>
            {(hasBanner) && (
              <button
                type="button"
                onClick={clearBanner}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-full text-xs font-semibold transition-colors"
              >
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pickBanner} />
        </div>

        {/* Avatar + action buttons */}
        <div className="px-6 -mt-10 mb-2">
          <div className="flex items-end gap-4">
            {/* Avatar circle */}
            <div className="relative w-20 h-20 group flex-shrink-0">
              <div className="relative w-20 h-20 rounded-full ring-4 ring-white bg-gray-100 overflow-hidden shadow-lg">
                {currentAvatar ? (
                  <Image src={currentAvatar} alt="avatar" fill className="object-cover" sizes="80px" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                    <User size={28} className="text-purple-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Change avatar"
              >
                <Camera size={18} className="text-white" />
              </button>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pickAvatar} />
            </div>

            {/* Avatar action links */}
            <div className="pb-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="text-sm text-purple-600 font-semibold hover:text-purple-700 transition-colors text-left"
              >
                {hasAvatar ? 'Change photo' : 'Upload photo'}
              </button>
              {hasAvatar && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className="text-sm text-red-500 font-medium hover:text-red-600 transition-colors text-left"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-6 flex flex-col gap-4 mt-4">

          {/* Display name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Display Name
            </label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className="w-full pl-9 pr-14 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                placeholder="Your display name"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                {displayName.length}/50
              </span>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Bio
            </label>
            <div className="relative">
              <FileText size={15} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                placeholder="Tell the world about yourself…"
              />
              <span className="absolute bottom-2.5 right-3 text-xs text-gray-400 pointer-events-none">
                {bio.length}/160
              </span>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Location
            </label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={100}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                placeholder="City, State or Country"
              />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Website
            </label>
            <div className="relative">
              <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                type="url"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                placeholder="https://yourwebsite.com"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
