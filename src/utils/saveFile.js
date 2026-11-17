// Save a file the browser made (post images and videos).
// Chrome on Android starts the download a moment after the click, so the link
// has to be on the page when clicked and the file kept around for a while;
// revoking it after a second can make the download fail without any error.
export function saveFile(blobOrUrl, name) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// What to tell people after starting a download: phones don't put downloads
// in the photo gallery, so say where to look.
export const savedMessage = (kind = 'Image') => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) return `${kind} saved to Downloads. Look in My Files (or Files) > Downloads; it may not show in Gallery right away. Share sends it straight to an app.`;
  if (/iPhone|iPad|iPod/i.test(ua)) return `${kind} saved to the Files app > Downloads. Share > Save puts it in Photos.`;
  return `${kind} saved to your downloads folder.`;
};

// Images: on iPhone/iPad a download lands in the Files app, not Photos, so
// open the share sheet instead (its "Save Image" puts it in Photos). Falls
// back to a normal download. Returns 'shared' | 'cancelled' | 'downloaded'.
const isApple = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export async function saveImage(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (isApple() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  saveFile(blob, name);
  return 'downloaded';
}
