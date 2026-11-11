/* Melting · cálculo de preço de venda
   Entrada: custo, IPI da compra, frete/outros, lucro desejado e despesas sobre a venda.
   Dois modos:
   - "markup": lucro em % sobre o custo  → preço = custo total × (1 + lucro) ÷ (1 − despesas)
   - "margem": lucro em % sobre a venda  → preço = custo total ÷ (1 − lucro − despesas)
   As despesas sobre a venda (impostos, comissão, taxa de cartão) entram "por dentro", para o lucro sobrar limpo. */
(function (G) {
  const C = {};
  C.calc = function ({ custo = 0, ipi = 0, frete = 0, servico = 0, lucro = 0, modo = "markup", impostos = 0, comissao = 0, outras = 0, arred = "nao", qtd = 1 }) {
    const custoProduto = custo * (1 + ipi / 100);
    const custoTotal = custoProduto + servico + frete;
    const ded = (impostos + comissao + outras) / 100;
    let preco, erro = "";
    if (modo === "margem") {
      const d = 1 - lucro / 100 - ded;
      if (d <= 0) { erro = "Lucro + despesas sobre a venda chegam a 100% ou mais. Diminua um dos dois."; preco = NaN; }
      else preco = custoTotal / d;
    } else {
      if (ded >= 1) { erro = "As despesas sobre a venda chegam a 100% ou mais."; preco = NaN; }
      else preco = (custoTotal * (1 + lucro / 100)) / (1 - ded);
    }
    const bruto = preco;
    if (!erro && preco > 0) preco = C.arredondar(preco, arred);
    const despesas = preco * ded;
    const lucroR = preco - despesas - custoTotal;
    return {
      erro, custoProduto, servico, frete, custoTotal, preco, bruto, despesas, lucroR,
      margem: preco ? lucroR / preco : 0,           // lucro ÷ preço de venda
      markup: custoTotal ? lucroR / custoTotal : 0, // lucro ÷ custo
      fator: custoTotal ? preco / custoTotal : 0,   // preço ÷ custo (o "markup multiplicador")
      qtd, total: preco * qtd, lucroTotal: lucroR * qtd,
    };
  };
  C.arredondar = function (v, modo) {
    if (modo === "90") { const i = Math.floor(v); return i + 0.9 >= v ? i + 0.9 : i + 1.9; }
    if (modo === "inteiro") return Math.ceil(v);
    if (modo === "5") return Math.ceil(v / 5) * 5;
    return Math.round(v * 100) / 100;
  };
  G.MeltCalc = C;
})(window);
