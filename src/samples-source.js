// Where "Try with sample data" gets its files. Development version: fetched next to the page.
// The release bundle replaces this module with one that decodes embedded copies.

export const SAMPLE_FILES = ['fio-sample.csv', 'revolut-sample.csv', 'airbank-sample.pdf'];

export async function getSampleFiles() {
  return Promise.all(SAMPLE_FILES.map(async (name) => {
    const res = await fetch(new URL('../samples/' + name, import.meta.url));
    if (!res.ok) throw new Error(`sample ${name}: HTTP ${res.status}`);
    return { name, bytes: new Uint8Array(await res.arrayBuffer()) };
  }));
}
