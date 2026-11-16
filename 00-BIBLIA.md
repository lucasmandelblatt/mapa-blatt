# 00-BIBLIA: o que o Sistema Blatt é (fonte única)

Versão: 16/11/2026. Descreve o estado vigente deste repositório. Regra: se o código muda, muda primeiro o `01-DECISOES` e depois este arquivo, nas seções afetadas. Etiquetas: `[D-xxx]`, `[H-xx]`, `[proposta]`, `[levantado: data]`, `[relatado: fonte]` (ver `01-DECISOES.md`). **Aprovado pelo Lucas em 16/11/2026; atualizado no mesmo dia com D-017, ainda sem a revisão dele.**

As referências apontam para arquivos e nomes no código, não para números de linha, que mudam a cada edição.

## 01. Propósito e escopo

**Propósito.** O segundo cérebro da Blatt, marca de roupas de dois sócios: todas as áreas da empresa num só lugar, com plano, tarefas, prazos, responsáveis, notas e anexos, para trabalhar sabendo o que fazer, sem agir de forma reativa. Esta versão pública vem em branco e serve a qualquer empresa de dois sócios. [D-001] [D-017]

**Escopo.** Dois usuários (os sócios), um em Mac e outro em Windows, usando o mesmo sistema ao mesmo tempo. [D-004] Fora do escopo hoje: cadastro de usuários e permissões por pessoa (objetivo futuro, P-06), aplicativo de celular, integração com loja ou financeiro.

**Princípios (invariantes).**
1. Tudo salva sozinho, e o sistema avisa quando algo não salvou. [D-008]
2. Nada é apagado de vez: o que sai vai para a lixeira. [C-02] [levantado: 16/11/2026, `server.mjs`]
3. As abas são vistas diferentes dos mesmos dados: um anexo ou um prazo aparece em todas. [D-009] [D-013]
4. O código mora no GitHub; o uso diário mora no Supabase; o backup, só num repositório privado. [D-010] [D-011] [D-017]
5. Para mostrar o sistema a quem é de fora, usa-se a demonstração com dados fictícios. [D-016]

## 02. Usuários e experiência

**Usuários.** Dois sócios, com os nomes escritos no painel da empresa (campo Sócios, guardado em `socios` no bloco raiz); sem nome, aparecem como Sócio 1 e Sócio 2. Cada bloco e cada tarefa pode ter dono: um sócio, o outro, os dois ou ninguém. [D-004] [C-07] [D-017]

**Abas** [levantado: 16/11/2026, `src/main.js`, `LEIA-ME.md`]:
- **Sistema:** mapa 3D. A marca é o sol, as áreas são planetas e os tópicos são estrelas. Arrastar gira o mapa; arrastar um planeta leva as estrelas junto; soltar uma estrela perto de outro planeta muda a órbita dela. O botão direito cria, renomeia, colore, move e apaga. [D-002]
- **Quadro:** cada estrela vira um card num quadro de cinco colunas fixas (Ideia, A fazer, Em andamento, Em aprovação, Feito), vindas do Trello que o Lucas usa no trabalho, com filtro por área. [C-04]
- **Controle:** o checklist de cada bloco, com responsável, prazo, destaque (normal, atenção, urgente), observação e anexos por tarefa. Mostra atrasos, uma linha do tempo até a entrega final e um calendário mensal clicável com todos os prazos. [D-009] [D-013] [D-014]
- **Índice:** todas as áreas e tópicos em lista, com prazo e custo.
- **Painel de cada bloco:** abre em meia tela, com botão de tela cheia [D-003]; resumo, plano (objetivo, estratégia, horizonte, prioridade, datas, custos), etapas, notas, fotos, arquivos e links.
- **Busca** (`⌘K` ou `/`) e filtros por dono e etapa.

**Salvamento.** Automático, com o aviso Salvando, Salvo ou Não salvou ao lado do logo; botão Salvar e ⌘S/Ctrl+S gravam tudo o que estiver pendente. [D-008]

