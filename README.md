# Nexo

Aplicação local-first para auto-observação longitudinal de autorregulação, flexibilidade psicológica, habilidades socioemocionais, relações interpessoais e metacognição.

## Princípios
- não é teste diagnóstico nem dispositivo médico;
- itens diários são autorais e não são apresentados como escalas validadas;
- mudança intraindividual é priorizada sobre comparação normativa;
- cinco domínios permanecem separados;
- dados ausentes não viram zero;
- dados permanecem no navegador por padrão.

## Base científica
- OECD (2025), *Skills that Matter for Success and Well-being in Adulthood*. DOI: 10.1787/6e318286-en.
- Gloster et al. (2021), *Psy-Flex: A contextually sensitive measure of psychological flexibility*. DOI: 10.1016/j.jcbs.2021.09.001.
- Paul & Elder, Foundation for Critical Thinking, *The Elements of Reasoning and the Intellectual Standards*.

O projeto não reproduz itens protegidos de Psy-Flex, CompACT ou outros instrumentos. A camada diária usa itens autorais de monitoramento.

## Desenvolvimento
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## GitHub Pages
1. Em Settings → Pages, selecione **GitHub Actions** como source.
2. O workflow `.github/workflows/deploy.yml` fará build e deploy automaticamente após push na `main`.

O Vite está configurado com `base: './'` e a navegação usa `HashRouter`, evitando erros de rota em hospedagem estática.

## Privacidade
Os registros são persistidos com IndexedDB e não são enviados a servidores. Exporte backups JSON regularmente. Limpar o armazenamento do navegador pode apagar os dados locais.

## Limitações
Os escores são descritivos e dependem de autorrelato. Não há normas populacionais, diagnóstico, inferência causal ou validação psicométrica dos itens autorais.