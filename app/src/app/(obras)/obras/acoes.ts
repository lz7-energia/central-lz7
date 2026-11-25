"use server";
import { revalidatePath } from "next/cache";
import { supabaseUsuario } from "@/lib/supabase/server";

/** "Ciente" num aviso da logística (a obra já foi vista). */
export async function avisoCiente(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  const sb = await supabaseUsuario();
  await sb.rpc("obra_aviso_ciente", { p_id: id });
  revalidatePath("/obras");
}
