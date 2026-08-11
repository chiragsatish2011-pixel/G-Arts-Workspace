import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { isVideo } from '@g-arts/chat-shared';
import { useUIStore } from '../../stores/ui';

export function Lightbox() {
  const lightbox = useUIStore((s) => s.lightbox);
  const close = useUIStore((s) => s.closeLightbox);
  const openLightbox = useUIStore((s) => s.openLightbox);

  const move = (delta: number) => {
    if (!lightbox) return;
    const next = (lightbox.index + delta + lightbox.items.length) % lightbox.items.length;
    openLightbox(lightbox.items, next);
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = lightbox?.items[lightbox.index];

  return (
    <AnimatePresence>
      {lightbox && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col bg-black/92 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 text-white/80"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate text-[13px]">{current.fileName}</span>
            <span className="text-[12px] text-white/50">
              {lightbox.index + 1} / {lightbox.items.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <a
                href={current.url}
                download={current.fileName}
                className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-white/10"
                aria-label="Download"
              >
                <Download size={17} />
              </a>
              <button
                onClick={close}
                className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-white/10"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            {lightbox.items.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  move(-1);
                }}
                className="absolute left-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Previous"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={current.url}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full"
              >
                {isVideo(current.mimeType) ? (
                  <video src={current.url} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg" />
                ) : (
                  <img
                    src={current.url}
                    alt={current.fileName}
                    className="max-h-[80vh] max-w-full rounded-lg object-contain"
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {lightbox.items.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  move(1);
                }}
                className="absolute right-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Next"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
