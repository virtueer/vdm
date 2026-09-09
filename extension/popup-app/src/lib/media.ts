import type { VideoLink } from '@/types';

export type MediaKind = 'video' | 'audio';

const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|flac|mka)$/i;
const AUDIO_PLAYLIST = /_aud(\d+)?\.(txt|m3u8)$/i;

export function isYouTubeLink(video: VideoLink): boolean {
  return (
    video.type === 'youtube' || video.url.includes('youtube.com') || video.url.includes('youtu.be')
  );
}

export function isAudioLink(video: VideoLink): boolean {
  if (isYouTubeLink(video)) return false;
  return Boolean(
    video.mimeType?.startsWith('audio/') ||
      video.type === 'audio' ||
      AUDIO_EXTENSIONS.test(video.url) ||
      AUDIO_PLAYLIST.test(video.url) ||
      /audio/i.test(video.url.split('/').pop() || '')
  );
}

/** Single source of truth for the Video / Ses split. */
export function mediaKindOf(video: VideoLink): MediaKind {
  return isAudioLink(video) ? 'audio' : 'video';
}
