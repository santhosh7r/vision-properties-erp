// Sends a generated receipt PDF to the printer, from whatever the user is on.
//
// There are two ways to do this and no single one that works everywhere:
//
//   · A desktop browser will render a PDF in a hidden iframe and let a script
//     drive its print dialog, so the user never leaves the page they are on and
//     never has to find the file on disk first.
//
//   · A phone or tablet will not. iOS Safari and Android Chrome hand a PDF to a
//     native viewer instead of rendering it in the frame, so the frame stays
//     empty and `print()` on it prints nothing (or prints the page behind it).
//     There the receipt is opened in a tab, where the viewer's own Print / Share
//     control does the job properly.
//
// The tab has to be opened DURING the click. A popup opened later — from a
// timeout, or after an async check — is blocked, which is exactly how the mobile
// path used to fail silently: the frame never printed and the fallback never
// arrived. So the decision is made up front, synchronously, from the device.
//
// Client-side only — imported by client components.
const FRAME_ID = "receipt-print-frame";

// True for the browsers that will actually render a PDF inside an iframe.
// iPadOS reports itself as a Mac, so it is identified by the touch points a Mac
// does not have rather than by its name.
function canPrintInFrame(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  return !iOS && !android;
}

// Opens the receipt where the device's own viewer can print or share it. Called
// straight from the click so the popup blocker allows it; if it is blocked all
// the same, the current tab goes there instead — the receipt page is a
// standalone view, so nothing is lost by navigating to it.
function openForNativePrint(url: string): void {
  const tab = window.open(url, "_blank", "noopener");
  if (!tab) window.location.href = url;
}

export function printPdf(url: string): void {
  if (!canPrintInFrame()) return openForNativePrint(url);

  document.getElementById(FRAME_ID)?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = FRAME_ID;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.src = url;

  // `handled` is set BEFORE print() is called, not after: print() blocks until
  // the dialog is dismissed, and the safety net below must not fire a second
  // attempt while the user is still looking at that dialog.
  let handled = false;
  const openInTab = () => {
    if (handled) return;
    handled = true;
    openForNativePrint(url);
  };

  iframe.onload = () => {
    // The embedded PDF viewer needs a beat after load before it accepts print().
    setTimeout(() => {
      const win = iframe.contentWindow;
      if (!win) return openInTab();
      try {
        handled = true;
        win.focus();
        win.print();
      } catch {
        handled = false;
        openInTab();
      }
    }, 300);
  };
  iframe.onerror = openInTab;

  document.body.appendChild(iframe);

  // If the frame never loads at all (blocked, or an ~8MB file over a slow link
  // that stalls), hand the receipt over in a tab rather than doing nothing.
  setTimeout(openInTab, 15_000);
  // Keep the frame alive well past the dialog, then clean it up.
  setTimeout(() => iframe.remove(), 120_000);
}