**Evolução.** 11/10 artefato com mapa estático → sistema editável no Claude Code, com estética de sistema solar [D-001] [D-002]; 12/10 painel com tela cheia e uso pelos dois sócios [D-003] [D-004]; 17–18/10 tarefas do dia e salvamento do sistema inteiro [D-006] [D-008]; 22/10 anexos integrados [D-009]; 26/10 GitHub, Supabase e Vercel [D-010] [D-011] [D-012]; 28/10 calendário real [D-013] [D-014]; 16/11 repositório público e demonstração [D-015] [D-016], depois recriado em branco [D-017].

## 03. Arquitetura e regras

### 3.1 Visão geral [levantado: 16/11/2026]
```text
Navegador (Mac ou Windows) -> server.mjs (Node, sem dependências)
                                  |
              +-------------------+--------------------+
              |                                        |
      modo Arquivos (padrão)                    modo Supabase
      dados/ no disco                           banco Postgres + Storage + tempo real
      (opcional: cada mudança vira commit)      (uso diário dos sócios; obrigatório na Vercel)
                                                       |
                                     GitHub Action, todo dia às 3h -> dados/ (só em repositório privado)

Demonstração: scripts/artefato.mjs -> docs/demo/index.html (só leitura, dados fictícios) -> GitHub Pages
```

### 3.2 Componentes
| Arquivo | Papel |
|---|---|
| `server.mjs` | Servidor HTTP: interface, API dos blocos, dias e anexos, eventos ao vivo, senha, conexão com o Supabase |
| `supabase.mjs` | Cliente mínimo do Supabase, sem dependências: banco (REST), Storage e tempo real |
| `src/main.js` | Interface inteira (mapa 3D, Quadro, Controle, Índice, painel); compilada com esbuild em `public/app.js` |
| `public/index.html`, `public/style.css` | Estrutura e visual da página |
| `scripts/backup.mjs` | Copia o banco e os anexos do Supabase para `dados/` |
| `.github/workflows/backup.yml` | Roda o backup todo dia às 3h (Brasília) e grava no repositório; o job é pulado em repositório público |
| `dados/nos/root.json` | O bloco da empresa em branco, ponto de partida de quem instala |
| `scripts/artefato.mjs` | Gera a cópia só de leitura em um HTML único; com `npm run demo`, a demonstração pública |
| `demo/dados/` | 41 blocos fictícios da demonstração, com as mesmas 8 áreas e sócios fictícios (Marina e Rafael) |
| `Abrir Sistema Blatt (Mac).command`, `(Windows).bat` | Abrem o sistema com dois cliques |

### 3.3 Fluxos [levantado: 16/11/2026, `server.mjs`]
- **Ler e editar.** O navegador lê e grava pela API (`/api/...`: blocos, `dias`, anexos, `sync`, `info`). Só os campos de uma lista fixa podem ser gravados num bloco (`ALLOWED`), e o id de um bloco segue um formato fixo (`ID_RE`).
- **Tempo real.** `/api/eventos` (Server-Sent Events) avisa os navegadores abertos quando algo muda. Na Vercel, onde conexões longas custam caro, o navegador volta a perguntar a cada 20 s. [C-03]
- **Anexos.** Até 80 MB por arquivo (`MAX_UPLOAD`). Nomes são limpos (`safeName`). No Supabase, o arquivo é guardado por um código, porque o Storage não aceita acentos (`anexoKey`). [L-04]
- **Apagar.** No modo Arquivos, o bloco vai para `dados/lixeira/`; no Supabase, para a tabela `lixeira` e a pasta `lixeira/` do Storage. [C-02]
- **Backup.** O Action roda `scripts/backup.mjs` e faz commit só se algo mudou. [D-011] [C-06]

### 3.4 Dados e onde moram
| Dado | Modo Arquivos | Modo Supabase |
|---|---|---|
| Blocos (áreas e tópicos) | `dados/nos/<id>.json` | tabela `nos` |
| Tarefas do dia | `dados/dias/AAAA-MM-DD.json` | tabela `dias` |
| Anexos | `dados/anexos/<bloco>/` | Storage `anexos` |
| Lixeira | `dados/lixeira/` | tabela `lixeira` e pasta `lixeira/` |
| Endereço e chave do Supabase, senha | `config.json` (fora do git) ou variáveis de ambiente | segredos do GitHub e variáveis da Vercel |

