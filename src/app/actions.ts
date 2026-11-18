"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function markLeadAsContacted(id: string) {
  if (!id) {
    throw new Error("Lead inválido.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("leads_escolares")
    .update({
      status: "contato_enviado",
      ultima_interacao: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Não foi possível atualizar o lead: ${error.message}`);
  }

  revalidatePath("/");
}
