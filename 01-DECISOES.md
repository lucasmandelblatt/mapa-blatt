# 01-DECISOES: o que o Lucas decidiu no Sistema Blatt

Registro retroativo (16/11/2026) das decisões de produto e de arquitetura do Sistema Blatt. **Aprovado pelo Lucas em 16/11/2026; D-017 foi acrescentada no mesmo dia e ainda não passou pela revisão dele.** Mudança nova entra primeiro aqui, com fala e data, e depois na `00-BIBLIA`.

**Como ler.** Datas e horas em horário de Brasília. A fala literal é do Lucas, copiada das conversas com o Claude Code em que o sistema foi construído; a leitura e o efeito são interpretação explícita de quem documentou. Estados: Confirmada · Parcial · Revertida · Pendente. Nesta versão pública, o nome do sócio nas falas aparece como [sócio].

**Etiquetas** (as mesmas nos três arquivos): `[D-001]` decisão do Lucas · `[H-01]` hipótese em aberto · `[proposta]` sugestão da IA ainda não validada (ou aceita só pelo uso) · `[levantado: data]` fato conferido no código ou em arquivo · `[relatado: fonte]` fato vindo de um registro, não reconferido.

## 1. Decisões

### D-001 · 11/10 17:19 · Trazer o Mapa da Blatt para o Claude Code
**Origem [levantado: 16/11/2026, `Mapa da Blatt.md`]:** o sistema nasceu como um artefato no claude.ai, um "mapa neutro do que a Blatt precisa para funcionar", com 8 áreas, donos e status.
**Fala:** "Dessa maneira você consegue ver?" (enviando o arquivo do mapa) e, logo depois, "Sim, faça isso."
**Leitura:** o Lucas levou o mapa estático para o Claude Code, onde ele virou um sistema que se edita e se salva.
**Estado:** Confirmada.

### D-002 · 11/10 23:46 · Sistema solar em vez de mapa
**Fala:** "Eu quero que você remova o mapa que está escrito "mapa" ali no canto superior esquerdo, ao lado do logo da Blatt. Você pode tirar o mapa e escrever "sistema" para a gente simular o sistema solar. [...] eu gostaria também é que você substituísse essa estética cartográfica por uma que se assemelhe ao ESPAÇO, simulando mais ainda o Sistema Solar. Você conseguiria fazer isso sem que fique óbvio que seja uma representação do espaço [...] com um design bacana?"
**Efeito:** a marca é o sol, as áreas são planetas e os tópicos são estrelas; aba "Sistema"; mapa 3D com Three.js e 3d-force-graph (`src/main.js`).
**Ajuste (11/10 23:57):** "Ficou muito bom, muito bom mesmo, parabéns. [...] o Sol, que é o centro do nosso sistema, o logo Blatt, está muito borrado. Consegue trazer uma definição maior para ele". O logo do centro passou a ser desenhado a partir do SVG.
**Estado:** Confirmada.

### D-003 · 12/10 00:05 · Painel em meia tela, com tela cheia
**Fala:** "Quando eu clico num planeta, eu vou clicar numa estrela, por exemplo, e ele aparece no visor ali, ocupando metade da tela. Eu quero que continue dessa maneira, mas que você coloque um botão ali em que seja possível expandir para a tela inteira."
**Estado:** Confirmada.

### D-004 · 12/10 00:12–00:15 · Uso pelos dois sócios, no Mac e no Windows
**Fala:** "Eu preciso que isso seja liberado para o [sócio] poder usar também." / "O [sócio] usa Windows. Ele vai ter problema em acessar isso ou não? Preciso que isso seja algo em que possa ser utilizado em ambos windows e mac"
**Efeito:** servidor em Node sem dependências (`server.mjs`), atalhos de abrir com dois cliques para Mac (`.command`) e Windows (`.bat`), dono de cada bloco (um sócio, o outro ou os dois).
**Estado:** Confirmada. O funcionamento no Windows não foi testado nesta documentação (H-02).