### 3.5 Hospedagens
| Onde | Para quê | Acesso |
|---|---|---|
| Computador de cada sócio (`npm start`) | Uso local, modo Arquivos ou Supabase | `http://localhost:4747` |
| Vercel | Uso diário dos sócios pela internet | Senha compartilhada [D-012] [C-05] |
| GitHub Pages | Demonstração pública | Sem senha, só leitura, dados fictícios [D-016] |

### 3.6 Segurança e privacidade [levantado: 16/11/2026, `server.mjs`]
- Na Vercel, nada é lido nem gravado sem a senha; a sessão fica num cookie `HttpOnly` de 180 dias, e uma senha errada espera 800 ms antes de responder.
- A chave do Supabase e a senha nunca vão para o git: ficam no `config.json` (ignorado) ou nos segredos do GitHub e da Vercel.
- **O repositório público vem em branco:** só `dados/nos/root.json` ("Sua empresa", sem sócios), e `dados/` está no `.gitignore`. Os dados reais ficam no Supabase e no backup de um repositório privado. [D-017]

## 04. Testes e pendências

### 4.1 Testes automáticos
**Não há.** O repositório não tem testes automáticos [levantado: 16/11/2026]. Os erros foram achados pelo uso (D-013, D-014).

### 4.2 Testes de aceite (só se confirmam usando; TA-01, TA-08 e TA-09 foram executados em 16/11/2026)
| ID | Teste | Esperado |
|---|---|---|
| TA-01 | Clonar, `npm start`, abrir `localhost:4747` | Mapa 3D só com o sol "Sua empresa", sem planetas |
| TA-02 | Editar uma nota e recarregar a página | A nota continua lá; o aviso passou por Salvando e Salvo |
| TA-03 | Pôr prazo 18/11/2026 numa tarefa | Data certa, não aparece como entregue antes do dia |
| TA-04 | Anexar uma foto numa tarefa do Controle | A foto aparece também no card do Quadro e no painel do bloco |
| TA-05 | Abrir em dois navegadores e editar num deles | O outro mostra a mudança sozinho |
| TA-06 | Apagar um bloco | Some do mapa e aparece na lixeira |
| TA-07 | Abrir pelo `.bat` num Windows | Igual ao Mac (H-02) |
| TA-08 | Abrir a demonstração | Abre sem senha; nada pode ser editado; 8 áreas e sócios Marina e Rafael |
| TA-09 | Escrever os nomes dos sócios no painel da empresa e recarregar | Os nomes ficam salvos e aparecem nos donos, nos filtros e nas iniciais do mapa |

### 4.3 Pendências
| ID | Item | Estado |
|---|---|---|
| P-01 | Confirmar C-01 a C-07 com as palavras do Lucas | Feito em 16/11/2026; documentos aprovados no mesmo dia |
| P-02 | Criar testes automáticos para datas, salvamento e anexos | Aberto |
| P-03 | O último backup com mudanças era de 29/10: confirmar no repositório privado se o sistema está em uso (H-01) | Aberto |
| P-04 | Testar no Windows (H-02) | Aberto |
| P-05 | Títulos das colunas do Quadro editáveis por negócio (C-04) | Objetivo para a próxima versão |
| P-06 | Cadastro de usuários e convite com permissão de leitura ou edição (C-07) | Objetivo para a próxima versão |

### 4.4 O que esta versão não verificou
Não rodei o sistema real nem a versão da Vercel. As falas vêm de 4 conversas com o Claude Code (11/10 a 16/11); a conversa em que o artefato original foi criado, no claude.ai, não estava disponível. Só a demonstração foi aberta e conferida no navegador. Em 16/11, depois de D-017, a instalação em branco e a demonstração foram abertas no navegador; o sistema real e a Vercel continuam sem verificação aqui.
