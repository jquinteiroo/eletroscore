# EletroScore

App experimental para iniciar a prospecção de pontos de recarga a partir do nome de uma cidade brasileira. A entrada é apenas **Cidade** (pode acrescentar UF para desambiguar). A saída traz locais para investigar, pontos de recarga cadastrados, mapa de posições e uma faixa de EletroScore nos cenários AC e DC.

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

Vinhedo e Poços de Caldas têm pilotos de pesquisa em `public/data/` e funcionam sem conexão com serviços externos. Para outras cidades, o servidor consulta Nominatim para resolver o município e Overpass para os cadastros OpenStreetMap. Municípios pequenos podem ser buscados pelo limite cadastrado; cidades extensas usam inicialmente uma área central de cerca de 6 km. Se a primeira consulta falhar por sobrecarga, o app tenta uma segunda instância Overpass com raio de 3 km e identifica o recorte na tela. A busca pode incluir estabelecimentos de municípios vizinhos e não é cobertura integral. O app mantém respostas bem-sucedidas por 24 horas em memória.

## Leitura responsável

- **Poços de Caldas:** indicador municipal BEV + PHEV do painel ABVE consultado no piloto em setembro de 2026.
- **Vinhedo:** 849 BEV + PHEV constam em base secundária Carregados, sem período inicial claro; a informação não foi reconciliada com a tabela municipal ABVE. A nota de demanda é provisória.
- **Outras cidades:** demanda municipal ABVE fica pendente (0–25 pontos na faixa) até integração com fonte verificável. O app não atribui automaticamente a elas o dado estadual ou o número de municípios vizinhos.
- Os registros de carregadores do OSM não garantem funcionamento, potência, preço ou acesso. O componente de concorrência (25 pontos) fica pendente para todos. Local ausente do cadastro não significa que ele não existe.
- A classificação de adequação e permanência é uma hipótese por tipo de local; não mede movimento, receita ou retorno. Estacionamento só ganha 10 pontos se estiver documentado na ficha do piloto ou na tag OSM pertinente. Acesso efetivo à vaga de recarga permanece pendente.

## Método

| Critério | Pontos | Estado no MVP |
| --- | ---: | --- |
| Demanda BEV + PHEV municipal | 25 | `25 × min(1, emplacamentos / 1000)` quando conhecido; caso contrário 0–25 pendentes |
| Concorrência operacional | 25 | Pendente: registros não são inspeção |
| Adequação AC/DC | 20 | Hipótese por categoria; valores explícitos em `src/core.mjs` |
| Estacionamento e acesso | 20 | 10 por vaga documentada; acesso à recarga pendente |
| Atração / permanência | 10 | Hipótese por categoria ou pesquisa do piloto |

Faixas são **somas de pontos verificados e pendentes**, não intervalos de confiança. A ordenação favorece locais com mais informação pública. O número de candidatos automáticos é limitado a 25.

## Fontes e limites técnicos

- [ABVE Data — Geografia da Eletromobilidade](https://abve.org.br/abve-data/bi-geografia-da-eletromobilidade/)
- [Carregados — Vinhedo](https://carregados.com.br/estacoes?cidade=vinhedo&estado=s%C3%A3o+paulo+%28sp%29)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) (© colaboradores, licença ODbL), [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) e [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- As fichas dos pilotos trazem seus próprios links para Prefeitura, estabelecimento e diretórios.

O servidor serializa chamadas Nominatim com intervalo mínimo de 1,1 segundo e cacheia as consultas. Os serviços públicos têm limites próprios. Para operação com tráfego real, migre as consultas para instâncias contratadas/autogeridas, monitore carga, armazene resultados em banco com política de atualização e obtenha um feed municipal da ABVE com permissão e método de integração definidos. Não use a infraestrutura pública do OSM como backend irrestrito de produção.

## Próximos passos

1. Validar entrada, vagas e recarga dos locais pesquisados em Vinhedo e Poços.
2. Integrar emplacamentos municipais ABVE de forma auditável e datada, com BEV/PHEV e período consistentes.
3. Conferir cobertura do OSM e construir inventário operacional de conectores.
4. Somar dados de permanência observada, capacidade elétrica e cenário comercial antes de recomendar instalação.

O projeto é independente e não representa índice oficial da ABVE.
