// Melting · envia a proposta comercial por e-mail com o PDF anexado
// Deploy:  supabase functions deploy enviar-cotacao
// Segredos (Project Settings > Edge Functions > Secrets):
//   RESEND_API_KEY   chave do Resend (resend.com), com o domínio melting.com.br verificado
//   EMAIL_REMETENTE  ex.: "Comercial Melting <comercial@melting.com.br>"
// Só usuários logados no Supabase da Melting conseguem chamar (o JWT é verificado pelo Supabase).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  // quem está enviando
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ erro: "faça login no sistema para enviar e-mails" }, 401);

  const { para = [], cc = [], assunto = "", texto = "", responderPara = "", anexo } = await req.json().catch(() => ({}));
  const dest = [...para, ...cc];
  if (!para.length || dest.some((e: string) => !EMAIL.test(e))) return json({ erro: "e-mail de destino inválido" }, 400);
  if (dest.length > 10) return json({ erro: "no máximo 10 destinatários" }, 400);
  if (!assunto || !texto) return json({ erro: "assunto e texto são obrigatórios" }, 400);
  if (anexo && (anexo.base64?.length ?? 0) > 8_000_000) return json({ erro: "PDF grande demais" }, 400);

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_REMETENTE"),
      to: para, cc: cc.length ? cc : undefined,
      reply_to: responderPara || user.email,
      subject: assunto,
      text: texto,
      attachments: anexo ? [{ filename: anexo.nome || "proposta.pdf", content: anexo.base64 }] : undefined,
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ erro: out?.message || `falha no envio (${r.status})` }, 502);

  // registro do envio (opcional: tabela envios_email; ignora se não existir)
  await sb.from("mp_envios_email").insert({ para: para.join(", "), cc: cc.join(", "), assunto, enviado_por: user.id, id_provedor: out.id }).then(() => {}, () => {});
  return json({ ok: true, id: out.id });
});