### D-005 · 12/10 00:22–00:23 · Dados no Google Drive
**Fala:** "Quando a gente passar isso para o Google Drive, eu posso depois alterar o e-mail de destino [...]?" / "Instalei o Google Drive, pode configurar"
**Estado:** **Revertida em D-010.**

### D-006 · 17/10 16:51 · Aba de tarefas do dia
**Fala:** "No menu inicial, ao lado da aba "Quadro", crie mais uma aba sobre tarefas que seja da mesma estética do sistema como está agora: tarefas diárias para eu digitar e ter esse mapeamento das tarefas que eu tenho que fazer no dia da minha empresa."
**Efeito:** tarefas do dia em `dados/dias/AAAA-MM-DD.json`; hoje elas aparecem no painel do dia do Controle (commit "Um só calendário: datas completas e painel do dia no Controle", 28/10).
**Estado:** Confirmada, com mudança de lugar na interface.

### D-007 · 17/10 16:57 e 25/10 20:53 · Navegador normal, não artefato
**Fala:** "Não se preocupe com artefato. Quero só o navegador normal." / "Não quero artefato. Quero visualizar o sistema correto, editável e atualizado."
**Leitura:** o artefato do Claude só mostra; o Lucas queria editar e salvar. O sistema passou a rodar como servidor próprio, aberto no navegador.
**Efeito:** `server.mjs` em `http://localhost:4747`. A cópia só de leitura continua possível pelo `scripts/artefato.mjs`, e é dela que sai a demonstração pública (D-016).
**Estado:** Confirmada.

### D-008 · 18/10 19:37 · Salvar o sistema inteiro
**Fala:** "Eu fiz o teste aqui e não salvou. Quero que você crie um botão de salvar para não ter esse tipo de problema. Não é salvar só na área aqui de formalização da empresa, por exemplo, mas salvar no sistema inteiro."
**Efeito:** salvamento automático (textos menos de um segundo depois de parar de digitar), botão Salvar e ⌘S/Ctrl+S para o sistema inteiro, aviso Salvando, Salvo ou Não salvou, e aviso do navegador ao fechar com algo pendente [levantado: 16/11/2026, `LEIA-ME.md`].
**Estado:** Confirmada.

### D-009 · 22/10 14:26 · Anexos em cada subprocesso, integrados ao Quadro
**Fala:** "Ao selecionar um subprocesso na aba controle, gostaria que vc criasse uma seção para upload de fotos e/ou link. E ao adicionar esses documentos, ele automaticamente apareceria no card do trello do mesmo subprocesso. As abas do sistema estão sempre integradas." / (15:29) "Testei e funcionou."
**Efeito:** anexos (fotos, arquivos e links) por tarefa, que aparecem também no card do Quadro e nas abas do painel do bloco.
**Estado:** Confirmada.

### D-010 · 26/10 22:05–22:20 · Código e dados no GitHub; o Drive sai
**Fala:** "Quero adicionar esse projeto no GitHub." / "Pode criar o repositório privado mapa-blatt só com o código." / "ignore o drive daqui pra frente. Seu objetivo agora é armazenar todos os dados e quaisquer atualizações futuras no repositório do github. Não confunda drive com github."
**Efeito:** repositório `mapa-blatt`; dados em `dados/` dentro do repositório (commit de 26/10 22:22).
**Estado:** Confirmada. Reverte D-005.

### D-011 · 26/10 22:27–22:28 · Supabase como banco; GitHub para o código e o backup
**Fala:** "Agora quero implementar um banco de dados gratuito para armazenar os dados, imagens, edições do meu sistema blatt. O que vc me recomenda" / "Pode implementar o Supabase como banco de dados do Sistema Blatt, mantendo o GitHub para o código e o backup diário."
**Leitura:** o Supabase foi a recomendação da IA `[proposta]`, aceita pelo Lucas na fala seguinte.
**Efeito:** `supabase.mjs` (banco, Storage e tempo real, sem dependências); tabelas `nos`, `dias` e `lixeira`; Storage `anexos`; backup diário por GitHub Action (`.github/workflows/backup.yml`, 3h de Brasília).
**Estado:** Confirmada.

