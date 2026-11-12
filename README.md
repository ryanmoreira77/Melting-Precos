# Melting Preços · preços e lucro por cliente

Banco de clientes com a tabela de preços de cada um, análise de pedidos com opções de lucro
e IA, recomendações de estoque, calculadora de preço, proposta em PDF e envio por e-mail.

## Como abrir
Dê dois cliques em `index.html` (Chrome ou Edge). Precisa de internet para ler PDF (pdf.js),
gerar PDF da proposta (jsPDF) e exportar Excel (SheetJS); sem internet a exportação sai em CSV.

## Abas
- **Painel**: clientes, preços salvos, preços para revisar (margem abaixo do mínimo com o custo atual ou mais de 180 dias sem revisão), markup médio por cliente, próximos pedidos previstos e recomendações de estoque e compra (giro, sob encomenda, negociar fornecedor, tabela abaixo do custo). Exporta Excel.
- **Analisar pedido**: PDF ou texto → itens identificados. O cliente é reconhecido pelo nome e os preços vêm da tabela dele; sem preço salvo, usa o preço do pedido ou o sugerido. Cada item mostra as **opções de lucro** (produtos compatíveis × fornecedor mais barato × preço de venda). **Analisar lucro com IA** escolhe a opção de maior lucro e explica; sem IA, faz a análise automática pelas regras. **Salvar preços no cliente** grava os preços do pedido no banco. Também gera resposta, PDF, e-mail e Excel (pedido, opções de lucro e recomendações).
- **Calculadora**: custo + IPI + serviço + frete, lucro (markup ou margem), despesas sobre a venda → valor de venda.
- **Clientes**: cadastro, tabela de preços e regras/casos de cada cliente. **Importar Excel** aceita cadastro (Cliente, CNPJ, Contato, E-mails, Telefone, Markup, Observações), tabela de preços (Cliente + Código + Preço) e regras/casos (Cliente + Regra ou caso + Status), em qualquer aba, e mostra um resumo antes de gravar. O botão Baixar modelo traz a planilha pronta para preencher. As regras de cada cliente aparecem no pedido e são usadas pela IA.
- **Ajustes**: markups, proposta, dados da Melting, saldo de estoque, IA e Supabase.

## Sugestões por item (js/sugestoes.js)
- **Se faltar estoque**: mesma medida em outra marca/linha, versão lisa/dentada, outra largura para cortar, slab, equivalência Nitta.
- **Rendimento melhor**: correia em V dentada (AX, BX, CX, 3VX, 5VX, XPZ, XPA, XPB, XPC) no lugar da lisa; sincronizadora GT (8MGT/5MGT) no lugar da HTD; marca premium.
- **Combina com**: comprado junto nas mesmas OCs ou no mesmo pedido de cliente, terminais e capas usados com a mangueira nas FTMs, polias do mesmo perfil.
- Botões: Usar no lugar, Adicionar ao pedido e Oferecer na resposta (entra no texto e no PDF). A IA recebe as sugestões e escreve uma frase para o cliente.

## Leitura de pedidos e aprendizado
- Formatos com leitor próprio: SAP (P&G), Oracle (Alcoa/Alumar), Mercado Eletrônico (Nestlé) e texto livre (WhatsApp, e-mail).
- Texto corrido (termos e condições, observações, cláusulas) e tudo a partir de "Termos e condições" é ignorado.
- Correias em polegada são convertidas: passo 12,70 mm × 2540 mm × 50,8 mm → 1000 H 200 (também MXL, XL, L, XH, XXH).
- Custo de cadastro genérico (ex.: R$ 10,00 com tabela de R$ 748) é marcado como não confiável e não entra no lucro.
- **Aprendizado**: "não é produto" no card, "Incluir como item" numa linha ignorada e o produto que você escolhe para cada texto ficam guardados e valem nos próximos pedidos (Ajustes > Aprendizado, com exportar e apagar).

## Onde os dados ficam
- Sem configuração: no navegador (`localStorage`, chaves `melting_precos_*`). Use sempre o mesmo navegador.
- No claude.ai: no banco da página, com a conta de quem abre.
- Supabase (recomendado para a equipe): rode `sql/supabase_schema.sql`, crie os usuários em Authentication e preencha URL + chave anon em Ajustes.

## IA
- No claude.ai: funciona direto, com a conta de quem abre.
- Na versão baixada: publique `supabase/functions/analisar-pedido` com o segredo `ANTHROPIC_API_KEY` (opcional `CLAUDE_MODEL`). A chave fica no servidor, nunca no navegador.
- A IA recebe só os números do sistema (custos, fornecedores, preços do cliente e de tabela) e devolve a escolha por item; você confere e clica em Aplicar.

## E-mail direto
Publique `supabase/functions/enviar-cotacao` com `RESEND_API_KEY` e `EMAIL_REMETENTE` (domínio melting.com.br verificado). Sem isso, o botão baixa o PDF e abre o seu programa de e-mail.

## Estrutura
```
index.html  css/style.css  assets/
js/config.js       padrões (markups, proposta, empresa, IA, Supabase)
js/util.js         formatação, Excel/CSV, gráficos
js/storage.js      banco de clientes (navegador, claude.ai ou Supabase)
js/engine.js       leitura de pedidos, identificação, preço, recomendações
js/lucro.js        opções de lucro e análise com IA
js/calculadora.js  fórmulas da calculadora
js/proposta.js     PDF da proposta
js/app.js          telas
data/data.js       base compactada (gerada por scripts/gerar_base.py)
sql/  supabase/functions/
```

## Atualizar a base
`python scripts/gerar_base.py C:\caminho\das\planilhas`

## Lead time (prazo de entrega)
A base traz o lead time de cada produto (kit Melting, `lead_time_produtos.csv`): dias úteis do pedido do cliente até a entrega, com a base do cálculo.
Aparece na ficha do produto, no item do pedido (prazo da proposta), nas opções de lucro (com lucro parecido, ganha a que chega antes), nas sugestões, na busca, no Painel e nos Excel exportados. Se o cliente pede entrega mais curta que o lead time, o item mostra alerta.
Para atualizar: `python scripts/gerar_leadtime.py CAMINHO/lead_time_produtos.csv` (rode depois de `gerar_base.py`, se gerar a base de novo).

## Conversor ICMS (preço de venda)
O preço segue a planilha `conversor_icms_2025.xlsx` (módulo `js/icms.js`):
- **Cotação:** R$ Base 1 (preço de tabela do cadastro, SP com 18% de ICMS e 9,25% de PIS/COFINS) × (1 − desconto) × 0,74415 = preço sem impostos; ÷ 0,9075 ÷ (1 − ICMS da UF) = preço com ICMS; sem ICMS (consumo: c/ ICMS − (c/ ICMS + IPI) × ICMS; industrialização: c/ ICMS × (1 − ICMS)); IPI incluso = c/ ICMS × (1 + IPI).
- **ICMS por UF:** nacional 7% ou 12%, importado 4%, SP 18% (tabela editável em Ajustes).
- **Reversão:** preço do cliente (com impostos, sem impostos, sem ICMS ou IPI incluso) → preço c/ 18% e desconto equivalente sobre a Base 1.
- Cada cliente pode ter UF, parâmetro (consumo/industrialização), desconto padrão e o tipo de preço que vem nos pedidos dele. No pedido, a barra "Conversor ICMS" mostra e permite mudar esses valores.
- Lucro e markup são calculados sobre o preço **sem impostos** (− custo com IPI). O markup mínimo de Ajustes avisa quando o desconto come o lucro; o markup por categoria só vale para itens sem Base 1.
