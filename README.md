# EletroScore

App experimental para iniciar a prospecção de pontos de recarga a partir do nome de uma cidade brasileira. A entrada é apenas **Cidade** (pode acrescentar UF para desambiguar). A saída traz locais para investigar, pontos de recarga cadastrados, mapa interativo, contexto por endereço e uma faixa exploratória de EletroScore nos cenários AC e DC.

## Rodar

Requer Node.js 20 ou mais recente. Não há dependências externas de npm.

```bash
npm start
```

Abra `http://localhost:3000`. Execute `npm test` para os testes. Defina `PORT` para trocar a porta.

### Windows PowerShell

O PowerShell pode bloquear o atalho `npm.ps1`. Use `npm.cmd start` sem alterar a política de execução. O comando precisa ser executado na pasta que contém `package.json`. Se você extraiu o ZIP do GitHub, confira se há uma pasta `eletroscore-main` dentro da pasta atual:

```powershell
Get-ChildItem -Recurse -Filter package.json -File | Select-Object -ExpandProperty FullName
```

Entre na pasta mostrada pelo comando e execute `npm.cmd start`. Se nenhum arquivo aparecer, faça um clone novo do repositório:

```powershell
cd $HOME\Downloads
git clone https://github.com/jquinteiroo/eletroscore.git eletroscore-app
cd .\eletroscore-app
npm.cmd start
```

Para atualizar um clone existente, interrompa o servidor com `Ctrl+C`, execute `git pull` na pasta do projeto e rode `npm.cmd start` novamente. No navegador, use `Ctrl+F5` para atualizar os arquivos em cache.

### Mapa

