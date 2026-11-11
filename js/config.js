/* Melting · configurações padrão
   Tudo aqui pode ser alterado também pela tela "Ajustes" (fica salvo no navegador).
   Para o banco de clientes compartilhado, preencha supabase.url e supabase.anonKey. */
window.MELT_CONFIG = {
  empresa: {
    nome: "Melting Produtos para Manutenção Industrial Ltda",
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "comercial@melting.com.br",
    site: "",
    observacoes: "Preços em reais (R$). Impostos conforme legislação vigente. Sujeito a confirmação de estoque no fechamento do pedido.",
    assinatura: "Equipe Comercial Melting\ncomercial@melting.com.br",
  },
  proposta: {
    validadeDias: 10,
    pagamento: "28 dias",
    frete: "CIF São Paulo",
    prazoExtraDias: 3, // dias somados ao prazo do fornecedor (recebimento, corte, expedição)
    prazoPadraoDias: 7, // quando o fornecedor não tem prazo cadastrado
  },
  // markup sobre o custo com IPI, por categoria (campo "origem" do cadastro)
  markup: {
    padrao: 1.8,
    minimo: 1.3, // abaixo disso o sistema avisa
    porCategoria: {
      "CORREIAS EM V": 1.7,
      "CORREIAS SINCRONIZADORAS": 1.9,
      "CORREIA SINCRONIZADORA PU": 1.9,
      "CORREIAS PLANAS TRANSPORTE": 1.8,
      "CORREIAS PLANA TRANSMISSAO": 1.8,
      "CORREIAS POWER BAND": 1.7,
      "MANGUEIRAS HIDRAULICAS": 1.8,
      "TERMINAL / CAPA / CONEXAO / ENGATE": 2.0,
      "PNEUMATICA": 1.7,
      "POLIA": 1.6,
    },
  },
  // IA: no claude.ai usa a conta de quem abre; na versão baixada, usa a Edge Function abaixo (precisa do Supabase)
  ia: { funcao: "analisar-pedido" },
  // banco de clientes compartilhado (opcional). Ver sql/supabase_schema.sql
  supabase: {
    url: "https://rbarvmaiagdnniefeooo.supabase.co", // projeto "Melting"
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiYXJ2bWFpYWdkbm5pZWZlb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDM2NTYsImV4cCI6MjEwMjE3OTY1Nn0.u82WPKjPWGFb4pAbLiaZXa5qZLzLd1HG2yc-69XWgDA", // chave pública (anon); os dados ficam protegidos pelo login + RLS
    funcaoEmail: "enviar-cotacao", // Edge Function que envia o e-mail com o PDF (ver supabase/functions)
  },
};