### D-012 · 26/10 23:24 · Sistema hospedado na Vercel
**Fala:** "Depois que eu fiz o deploy na vercel, já com o banco de dados cadastrado, tudo que eu fiz de teste como edição, tentei fazer upload de imagens, atualizar e editar informações não dava certo. [...] Como faço para utilizar esse sistema sem dar erro, e que eu consiga utilizar normalmente alimentando com mais dados, fazendo edições e salvando normal?"
**Efeito:** na Vercel o servidor detecta que não há disco gravável e usa só o Supabase; senha compartilhada obrigatória (`BLATT_SENHA`), cookie de 180 dias; envio direto de arquivos (commit "Vercel: senha de acesso, Supabase pelas variáveis e envio direto de arquivos", 26/10 23:27).
**Estado:** Confirmada. A senha não tem fala literal registrada (C-05).

### D-013 · 28/10 12:44 · Datas reais e calendário clicável
**Fala:** "Quando eu escrevo "2026" o sistema entrega como "0002", ele não dá tempo de escrever o ano corretamente. E da maneira que o sistema lê esse ano errado, aparece como já entregue. Seu objetivo é inspecionar essa questão e corrigir esse problema com o ano. Conecte um calendário real e automático." E: "Quero na aba "controle", que quando eu esteja no calendário, cada quadrado que pertence a um dia seja editável e clicável. [...] Quero que ao selecionar a data no calendário como meta para alguma tarefa, isso esteja automaticamente integrado com a data de entrega que aparece quando eu estou na aba "sistema"".
**Efeito:** commit "Um só calendário: datas completas e painel do dia no Controle" (28/10 12:56).
**Estado:** Confirmada.

### D-014 · 28/10 13:05 · Prazo futuro não é "Entregue"
**Fala:** "Quando vc adiciona 18/11/2026 aparece já como "entregue". Remova isso. Como foi entregue se estamos em 28/10/2026?"
**Efeito:** commit "Prazo futuro não aparece como "Entregue"" (28/10 13:06).
**Estado:** Confirmada.

### D-015 · 16/11 14:04–14:07 · Repositório público, instalável, com os dados atuais
**Fala:** "quero tornar o meu repositorio "mapa-blatt" público." / "Preciso que ele seja um repositório que o recrutador possa consultar e instalar perfeitamente na máquina dele se ele quiser. Mantenha os dados atuais lá, permitindo com que eles sejam editáveis, obviamente. Igual eu utilizo, deve ser possível qualquer um instalar e utilizar pelo github."
**Efeito:** README, licença MIT e sincronização com o GitHub opcional (commit de 16/11 14:12). Quem clonava começava no modo Arquivos, com os dados da Blatt.
**Estado:** **Revertida em D-017** (o repositório público passou a vir em branco).

### D-016 · 16/11 · Demonstração pública sem senha, com dados fictícios
**Fala:** "Como que o recrutador vai avaliar a qualidade da ferramenta se ele ver ela em branco?" / "dados fictícios. Porém tem uma questão importante: Como o recrutador vai avaliar o mapa da blatt se ele exige senha ao entrar?" / "Demo sem senha" / (depois de ver) "ficou ótima essa demo."
**Leitura:** o recrutador não instala nada nem tem a senha da Vercel. A demonstração resolve isso sem expor o sistema real.
**Efeito:** `npm run demo` gera `docs/demo/index.html` a partir de `demo/dados/` (41 blocos fictícios, mesma estrutura); a página é só de leitura e fica no GitHub Pages; link no topo do README e no campo Website do repositório.
**Estado:** Confirmada.

