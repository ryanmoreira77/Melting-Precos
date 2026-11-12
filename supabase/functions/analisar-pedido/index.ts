// Melting Preços · análise do pedido com IA (Claude) para a versão baixada do sistema
// Deploy:  supabase functions deploy analisar-pedido
// Segredo: ANTHROPIC_API_KEY  (console.anthropic.com)   Opcional: CLAUDE_MODEL (padrão claude-sonnet-5-5)
// Só usuários logados no Supabase da Melting conseguem chamar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ erro: "faça login no sistema para usar a IA" }, 401);

  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt || prompt.length > 120_000) return json({ erro: "pedido vazio ou grande demais" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ erro: out?.error?.message || `falha na IA (${r.status})` }, 502);
  const texto = (out.content || []).map((c: { text?: string }) => c.text || "").join("");
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  try { return json({ resultado: JSON.parse(texto.slice(ini, fim + 1)) }); }
  catch { return json({ erro: "a IA não devolveu JSON válido", texto }, 502); }
});
