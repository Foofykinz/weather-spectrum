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
  if (/Android/i.test(ua)) return `${kind} saved. In your Gallery or Photos app, open the Download album (it can take a moment to show up).`;
  if (/iPhone|iPad|iPod/i.test(ua)) return `${kind} saved to the Files app > Downloads. For Photos, tap Share, then Save ${kind}.`;
  return `${kind} saved to your downloads folder.`;
};

// iPhone / iPad (iPadOS reports itself as a Mac with a touch screen).
export const isApple = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Phones and tablets: save through SaveImageSheet (press and hold) instead of a download.
export const isPhone = () => typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isApple());