### D-017 · 16/11 · Repositório público recriado em branco; dados reais só em repositório privado
**Origem [levantado: 16/11/2026]:** o repositório público trazia os dados reais em `dados/`, incluindo documentos internos anexados, e o backup diário gravava ali todo dia o que fosse anexado.
**Fala:** "pode fazer os quatro passos, recria o repositório (em branco). Todas as funcionalidades, porém o conteúdo deve vir limpo para quem baixa, absolutamente nada preenchido e nome dos sócios a decidir." / "O que deve ser preservado: Tudo que não contém informações da empresa. Tudo que pode ser considerado genérico e replicavel para qualquer negócio." / "A demo no github deve conter nomes de outros sócios e dados fictícios, mantendo as mesmas areas da empresa."
**Leitura:** os quatro passos eram: parar o backup público, fazer a instalação vir sem os dados reais, apagar o histórico exposto e ajustar o README. Em vez de apagar o repositório antigo, ele virou privado e mudou de nome `[proposta]`: guarda o histórico e o backup, segue ligado à hospedagem e sai do ar público.
**Efeito:** repositório público novo, com um único commit, sem histórico. `dados/` traz só `dados/nos/root.json` ("Sua empresa", sem sócios) e está no `.gitignore`. Os nomes dos sócios ficam no campo `socios` do bloco raiz e se mudam no painel da empresa (`socio`, `nomeDe` e `owners` em `src/main.js`; `socios` em `ALLOWED`); os donos passam a ser `s1`, `s2` e `ambos`. O sol mostra o nome da empresa (`sunSVG`). Exemplos de texto ficaram genéricos. O backup só roda em repositório privado (`if` no job de `backup.yml`). A demonstração ganhou sócios fictícios (Marina e Rafael), com as mesmas 8 áreas.
**Estado:** Confirmada.

## 2. Confirmações de 16/11/2026 (decisões antes sem fala literal)
Estes itens já existiam no código, mas sem a fala literal da decisão. O Lucas respondeu em 16/11/2026, por escrito. São confirmações de hoje sobre escolhas passadas, não falas da época. A fala está copiada como ele escreveu; só foram corrigidos erros de digitação que não mudam o sentido.

### C-01 · Servidor em Node sem dependências
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Foi pela facilidade de instalação, para que o meu sócio consiga usar o software comigo."
**Estado:** Confirmada. Liga-se a D-004.

### C-02 · Lixeira: nada é apagado de vez
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Sim. Caso algum item seja deletado sem querer, ou arrependimento, ou um dos sócios precise consultar aquele arquivo que foi deletado, o sistema oferece uma segurança que permite recuperar aquele arquivo, podendo ser encontrado na lixeira, evitando possíveis problemas mais sérios."
**Estado:** Confirmada.

### C-03 · Tempo real entre os sócios
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Sim. Caso os dois estejam usando ao mesmo tempo o software, é importante que o sistema esteja atualizado em tempo real, para evitar falhas e bugs. O objetivo é ser uma ferramenta com utilização compartilhada. Para isso, deve ser atualizada a cada edição, em tempo real."
**Estado:** Confirmada.

### C-04 · As cinco colunas do Quadro
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Essa divisão veio do meu dia a dia de trabalho, no qual utilizamos o Trello e o título dos cards é dessa forma (Ideia, A fazer, Em andamento, Em aprovação, Feito). Esse formato, para o mercado de moda e varejo, funciona muito bem, pela experiência que tive no meu trabalho. Como a Blatt é uma marca de roupa, os títulos escolhidos foram esses. Mas, para cada business, o título é editável e configurado de acordo com a preferência do usuário."
**Divergência com o código:** as cinco colunas são fixas no código (`STATUS` em `src/main.js`); a interface não permite renomeá-las [levantado: 16/11/2026]. Mudar os títulos hoje exige editar o código.
**Correção (16/11/2026, reescrita pelo Lucas a partir de sugestão do Claude, depois de conferir o código):** "As colunas vieram do Trello que uso no meu trabalho, e funcionam bem para moda e varejo. Hoje elas são fixas; deixar o título editável para cada negócio é um objetivo para uma próxima versão."
**Estado:** Confirmada: colunas fixas, vindas do Trello do trabalho do Lucas. Títulos editáveis são objetivo futuro (P-05).

### C-05 · Senha única compartilhada
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Eu decidi. Para segurança e controle. Dois sócios compartilham a mesma senha."
**Estado:** Confirmada. Liga-se a D-012.

### C-06 · Backup diário às 3h
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Não sei dizer, não tenho lembranças sobre configurações do backup."
**Estado:** Encerrada sem decisão. O backup foi pedido em D-011; o horário é `[proposta]` aceita pelo uso.

