// Save text as a file: the File System Access picker where available (Edge and Chrome, also on
// file://), otherwise a plain download. Resolves false when the user cancels the picker.

export async function saveText(name, text, { mime = 'application/json', description = 'JSON', ext = '.json' } = {}) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [mime]: [ext] } }] });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      /* fall through to a download */
    }
  }
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return true;
}

/** Let the user pick one file and return its text, or null when nothing was chosen. */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'srhide';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
