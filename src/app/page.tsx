import LeadTable, { type Lead } from "@/components/LeadTable";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function Home() {
  let leads: Lead[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("leads_escolares")
      .select(
        "id,nome_escola,cidade,telefone_escola,email_escola,nome_decisor,email_decisor,status,ultima_interacao",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    leads = (data ?? []) as Lead[];
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Não foi possível carregar os leads.";
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-12 sm:px-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.28em] text-indigo-400">
            Littera CRM
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Prospecção escolar
          </h1>
        </div>
        <span className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 sm:block">
          {leads.length} leads
        </span>
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : (
        <LeadTable leads={leads} />
      )}
    </main>
  );
}