### C-07 · Responsáveis e usuários
**Fala (resposta escrita do Lucas ao Claude Code, 16/11/2026):** "Outros usuários podem se cadastrar. É um sistema feito para uma equipe inteira de uma área ou empresa. No que eu criei existe somente "[nossos dois nomes]" pois somos só nós dois. Caso tivéssemos um terceiro sócio, ele seria incluído no software, tendo as mesmas permissões que nós dois. A plataforma permite convite de usuários apenas para visualização, mas também para edição, que seria o caso de um terceiro sócio entrando."
**Divergência com o código [levantado: 16/11/2026]:** não há cadastro de usuários, convite nem permissão de só visualização. Os responsáveis eram fixos no código; desde D-017 são dois sócios com nomes definidos no painel da empresa. O acesso é uma senha única para todos (C-05). A única versão só de visualização é a demonstração pública, com dados fictícios (D-016). Incluir um terceiro sócio hoje exige editar o código.
**Correção (16/11/2026, reescrita pelo Lucas a partir de sugestão do Claude, depois de conferir o código):** "Hoje o sistema é para nós dois: os responsáveis estão fixos e o acesso é por uma senha compartilhada. Incluir um terceiro sócio exige mudar o código. Cadastro de usuários e convite com permissão só de leitura ou de edição são objetivos para uma próxima versão, para o sistema servir a uma equipe inteira."
**Estado:** Confirmada: dois sócios (nomes configuráveis desde D-017) e senha compartilhada. Cadastro e convites com permissão são objetivo futuro (P-06).

## 3. Reversões
| Decisão original | Revertida por | Quando |
|---|---|---|
| Mapa com estética cartográfica | D-002 sistema solar | 11/10 |
| Ver o sistema como artefato do Claude | D-007 navegador normal | 17/10 e 25/10 |
| D-005 dados no Google Drive | D-010 dados no GitHub | 26/10 |
| D-010 dados como arquivos no GitHub | D-011 Supabase como banco; o GitHub fica com o backup | 26/10 |
| D-015 repositório público com os dados reais | D-017 repositório público em branco; dados reais só no privado | 16/11 |

## 4. Hipóteses abertas
| ID | Hipótese | Como e quando confirmar |
|---|---|---|
| H-01 | Os dois sócios usam o sistema no dia a dia | Contar os commits "Backup diário" com mudanças no repositório privado: o último era de 29/10 |
| H-02 | O sistema funciona igual no Windows | Abrir pelo `.bat` num Windows e repetir os testes de aceite da `00-BIBLIA` |
| H-03 | O plano gratuito do Supabase basta para o volume da Blatt | Acompanhar o uso de banco e de Storage no painel do Supabase uma vez por mês |
| H-04 | A demonstração basta para um recrutador avaliar o sistema | Pedir a 2 pessoas de fora que abram a demo e digam o que entenderam |

## 5. Aprendizados (com evidência)
- **L-01.** Um artefato do Claude é ótimo para ver, mas não para usar: não salva edições nem se compartilha com quem usa outro computador. Por isso o sistema virou um servidor próprio (D-007). [levantado: 16/11/2026, falas de 12/10 00:10 e 25/10 20:53]
- **L-02.** Testar com o uso real acha o que o teste da IA não acha: o ano digitado virava "0002" e um prazo futuro aparecia como entregue (D-013, D-014).
- **L-03.** Hospedagem sem disco gravável muda a arquitetura: na Vercel o sistema não consegue salvar em arquivo e precisa do banco. [levantado: 16/11/2026, `server.mjs` (`NUVEM`)]
- **L-04.** O Storage do Supabase não aceita acentos e alguns símbolos em nome de arquivo; o nome original fica nos dados e o arquivo é guardado por um código. [levantado: 16/11/2026, `supabase.mjs` (`anexoKey`)]
- **L-05.** Um sistema interno pode ser mostrado sem expor a empresa: a mesma interface, em modo só leitura e com dados fictícios, vira uma demonstração pública (D-016).