O mapa usa [Leaflet 1.9.4](https://leafletjs.com/download.html) para exibir ruas do [OpenStreetMap](https://www.openstreetmap.org/copyright). É possível arrastar, aproximar, abrir os marcadores e selecionar um candidato no mapa ou na lista. Verde indica candidato; azul indica recarga cadastrada, sem confirmação de operação. A quantidade de candidatos sem coordenadas aparece abaixo do mapa; eles permanecem na lista. A base de ruas precisa de internet no navegador. Se a biblioteca ou os mosaicos não carregarem, o app exibe o mapa esquemático de posições.

O piloto de Vinhedo tem somente três posições com coordenadas verificadas entre vinte locais; desenhar ruas não cria posições para os outros dezessete. A validação de endereço e entrada é o próximo passo para ampliar a cobertura.

### Análise por endereço

- A pontuação AC e DC é calculada no servidor, em `src/core.mjs`, e enviada para a interface e para o JSON. A categoria `Shopping` tem regra explícita em ambos os cenários. A faixa mostra pontos atribuídos e critérios pendentes; adequação e permanência são **hipóteses pelo tipo de lugar**, mesmo quando já somadas no limite inferior.
- Para cidades consultadas no OSM, cada ficha compara a posição do local com recargas cadastradas em raios de 1 e 3 km em **linha reta**, mostra as três mais próximas e, quando há tags, o tipo AC/DC e as condições de acesso. São registros dentro do recorte pesquisado: não representam inventário completo, rota rodoviária, potência disponível ou funcionamento. Nenhum ponto de concorrência é fechado a partir dessa contagem.
- Os pilotos pesquisados mantêm fichas e fontes próprias. Eles ainda **não têm inventário georreferenciado de recargas integrado**; o painel mostra pendência em vez de zero, mesmo quando existem relatos textuais de recarga nas fichas.
- Cada local apresenta um quadro de evidências e um roteiro de visita para conferir vaga, circulação, funcionamento de recargas, gestor e energia. A lista automática alterna categorias; dentro de cada categoria prioriza cadastros com estacionamento e endereço preenchidos. Isso organiza visitas, não comprova viabilidade comercial.
- O quadro de movimento abre uma busca pelo nome e endereço no Google Maps para conferir **horários de pico**, quando o estabelecimento tiver dados suficientes. Confirme que o resultado corresponde ao local da ficha. O gráfico compara horários com o pico semanal do próprio estabelecimento; não fornece número de visitantes e não deve ser comparado como volume absoluto entre lugares. A [documentação de campos da Places API](https://developers.google.com/maps/documentation/places/web-service/data-fields) não oferece uma série de horários de pico para importação pela aplicação web. O app não coleta nem pontua automaticamente esse conteúdo; movimento permanece pendente até uma fonte e método de validação adequados.
- A busca automática inclui hotéis, shoppings, supermercados, restaurantes, adegas, atrações e postos de combustível com nome cadastrado. A amostra exibida continua limitada a 25 locais. O registro de recarga é separado dos candidatos.

Vinhedo e Poços de Caldas têm pilotos de pesquisa em `public/data/` e funcionam sem conexão com serviços externos. Para outras cidades, o servidor consulta Nominatim para resolver o município e Overpass para os cadastros OpenStreetMap. Municípios pequenos podem ser buscados pelo limite cadastrado; cidades extensas usam inicialmente uma área central de cerca de 6 km. Se a primeira consulta falhar por sobrecarga, o app tenta uma segunda instância Overpass com raio de 3 km e identifica o recorte na tela. A busca pode incluir estabelecimentos de municípios vizinhos e não é cobertura integral. O app mantém respostas bem-sucedidas por 24 horas em memória.

## Leitura responsável

- **Poços de Caldas:** indicador municipal BEV + PHEV do painel ABVE consultado no piloto em setembro de 2026.
- **Vinhedo:** 849 BEV + PHEV constam em base secundária Carregados, sem período inicial claro; a informação não foi reconciliada com a tabela municipal ABVE. A nota de demanda é provisória.
- **Demais cidades:** demanda municipal ABVE fica pendente (0–25 pontos na faixa) até integração com fonte verificável. O app não atribui automaticamente a elas o dado estadual ou o número de municípios vizinhos.
- **Campinas, Valinhos, Jundiaí, Pouso Alegre e Varginha:** os totais BEV + PHEV municipais consultados no painel ABVE durante os pilotos (jan/2022–ago/2026) foram aproveitados como fotografia datada; outras cidades continuam pendentes. Em Campinas, a demanda igual para toda a cidade contribui com 25 pontos para cada endereço, sem diferenciar bairros.
- Os registros de carregadores do OSM não garantem funcionamento, potência, preço ou acesso, mesmo quando esses campos estão preenchidos no cadastro. O componente de concorrência (25 pontos) fica pendente para todos. Local ausente do cadastro não significa que ele não existe.
- A classificação de adequação e permanência é uma hipótese por tipo de local; não mede movimento, receita ou retorno. Estacionamento só ganha 10 pontos se estiver documentado na ficha do piloto ou na tag OSM pertinente. Acesso efetivo à vaga de recarga permanece pendente.

## Método

| Critério | Pontos | Estado no MVP |
| --- | ---: | --- |
| Demanda BEV + PHEV municipal | 25 | `25 × min(1, emplacamentos / 1000)` quando conhecido; caso contrário 0–25 pendentes |
| Concorrência operacional | 25 | Pendente: registros não são inspeção |
| Adequação AC/DC | 20 | Hipótese por categoria; valores explícitos em `src/core.mjs` |
| Estacionamento e acesso | 20 | 10 por vaga documentada; acesso à recarga pendente |
| Atração / permanência | 10 | Hipótese por categoria ou pesquisa do piloto |

Faixas são **somas de dados municipais, hipóteses por categoria, atributos cadastrados e pontos pendentes**, não intervalos de confiança ou probabilidades de retorno. O número de candidatos automáticos é limitado a 25; a seleção alterna categorias para não listar somente hotéis numa cidade grande. Uma mesma categoria pode repetir a mesma nota quando o cadastro não comprova vagas ou diferenças entre endereços. O contexto de recargas diferencia fichas para investigação, mas não altera a nota sem confirmação de operação. A lista automática é uma amostra diversa, não ranking comercial.

## Fontes e limites técnicos

- [ABVE Data — Geografia da Eletromobilidade](https://abve.org.br/abve-data/bi-geografia-da-eletromobilidade/)
- [Carregados — Vinhedo](https://carregados.com.br/estacoes?cidade=vinhedo&estado=s%C3%A3o+paulo+%28sp%29)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) (© colaboradores, licença ODbL), [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) e [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- As fichas dos pilotos trazem seus próprios links para Prefeitura, estabelecimento e diretórios.

O servidor serializa chamadas Nominatim com intervalo mínimo de 1,1 segundo e cacheia as consultas. Os serviços públicos têm limites próprios. Para operação com tráfego real, migre as consultas para instâncias contratadas/autogeridas, monitore carga, armazene resultados em banco com política de atualização e obtenha um feed municipal da ABVE com permissão e método de integração definidos. Não use a infraestrutura pública do OSM como backend irrestrito de produção.

## Próximos passos

1. Validar entrada, vagas e recarga dos locais pesquisados em Vinhedo e Poços.
2. Integrar emplacamentos municipais ABVE de forma auditável e datada, com BEV/PHEV e período consistentes.
3. Conferir cobertura do OSM e construir inventário operacional de conectores também para os pilotos. O painel ABVE/Tupi publica totais de infraestrutura, mas o app precisa de um conjunto geográfico autorizado e atualizável para cruzar cada endereço.
4. Somar dados de permanência observada, fluxo medido por fonte licenciada ou visita, capacidade elétrica e cenário comercial antes de recomendar instalação. Comparar uma pequena amostra de locais selecionados com visitas técnicas e registrar resultados reais de uso depois da instalação.

O projeto é independente e não representa índice oficial da ABVE.
