// Silinx - a file given to the browser to save (#4772: the menus', the print dialog's, the waveform's, iMPACT's and
// Implement's copies, one): a link with download clicked; a blob's URL revoked a moment later.
//
//   downloadUrl(url, filename)     a URL already made (an object URL the caller revokes, a job's bitstream)
//   downloadBlob(filename, blob)   a blob: its object URL made, downloaded, revoked after 5 s

/** The file at `url` saved as `filename`. */
export function downloadUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

/** The blob saved as `filename` (its object URL revoked once the browser has it). */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
