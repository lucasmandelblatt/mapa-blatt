# Sistema Blatt

Um segundo cérebro para uma empresa de dois sócios: todas as áreas da empresa num mapa 3D. Cada bloco guarda notas, tarefas, fotos, arquivos e links.

## Abrir

Funciona igual no Mac e no Windows. Só precisa do **Node.js** instalado uma vez (gratuito, versão LTS em https://nodejs.org).

- **Mac:** dois cliques em **Abrir Sistema Blatt (Mac).command**. Na primeira vez, se o macOS bloquear: botão direito no arquivo, **Abrir**, confirmar.
- **Windows:** dois cliques em **Abrir Sistema Blatt (Windows).bat**. Na primeira vez, se aparecer o aviso azul do Windows: **Mais informações**, depois **Executar assim mesmo**.

O sistema abre no navegador em `http://localhost:4747`. Deixe a janela preta (Terminal ou Prompt) aberta enquanto usa: fechar ela desliga o sistema.

## Primeiro uso

O sistema abre em branco: só o sol, com o nome "Sua empresa".

1. **Clique no sol.** No painel, troque o título pelo nome da sua empresa e escreva o nome dos dois sócios no campo **Sócios**. Os nomes passam a aparecer em todo o sistema (responsáveis, filtros, iniciais no mapa).
2. **Crie as áreas:** botão direito no fundo do mapa, ou "Novo planeta" na legenda. Cada área é um planeta.
3. **Crie os tópicos de cada área:** botão direito num planeta, "Nova estrela".

Para ver o sistema preenchido antes de começar, abra a [demonstração com dados fictícios](https://lucasmandelblatt.github.io/mapa-blatt/demo/).

## Usar

O mapa funciona como um sistema solar: a **empresa** é o sol, as **áreas** são planetas e os **tópicos** de cada área são estrelas em volta deles.

- **Mapa**: arraste o fundo para girar, role para aproximar.
  - **Arraste um planeta** para mudar o lugar dele. As estrelas vão junto.
  - **Arraste uma estrela** para reposicionar. Solte perto de outro planeta e ela passa a orbitar ele.
  - **Botão direito** num corpo: abrir, criar estrela, renomear, mudar a cor do planeta, mover para outro planeta, voltar para a órbita padrão, apagar.
  - **Botão direito no fundo** ou "Novo planeta" na legenda: cria uma área nova.
- **Quadro**: cada estrela vira um card em cinco colunas (Ideia, A fazer, Em andamento, Em aprovação, Feito). Arraste entre colunas; "Novo card" no pé de cada coluna. Filtre por planeta no topo.
- **Controle**: o checklist de cada bloco. Busque à esquerda (atalho `/`) por nome do bloco, planeta ou tarefa, ou filtre por pendências, urgentes ou por sócio. Escolha um bloco e destrinche em tarefas menores: digite e dê Enter, marque como feita, arraste pela alça para reordenar. Cada tarefa abre com observação, destaque (normal, atenção, urgente), responsável, prazo e **Anexos**: fotos, arquivos e links (também dá para arrastar arquivos ou colar uma imagem com a tarefa aberta). Os anexos ficam no bloco, então aparecem também no card do Quadro e nas abas Fotos, Arquivos e Links do painel, com o nome da tarefa de origem. O anel mostra o progresso; quando tudo estiver feito, dá para mover o bloco para Feito no quadro. É o mesmo checklist da aba "Checklist" dentro do bloco.
  - **Prazos**: no topo do bloco fica a **entrega final** do processo; cada tarefa (subprocesso) tem o próprio prazo, que também pode ser escolhido já ao criar (botão "Prazo"). Passou do prazo sem estar feito, a tarefa fica vermelha com "Em atraso" automaticamente; prazo marcado para depois da entrega final ganha o aviso "Após a entrega". A **linha do tempo** mostra hoje, cada subprocesso e a entrega final na mesma régua, e diz se o processo está no ritmo. "Ordem manual" alterna para ordenar por prazo.
  - **Calendário**: o botão "Calendário" no topo do Controle mostra, mês a mês, as entregas finais e os prazos de todos os blocos (ou só do bloco aberto), com os atrasos em vermelho e a lista do que está atrasado no fim. Clicar num prazo abre a tarefa. Ele se atualiza sozinho quando uma data muda.
- **Índice**: todas as áreas e estrelas em lista, com prazo e custo.
- **Buscar** (`⌘K` ou `/`) e **Filtrar** (dono e etapa).
- **Painel de cada corpo**:
  - **Resumo** no topo: prazo, custo, etapas feitas e prioridade. Em planetas e no sol, os números somam tudo o que está dentro.
  - **Plano**: objetivo, estratégia, horizonte, prioridade, datas de início e entrega, custo previsto e gasto, e como saber que deu certo.
  - **Etapas**: o plano de ação. Cada etapa tem prazo, custo e dono (botão de ajustes ao lado).
  - **Notas**, **Fotos**, **Arquivos** e **Links**, como antes.

## Salvar

Tudo salva sozinho: textos menos de um segundo depois de você parar de digitar, cliques na hora. Ao lado do logo, em todas as abas, fica o aviso: **Salvando**, **Salvo** (verde), depois um ✓ discreto; **Não salvou** (vermelho) se algo falhar.

O botão **Salvar** (ou **⌘S** no Mac, **Ctrl+S** no Windows) vale para o sistema inteiro: grava tudo o que estiver pendente em qualquer aba, tenta de novo o que falhou e confere no arquivo que ficou salvo. Se aparecer "Não salvou", quase sempre a janela do Terminal que mantém o sistema ligado foi fechada: abra de novo pelo atalho e clique em **Tentar de novo**. Se tentar fechar a aba do navegador com algo ainda não salvo, o navegador avisa antes.

## Onde ficam os dados

Sem configuração nenhuma, tudo fica na pasta `dados/`, só neste computador: um JSON por bloco em `dados/nos/`, tarefas do dia em `dados/dias/`, fotos e arquivos em `dados/anexos/` e o que for apagado em `dados/lixeira/`. Essa pasta não vai para o GitHub (está no `.gitignore`).

Para os dois sócios usarem juntos, cada um no seu computador, conecte o **Supabase**, um banco de dados na nuvem (plano gratuito):

- tabela `nos`: um registro por bloco;
- tabela `dias`: tarefas do dia;
- tabela `lixeira`: o que for apagado vai para cá, nada some de verdade;
- Storage `anexos`: fotos e arquivos de cada bloco (os apagados vão para a pasta `lixeira/`).

As edições de um aparecem na tela do outro na hora. Ao lado do logo, o ícone de banco de dados mostra o estado: ponto verde (conectado, com tempo real), amarelo (reconectando).

**Backup diário (opcional):** o workflow `.github/workflows/backup.yml` copia o banco e os anexos para `dados/` todo dia às 3h (Brasília), com histórico. Ele só roda em **repositório privado**: num repositório público, os dados da empresa ficariam abertos na internet. Para usar, crie um repositório privado com o seu código e cadastre os segredos `SUPABASE_URL` e `SUPABASE_CHAVE` em Settings › Secrets and variables › Actions. Também dá para rodar na hora pela aba Actions (Backup diário, Run workflow).

**Conectar o banco (uma vez por computador):** com o sistema aberto, acesse http://localhost:4747/conectar (ou clique no ícone ao lado do logo) e siga os três passos. O endereço e a chave ficam só em `config.json`, neste computador, e nunca vão para o GitHub. Enquanto o banco não estiver conectado, o sistema guarda os dados em `dados/`, só neste computador. Para cada mudança virar um commit no GitHub, coloque `"github": true` no `config.json`, tire `dados/` do `.gitignore` e use um repositório **privado**.

## Usar com o seu sócio

Cada um usa uma cópia do sistema no próprio computador, conectada ao mesmo projeto do Supabase.

Cada um precisa:
1. do **Node.js** (https://nodejs.org) e do **Git** (https://git-scm.com) instalados;
2. de baixar o sistema uma vez (`git clone` do repositório de vocês, de preferência privado);
3. de conectar o banco em http://localhost:4747/conectar, com o mesmo endereço e a mesma chave.

Depois é só abrir pelo atalho do seu sistema operacional.

## Para quem for mexer no código


- `server.mjs`: servidor local em Node, sem dependências. Lê e grava no Supabase.
- `supabase.mjs`: cliente do Supabase (banco, arquivos e tempo real) e o SQL da estrutura.
- `scripts/backup.mjs` e `.github/workflows/backup.yml`: backup diário no GitHub (só em repositório privado).
- `src/main.js`: interface (Three.js + 3d-force-graph). Depois de editar, rode `npm run build`.
- `public/`: HTML, CSS, fontes, ícones e o `app.js` gerado.
