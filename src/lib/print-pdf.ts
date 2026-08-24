// Sends a generated receipt PDF straight to the browser's print dialog.
//
// The bytes are loaded into a hidden iframe and printed from there, so the user
// never leaves the page they are on and never has to find the file on disk
// first. Browsers that refuse to drive their embedded PDF viewer this way get
// the file opened in a tab instead, where the viewer's own print control works.
//
// Client-side only — imported by client components.
const FRAME_ID = "receipt-print-frame";

export function printPdf(url: string): void {
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
    window.open(url, "_blank", "noopener");
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
