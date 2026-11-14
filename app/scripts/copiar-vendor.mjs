// Copia as bibliotecas da plataforma de colaboradores (instaladas pelo npm, nas mesmas versões do original)
// para public/colab-app/vendor, servidas pelo próprio site no lugar do CDN. Roda antes do build e do dev.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "public", "colab-app", "vendor");
mkdirSync(destino, { recursive: true });
const arquivos = {
  "xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js",
  "jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js",
  "jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
  "pdf.min.js": "pdfjs-dist/build/pdf.min.js",
  "pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js",
  "pdf-lib.min.js": "pdf-lib/dist/pdf-lib.min.js",
  "supabase.js": "@supabase/supabase-js/dist/umd/supabase.js",
};
for (const [nome, origem] of Object.entries(arquivos)) copyFileSync(join(raiz, "node_modules", origem), join(destino, nome));
console.log(`colab-app: ${Object.keys(arquivos).length} bibliotecas copiadas`);
