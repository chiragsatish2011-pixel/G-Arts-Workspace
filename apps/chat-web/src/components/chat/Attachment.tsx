import { useEffect, useState } from 'react';
import { FileText, Download, Play, Pause } from 'lucide-react';
import {
  cn,
  formatFileSize,
  formatDuration,
  isImage,
  isVideo,
  isAudio,
  type Attachment
} from '@g-arts/chat-shared';
import { useUIStore } from '../../stores/ui';
import { mediaUrl as attachmentUrl } from '../../lib/media';

export { attachmentUrl };

function useAttachmentUrl(attachment: Attachment) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    attachmentUrl(attachment.id)
      .then((value) => active && setUrl(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [attachment.id]);

  return { url, failed };
}

/**
 * Saves an attachment to disk.
 *
 * Attachments are served from an authenticated endpoint and held as blob
 * URLs, so a plain link cannot reach them — this anchors the already-fetched
 * blob and gives it the original filename. Every kind of attachment gets one:
 * previously only the generic file row was downloadable, so an image, a video
 * or a voice note could be seen but never saved.
 */
function DownloadButton({ url, fileName, className }: { url: string | null; fileName: string; className?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      download={fileName}
      onClick={(e) => e.stopPropagation()}
      title={`Download ${fileName}`}
      aria-label={`Download ${fileName}`}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface/90',
        'text-ink-soft backdrop-blur transition-colors hover:text-brand hover:border-brand',
        className
      )}
    >
      <Download size={14} />
    </a>
  );
}

export function AttachmentView({
  attachment,
  attachments,
  own
}: {
  attachment: Attachment;
  attachments: Attachment[];
  own: boolean;
}) {
  const openLightbox = useUIStore((s) => s.openLightbox);
  const { url, failed } = useAttachmentUrl(attachment);

  if (isImage(attachment.mimeType)) {
    return (
      <button
        type="button"
        onClick={async () => {
          const items = await Promise.all(
            attachments
              .filter((a) => isImage(a.mimeType) || isVideo(a.mimeType))
              .map(async (a) => ({
                url: await attachmentUrl(a.id),
                fileName: a.fileName,
                mimeType: a.mimeType
              }))
          );
          const index = items.findIndex((i) => i.fileName === attachment.fileName);
          openLightbox(items, Math.max(index, 0));
        }}
        className="group/img relative block max-w-[340px] overflow-hidden rounded-xl bg-sunken"
      >
        <DownloadButton
          url={url}
          fileName={attachment.fileName}
          className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/img:opacity-100 focus:opacity-100"
        />
        {url ? (
          <img
            src={url}
            alt={attachment.fileName}
            loading="lazy"
            className="max-h-[340px] w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
          />
        ) : (
          <div className={cn('h-40 w-56', failed ? 'grid place-items-center' : 'skeleton')}>
            {failed && <span className="text-xs text-ink-faint">Could not load image</span>}
          </div>
        )}
      </button>
    );
  }

  if (isVideo(attachment.mimeType)) {
    return url ? (
      <div className="group/vid relative inline-block">
        <DownloadButton
          url={url}
          fileName={attachment.fileName}
          className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/vid:opacity-100 focus:opacity-100"
        />
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-[340px] max-w-[340px] rounded-xl bg-black"
      />
      </div>
    ) : (
      <div className="skeleton h-40 w-56" />
    );
  }

  if (isAudio(attachment.mimeType)) {
    return <VoiceNote attachment={attachment} url={url} own={own} />;
  }

  return (
    <a
      href={url ?? undefined}
      download={attachment.fileName}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
        'border-line bg-ink/[0.04] hover:bg-ink/[0.07]'
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          'bg-brand-soft text-brand'
        )}
      >
        <FileText size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{attachment.fileName}</span>
        <span className="block text-[11px] text-ink-faint">
          {formatFileSize(attachment.fileSize)}
        </span>
      </span>
      <Download size={15} className="shrink-0 opacity-60" />
    </a>
  );
}

/** Audio attachments render as a compact voice-note player with a waveform. */
function VoiceNote({
  attachment,
  url,
  own
}: {
  attachment: Attachment;
  url: string | null;
  own: boolean;
}) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // A deterministic pseudo-waveform keyed off the id: real peak extraction
  // would mean decoding every clip on render.
  const bars = Array.from({ length: 34 }, (_, i) => {
    const seed = attachment.id.charCodeAt(i % attachment.id.length) + i * 7;
    return 26 + ((seed * 31) % 68);
  });

  const toggle = () => {
    if (!url) return;
    let element = audio;
    if (!element) {
      element = new Audio(url);
      element.addEventListener('timeupdate', () => {
        if (element!.duration) setProgress(element!.currentTime / element!.duration);
      });
      element.addEventListener('ended', () => {
        setPlaying(false);
        setProgress(0);
      });
      setAudio(element);
    }
    if (playing) {
      element.pause();
      setPlaying(false);
    } else {
      void element.play();
      setPlaying(true);
    }
  };

  return (
    <div
      className={cn(
        'flex min-w-[220px] items-center gap-3 rounded-xl border border-line bg-ink/[0.04] p-2.5'
      )}
    >
      <button
        onClick={toggle}
        disabled={!url}
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white transition-transform active:scale-95'
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      <div className="flex h-8 flex-1 items-center gap-[2px]">
        {bars.map((height, i) => (
          <span
            key={i}
            className={cn(
              'w-[3px] rounded-full bg-brand transition-opacity',
              i / bars.length <= progress ? 'opacity-100' : 'opacity-30'
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <span className="shrink-0 text-[11px] tabular text-ink-faint">
        {formatDuration(attachment.durationMs ?? 0)}
      </span>

      {/* A voice note is a recording somebody made; it should be keepable. */}
      <DownloadButton url={url} fileName={attachment.fileName} className="shrink-0 h-7 w-7" />
    </div>
  );
}
