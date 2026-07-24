import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseServer();
  const { data: photos } = await supabase
    .from("photos")
    .select("file_path, taken_at, body_site, cases(research_id)");

  const zip = new JSZip();

  for (const p of photos ?? []) {
    const c = Array.isArray(p.cases) ? p.cases[0] : p.cases;
    const { data: fileBlob } = await supabase.storage.from("wound-photos").download(p.file_path);
    if (!fileBlob) continue;
    const arrayBuffer = await fileBlob.arrayBuffer();
    const dateStr = new Date(p.taken_at).toISOString().slice(0, 10);
    const filename = `${c?.research_id ?? "unknown"}_${dateStr}_${p.file_path.split("/").pop()}`;
    zip.file(filename, arrayBuffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="keloid-photos-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
