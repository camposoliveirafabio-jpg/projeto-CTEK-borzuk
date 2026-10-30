# ⌛ Caçador de Relíquias: O Relógio de Arquimedes

Jogo de **ação e aventura 3D** estilo Indiana Jones, rodando no navegador com **Three.js**. Sem instalação, sem build.

## 📖 História
1969. O **Relógio de Arquimedes** — que leva quem o portar a qualquer lugar no tempo — reaparece, mas o doutor **Jürgen Voller** o toma antes de você e foge com o mostrador. Ele desce para uma fenda na **Amazônia, Brasil** e deixa você soterrado no interior da terra. A única saída é a **Âncora Temporal**, artefato que transporta seu portador a qualquer lugar. Atravesse a selva, a caverna e a câmara do Relógio, vença a **Sentinela do Tempo** e tome a Âncora: é a sua volta para casa... e a última chance de deter Voller.

## ▶ Como jogar
```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## 🎮 Controles
- **WASD / Setas** mover • **Mouse** câmera (click captura o mouse)
- **Espaço** pular • **Shift** correr (gasta fôlego)
- **Clique / F** chicote (SÓ ataca)
- **V** argolas douradas 🌀 (ÚNICO jeito de voar, 6s de recarga)
- **C / Ctrl / ↯** esquiva 🌀 — ou **dois toques** na mesma direção
- **Z** mira travada 🎯 (prende a câmera num inimigo) • **H** giro do chicote 🌀 (área)
- **G** laço 🪢 (30s)
- **E** interagir • **P/Esc** pausa
- 📱 Mobile: joystick + botões ⤒ 🐍 🌀(swing) 🌀(giro) 🪢 ↯ 🏃 E

## 📖 Altar + Livro Ancestral (quiz)
Nas fases **1 e 2** há um **altar de pedra com o livro ancestral** bem na frente da
porta. Ele só destranca quando você tem **todos os fragmentos ⚙️** (e, na Fase 2,
as **2 alavancas**).

Aproxime-se e aperte **E**: o livro abre a tela de **perguntas de prova** e sorteia
uma de cada matéria sorteada, sem repetir matéria nem pergunta.

| | |
|---|---|
| **Matérias** | 🔢 Matemática • 📖 Português • 🔬 Ciências • 🏛 História |
| **Nível** | até o 5º ano |
| **Rodada** | 2 perguntas (uma de cada matéria sorteada) |
| **Para abrir a porta** | acertar **1** |
| **Errou** | −8 de vida e o livro pergunta de novo, com a explicação |

Acertando o necessário, o livro se abre, a **porta de pedra sobe** e o jogo
mostra a prévia da próxima fase. Errando, dá para tentar quantas vezes quiser.

## ⚙ Dificuldade (obrigatória)
**É preciso escolher um nível no menu principal** — o botão "Começar" fica
travado com ⚠ *Escolha uma dificuldade para começar* e treme se você clicar sem
escolher. A escolha é salva, então só é pedida uma vez.

| | 🟢 FÁCIL | 🟡 MÉDIO | 🔴 DIFÍCIL |
|---|---|---|---|
| **Inimigos de cada tipo, por fase** | **2** | **3** | **5** |
| **Armadilhas** | **reduzidas** (metade) | completas | completas |

### As três coisas que a dificuldade muda
1. **Quantidade de inimigos** — cada fase monta 2 / 3 / 5 inimigos **de cada
   tipo** que existir nela (a Fase 1 tem cobra e morcego; a Fase 2, guarda, cobra
   e morcego; a Fase 3, ogro). As **posições são fixas** e escolhidas no level
   design, então o cenário continua igual. **O chefe é sempre 1.**
2. **Armadilhas no fácil** — somem a metade: os dois fossos de espinhos e a
   pedra rolante da Fase 1, o tronco pendular, e na Fase 2 dois totens de lança
   (de 6 → 4), a lâmina do beco e o grupo de espinhos da relíquia do meio. A
   pedrona fica mais lenta e fraca. A ravina de lava e a arena do chefe
   continuam (são o coração da fase).
3. **Números de combate** — todos os multiplicadores entram de uma vez:

| | 🟢 FÁCIL | 🟡 MÉDIO | 🔴 DIFÍCIL |
|---|---|---|---|
| Vida inicial | 300 | 200 | 150 |
| Dano recebido | ×0,5 | ×1 | ×1,6 |
| Inimigos (dano / vel.) | ×0,5 / ×0,78 | ×1 | ×1,6 / ×1,28 |
| Vida da Sentinela | 720 | 900 | 1170 |
| Invulnerabilidade | ×1,7 | ×1 | ×0,65 |
| Chance de drop | ×1,7 | ×1 | ×0,6 |
| Atordoamento / laço | ×1,5 / ×0,8 | ×1 | ×0,65 / ×1,25 |

**🟢 FÁCIL** — para iniciantes que querem apreciar a aventura e ver a história de
Indiana Jones.
**🟡 MÉDIO** — jogo mediano para quem quer um pouco de dificuldade, mas com certo
nível de facilidade.
**🔴 DIFÍCIL** — para quem já está familiarizado com o jogo e quer um nível alto
de dificuldade.

## ✋ Interagir: apertar E
Chegar perto de uma alavanca **mostra a tecla `E` dourada flutuando** (sempre
virada para a câmera, com brilho e uma seta apontando pra baixo) **e uma linha
pulsando no HUD** com `✋ aperte E — puxar a alavanca`. O aviso some assim que a
alavanca é puxada. No celular é o botão `E` do lado direito.

## ⛩️ O ALTAR DO LIVRO ANCESTRAL (Fases 1 e 2 + selo da Fase 3)

No fim de **todas as fases**, assim que você cumpre os requisitos para abrir a
porta, um **altar de pedra emerge do chão**. Nas **Fases 1 e 2** ele traz o
livro ancestral em cima; na **Fase 3** é o altar do selo do Cálice. A pedra sobe
com um baque, faíscas e o runa acendendo em dourado. Chegue perto e aperte
**E**: nas Fases 1 e 2 o livro destranca e faz **no máximo 2 perguntas**; na
Fase 3 o selo **se rompe na hora, sem quiz**.

| Fase | O que faz o altar aparecer | O que ele abre |
|---|---|---|
| 1 — Amazônia | juntar os **3 fragmentos ⚙️** | a porta da caverna (`temple1`) pelo livro (quiz) |
| 2 — Caverna do Tempo | as **2 alavancas** + os **4 fragmentos ⚙️** | a porta do salão (`main2`) pelo livro (quiz) |
| 3 — Câmara do Cálice | **vencer a fuga** (cruzar a porta do túnel) | o **selo do Cálice** → o final (um **E**, sem quiz) |

### ✋ Chegou perto do livro
A **tecla `E` dourada** aparece flutuando e virada para a câmera, apontando
para o altar, junto com a linha pulsando no HUD: `✋ aperte E — abrir o livro
ancestral 📖` (Fases 1 e 2) ou `✋ aperte E — romper o selo do Cálice 🏆`
(Fase 3). O aviso só aparece depois que o altar emerge, e some quando o
objetivo já foi cumprido.

### 🎲 Como o livro sorteia
- **No máximo 2 perguntas** por rodada, **sempre de matérias diferentes** —
  sorteadas de **MATEMÁTICA, PORTUGUÊS, CIÊNCIAS ou HISTÓRIA**.
- As matérias da rodada aparecem em pílulas acima da pergunta.
- O nível é **até o 5º ano** (MMC/MDC, frações, ângulos, Sinonônimo, verbo vs
  advérbio, Sistema Solar, corpo humano, Lei Áurea, República…).
- **90 perguntas** no banco. Acertando **1 das 2**, o livro abre e a porta
  destranca.

### ❌ Errou? O livro recusa
Errou **uma** pergunta, o livro sacode a cabeça e responde:

> ❌ **Você não teve o conhecimento necessário. Faz de novo!**

Mostra embaixo a **resposta certa com a explicação**, aplica −8 de vida e, após
2,3 s, **o próprio livro reabre sozinho com perguntas novas** — o quiz reinicia
na pergunta 1, sem você precisar apertar nada.

### 🔀 Nunca a mesma pergunta duas vezes
O livro guarda as **últimas 5 rodadas** (10 perguntas). Então:
- errar → **sempre** draw novo;
- fechar e abrir o livro de novo → **sempre** draw novo.

Vale **igualmente para os altares da Fase 1 e da Fase 2**. O **selo do Cálice**
(Fase 3) não faz perguntas: um único **E** rompe o selo e dispara o final.

## 🌀 Giro do Chicote (H) — ataque em ÁREA

O herói dá **uma volta completa de 360°** e o chicote varre **tudo** em volta.
Diferente do chicote normal (que só acerta quem está **à frente**), o giro
atinge **todo inimigo dentro do raio**, inclusive pelas costas — a resposta
para ser cercado.

| | |
|---|---|
| **Tecla** | `H` (celular: botão 🌀 laranja) |
| **Alcance** | 4,3 m (o arco varre ~5,7 m num inimigo grande) |
| **Duração** | 0,62 s (uma volta) |
| **Fôlego** | 18 de stamina |
| **Recarga** | 20 s |
| **Empurrão** | ~2,7 m de deslize (Golem ~1 m) |

- ⚔ **Dano fixo de 15** em cada inimigo que o giro varre — sempre 15, sem
  depender da arma, da dificuldade nem do porte do alvo (a Sentinela também
  leva 15).
- 👊 **Empurrão forte em TODO MUNDO**: o giro manda cada inimigo varrido
  deslizar ~2,7 m para trás (velocidade que freia no chão, sem teleportar) e
  leva anel de impacto 💨; a Sentinela/Golem pesa e resiste, saindo ~1 m.
- 🎯 **Cada inimigo leva UMA vez por giro** (sem dano em cascata).
- 🛡️ Dá **0,26 s de invulnerabilidade** no começo — o giro também é uma
  esquiva curta, igual ao rolamento.
- ⚡ Mantém o **parry**: girar durante a antecipação da Sentinela cancela o
  golpe dela, e inimigo **atordoado** leva o dobro.
- Bloqueia no ar (não dá p/ girar voando no `V`), **paralisado** e sem fôlego.
- O HUD mostra a pílula `🌀 GIRO DO CHICOTE PRONTO (H)` com a barra de recarga.
- Os elos do chicote formam um **círculo real** que abre e fecha durante a volta,
  com a ponta acendendo no meio do giro.

## 🎯 Mira Travada (Z)

Aperte **Z** apontando para um inimigo e a **câmera trava nele**: aparece um
retículo laranja no peito do alvo, a etiqueta `🎯 MIRA TRAVADA: 🐍 Cobra` fica
abaixo da mira e a câmera **acompanha** o alvo enquanto ele se mexe ou pula.

- 🎯 Escolhe o inimigo **mais alinhado com a mira** (cone de ~48°, até 52 m);
  em empate de ângulo, vence o mais perto.
- 🐍 O **chicote acerta o alvo travado de qualquer ângulo** — mesmo virado de
  costas. É para isso que a trava serve: mirar certo em bicho pequeno ou pulando.
- 🔒 Com a trava ativa, o **mouse (e Q/R) não giram mais a câmera** — quem manda
  é o alvo. É uma trava de verdade, não um "assistente".
- 🖐 **Z de novo solta**. A mira também solta sozinha se o alvo morrer ou passar
  de 52 m.
- O **badge 🎯** fica vermelho e pulsa na fileira de habilidades (com G e H).

## 🧲 Laço e itens quebrando
- **Laço puxa item**: se um **drop estiver mais perto que o inimigo**, o `G` laça o
  item do chão e ele **voa girando até a mão** (mesma animação da corda) — assim
  dá para puxar um kit de vida à distância em vez de correr até ele.
- **Fraco de habilidade quebra**: pegar a poção 💧 **estilhaça o frasco** — cacos de
  vidro voam, giram, quicam no chão e apagam, com anel de choque e brilho.
- Todo item coletado (kit, fragmento, cálice) dá um **"pop"**: anel que se abre +
  faíscas na cor do item.

## 📖 Tutorial (Fase 1)
São **8 passos**, cada um com marcador dourado no chão apontando o alvo:

| # | Passo | Como passa |
|---|---|---|
| 1/8 | Andar | andar 7 m |
| 2/8 | **Travar a mira 🎯 (Z)** | apertar Z num inimigo |
| 3/8 | Atacar com o chicote | chicotear o boneco de treino |
| 4/8 | **Giro do chicote 🌀 (H)** | dar um giro de 360° |
| 5/8 | Pegar o item | andar em cima do drop |
| 6/8 | Fragmentos ⚙️ | juntar 3 |
| 7/8 | **Pendurar na argola 🌀 (V)** | voar pela ravina de lava |
| 8/8 | Livro e porta | responder ao altar |
A fase 1 abre com um **guia de 6 passos** no canto superior da tela. Cada passo
mostra o que fazer e desenha um **marcador dourado no chão** apontando o alvo
(anel girando + feixe de luz + seta); o painel fica verde quando você chega perto.

| # | Passo | Como conclui |
|---|---|---|
| 1/6 | Andar | `WASD` — caminhar alguns metros |
| 2/6 | Atacar com o chicote | `Clique`/`F` no **boneco de treino** da clareira |
| 3/6 | Pegar o drop | andar em cima do item que o boneco deixou (ele sempre derruba um) |
| 4/6 | Fragmentos ⚙️ | encostar em **3 fragmentos** |
| 5/6 | Argola 🌀 | `V` perto do anel dourado (voa por cima da lava) |
| 6/6 | Abrir a porta | seguir o marcador até o portal do templo |

O boneco de treino é uma cobra parada na clareira do riacho: **não foge, não
envenena e sempre deixa um kit de vida** quando é derrubado. Dá pra pular o
tutorial a qualquer momento no botão **"Pular"** — a escolha fica salva e o guia
não aparece de novo nem quando você conclui os 6 passos.

## 🗺 Fases
1. **Despertar na Amazônia** — trilha, ravina de lava, muralha de pedra, 3 fragmentos, serpentes e morcegos
2. **Caverna do Tempo** — salão fechado com arcos e colunatas, totens de lança, lâminas, **chão firme do spawn ao portal** (o fosso de lava e as plataformas foram removidos a pedido — sem quedas nem lajes na Fase 2), 2 alavancas + 4 fragmentos
3. **A Câmara do Cálice** — terraço → **vão de lava** (travessia só pelas lajes + atalho opcional pelas argolas 🌀) → **arena da Sentinela** (fechada e **sem nenhuma armadilha**) → **túnel de fuga** (porta que só abre com o Cálice)

Toda a fase 3 é uma **malha reta e única**: paredes laterais de `z -23` até a porta
com a mesma espessura e o mesmo alinhamento, todo piso com o mesmo topo (`y=0`) e
pedra com relevo procedural — nada de degrau, fresta ou parede atravessável. As
paredes reais da arena **são** os limites da IA da Sentinela.

## 🗿 A Sentinela cai de JOELHOS (não morre)

Quando o Relógio quebra, entra uma **cutscene de 3 quadros** e a colossal
**não desaba morta**: o mostrador do peito estala, as rachaduras de lava apagam
uma a uma, e ela **amassa um joelho no chão**, segura o próprio peso nos dois
punhos e **fica de joelhos, partida** — derrotada, não morta. Aí sim o pedestal
se ilumina e o Cálice pode ser tomado.

A pose é mantida para sempre: tronco inclinado para a frente (`rot.x = -0,32`),
**nunca de lado nem de costas**, sem afundar no chão, com o núcleo apagado, os
olhos mortos e o pêndulo quase parado.

## 🗿 A Sentinela do Tempo
Colossal (5,2 m), modelada com pernas articuladas, **duas mãos de punho com dedos**, ombreiras, coroa de agulhas, pêndulo e o **mostrador do Relógio no peito** com ponteiros que giram. 900 de vida, 3 ataques:

| Ataque | O que faz | Como desviar |
|---|---|---|
| 🗿 Pancada | ergue as duas mãos e esmaga o chão | saia do círculo vermelho, role com **C** ou dê **parry** |
| 🌊 Onda de Choque | pula e solta um anel expansivo que empurra | afaste-se, pule por cima ou role para fora |
| 🌀 Giro do Relógio | rodopia com os braços abertos, dano por tique | saia do centro, pule ou role |

### Como sobreviver ao duelo (a arena é limpa: 0 armadilhas)
- 🔴 **Telegrafia**: todo ataque marca no chão, em vermelho, **exatamente onde vai bater**. A marca pulsa e acelera conforme o golpe se aproxima.
- 🌀 **Esquiva** (`C`, `Ctrl`, botão `↯` ou dois toques na direção): rolamento de 360° com **invulnerabilidade real** durante o giro (1,15 s de recarga, gasta um pouco de fôlego).
- ⏱️ **Esquiva perfeita**: se o golpe passaria em você e não pegou, entra **tempo lento** (1,2 s), a Sentinela **desequilibra** (janela de dano) e você ganha pontos.
- ⚡ **Parry**: bata com o chicote **durante a antecipação** da Sentinela (as mãos subindo) — o golpe é cancelado, ela fica atordoada e o dano é dobrado.
- **⚡ Stun**: empurre-a contra a **parede** — ao martelar a pedra ela fica **atordoada 2,6s** e leva **dano dobrado**. O mesmo vale para o laço (G): ele não quebra a Sentinela, mas a derruba atordoada.
- 🚧 **Não atravessa parede**: a IA dela é limitada pelos limites da arena e pelos colliders.
- 🔴 Aos 40% de vida ela **enfurece** (mais rápida, núcleo vermelho).

### 🐛 A ponte que queimava
A lava queima quem estiver a menos de **0,9 m** do nível dela. As lajes da ponte
ficavam com o topo em ~0,6 — ou seja, **você levava dano a cada passo**. Agora
elas ficam altas (topo em ~1,0), e **durante a fuga elas não desabar**: a
perseguição já é o desafio, e a ponte precisa ser atravessável de verdade.

A **pedra** também mudou: acelera sem parar, mas **nunca passa dos 7,1 m/s**
(sua corrida com `SHIFT` é 8,6), e o esmagamento tira 22 com a invulnerabilidade
do jogo — encostar afasta, não mata na hora.

## 🌉 O vão de lava da Fase 3
O chão é **uma laje magra de 0,45 m** (`y -0.45…0`), em.flush com a base da
caverna — sem degraus e sem lajes sobrepostas escondidas no meio do piso (elas
criavam um degrau de 5 cm atravessando a arena inteira).

As laterais do vão foram fechadas: **não existe mais atalho pela beira**. Entre a
câmara e o terraço há um abismo de lava (`x -18..18, z 24..42`) que só se
atravessa de duas maneiras:

- 🪨 **As 6 lajes** (rota principal, `z 39.9` → `24.4`): cada uma **cai 2,2 s
  depois de você pisar** e desaparece na lava. Atravesse sem parar.
- 🌀 **As argolas** (atalho opcional, risco de queda): são rápidas e não caem —
  mas errar o tempo significa cair na lava.

### ⛩️ No túnel: o selo do Cálice
Cruzada a porta, a pedra esmaga o túnel e **você vence a fuga** — mas o Cálice
ainda está **selado**. No fundo do túnel emerge o **altar do selo**: aperte
**E** para rompê-lo **na hora, sem quiz**, liberando o final. Sem isso, o portal
não te deixa sair.

### 🎬 O desabamento → 🏃 CORRA PELA SUA VIDA
Pegar o Cálice dispara uma **cutscene de 4 quadros** — o silêncio, o **tremor**
surdo lá embaixo e a **chuva de pingos de lava** caindo do teto. Só *depois* que
ela acaba é que a **pedra** aparece rachando o chão (com estilhaços voando) e
começa a perseguir você. Na tela entra o cartão de missão pulsando:

> 🎯 **CORRA PELA SUA VIDA** — A pedra vem atrás de você! Atravesse a ponte de
> lajes e o túnel. **Segure SHIFT para CORRER** — a fuga é longa.

A **pedra** acelera sem parar (vence a corrida da argola, não a da laje) e a
**fuga termina ao cruzar a porta** (`z>52`). O herói chega inteiro ao túnel e
mesmo assim fica para sempre preso do lado de fora.

### 🏆 O prêmio: o Cálice da Âncora
Derrotada a Sentinela, o pedestal no fundo da arena entrega um **cálice dourado
torneado de verdade** (perfil de `LatheGeometry`: pé, haste, nó, colo, taça e lábio
com curvas contínuas), craveado de gemas, com o líquido do tempo brilhando dentro
e um feixe de luz subindo dele. É o que abre a porta do túnel de fuga.

## 🪢 Laço (G)
Laça o inimigo a até 14m e executa a animação completa: **puxa → ergue girando → derruba e esmaga no chão** (com corda desenhada, anel na presa, poeira e onda de choque). Inimigo comum morre; a Sentinela cai atordoada.

## 🎬 Cutscenes
Barra de cinema com **legendas**, câmera panorâmica real passeando pelo cenário e um leve travelling de FOV:
- **Prólogo** (5 quadros): Nova York 1969 → a queda → a trilha → o templo — a câmera **passeia pelo mapa real da Fase 1** atrás do herói, e o último quadro usa `face`: a câmera se posiciona sozinha **na frente do herói, virada para ele**
- **Desabamento** (4 quadros, ao tomar o Cálice): o silêncio → o tremor → os pingos de lava → o aviso
- **Epílogo** (7 quadros, ao escapar): a câmara desaba → Nova York, dias depois ("vamos estudá-lo") → o Cálice cheio de areia e dado como encerrado → a sala do homem do lampião → o caminhão no deserto → o horizonte → o fedora na calçada

Clique ou **Espaço** avança, **Esc** pula.

## 🎭 O herói
Modelo 100% procedural de uma **pessoa de constituição normal** — **sem nenhum
músculo desenhado**: saíram o peitoral, o trapézio, as costas volumosas, os
abdominais, o deltoide, o tríceps, o quadríceps e a panturrilha. A forma vem só
das peças de roupa e do perfil torneado do casaco, e o braço sobe sozinho até o
ombro (peça única, sem bola de deltoide). Cerca de **6 cabeças** de altura, com
joelho com patela, bota de cano curto, mãos arredondadas com dedos, cabeça
grande com maçã do rosto, nariz e orelhas arredondados e fedora de copa
vincada. Membros em **cápsula**, tronco e chapéu torneados por perfil
(`LatheGeometry`), rosto em camadas e **nada de caixa reta** (bolsos e coldre
também arredondados).

Proporções medidas do modelo em execução (testadas no harness):

| | |
|---|---|
| Altura (sem chapéu) | 1,88 m |
| Largura dos ombros | 0,78 m (**41%** da altura) |
| Cabeças de altura | ~6,8 |
| Rosto e jaqueta | **visíveis** (olho, nariz e boca na frente da cabeça; botão, bolso e gola na frente do casaco — o harness aponta com raios se algo enterrar de novo) |

*Um humano real tem ~26% de ombros em relação à altura: mesmo **sem músculos**
o personagem é mais largo que a vida real de propósito, para não virar "palito"
— a diferença está nas proporções do esqueleto, não em relevo de musculatura.*

## 🔥 Lava e ravina realistas
A lava deixou de ser dois planos chapados (vermelho + amarelo). Agora é uma poça
de verdade montada em 4 camadas:

1. **Crosta** — basalto escuro texturizado proceduralmente, **rachivado por veios
   incandescentes** gerados com ruído *ridged* (a mesma técnica de "cabeça de
   hidrogênio").
2. **Fundo derretido** — a mesma textura rolando **mais rápido e no sentido
   contrário**, com blend aditivo. As duas camadas em velocidades diferentes é o
   que dá a **sensação de fluxo**.
3. **Ilhas de crosta** — pedaços de pedra escura boiando, que derivam com a
   correnteza e giram devagar.
4. **Bolhas** — pontos incandescentes que sobem da crota e estouram.

A **ravina** da Fase 1 ganhou o mesmo tratamento mais o cenário em volta:
paredes de basalto texturizado com zigue-zague, leito de rocha no fundo do abismo,
veios brilhando nas paredes do cânion, halo quente iluminando a rocha nas bordas,
colunas de calor subindo e mais brasas.

## 🔥 Queimadura e ☠️ Veneno (debuffs)
| debuff | duração | dano | onde |
|---|---|---|---|
| 🔥 **QUEIMADURA** | **5 s** | **4 por segundo** (20 no total) | encostar na lava ou na ravina |
| ☠️ **VENENO** | **6 s** | 1 a cada 2 s | mordida da cobra (só fase 1) |

A queimadura aparece com anel, faíscas, som e uma barra laranja pulsando no HUD.
Encostar na lava de novo **renova** os 5 s.

## 🧍 Bater numa armadilha NÃO volta pro começo da fase
O jogo grava o **último chão seguro** (a cada 0,35 s, ignorando a área de qualquer
armadilha). Se você cair na lava, levar uma facada ou ficar preso num rolo, você
**se levanta ali mesmo** e continua de onde parou — sem voltar para o começo da
fase e sem perder o progresso.

## ⚙️ Inimigos por fase
Cada fase tem só os inimigos que "moram" nela, e a **quantidade vem da
dificuldade** (2 / 3 / 5 de cada tipo), em posições fixas:

| Fase | Inimigos | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| 1 | cobra + morcego | 2 + 2 | 3 + 3 | 5 + 5 |
| 2 | **só sentinelas de pedra (guardas)** | 2 | 3 | 5 |
| 3 | **só ogros** (+ a Sentinela, sempre 1) | 2 | 3 | 5 |

## ✨ Sistemas
- Vida, fôlego, iframes, corações, score, timer, save em `localStorage`
- 🧱 **paredes auditadas**: teste automático em todas as fases que garante
  **nenhuma fresta entre parede e teto**, **textura com repeat válido** e
  **câmera nunca dentro da pedra**
- **Câmera com colisão real**: nunca atravessa parede nem teto
- Inimigos com IA: cobra, guarda (lança arremessada + sangramento), morcego, ogro, e a Sentinela
- Armadilhas: espinhos, dardos, lanças, lâminas, lava, pedronas, plataformas móveis e que caem — **nenhuma dentro da arena do chefe**
- Puzzles: fragmentos, alavancas, whip à distância
- **Realismo**: sombras PCF suaves 2048² com penumbra, luz de preenchimento fria, ambiente PBR (PMREM), mapas de relevo procedurais em canvas (pedra, terra, metal), materiais diferenciados, ACES Filmic + sRGB
- **Performance**: **orçamento de luzes** (só as 7 mais importantes ficam na cena, o resto volta pro pool), **pool de faíscas** reaproveitado e geometrias compartilhadas — a fase 3 deixou de engasgar mesmo tendo dezenas de tochas
- Cenário detalhado: fachada de templo com arcos/dentículos/contrafortes, colunatas rebaixadas, estalactites em 3 partes, musgo, brasas, vaga-lumes, vozes de vento na vegetação
- Áudio 100% procedural via WebAudio (sem arquivos)
- HUD em PT-BR, telas de história, pause, game over, vitória

## 🧪 Testes
```bash
cd .gametest && npm install && node harness.mjs
```
Roda o jogo inteiro em Node (Three.js headless, **~284 asserções**):

- **movimento leve**: aceleração, frenagem e troca de direção medidas frame a frame
- **lajes que caem em 2,2 s** na ponte de lava da Fase 3 (pisa → treme → despenca → volta)
- **portas de todas as fases**: laje mais estreita e fina que o vão (sem z-fighting/piscar) e verga que **engole a laje quando ela sobe** — nada de porta flutuando no ar (testado para temple1, main2 e escape3)
- **lava realista**: crosta, camada de fluxo, ilhas à deriva e bolhas
- **queimadura** de 5 s a 4/s e **veneno** de 6 s
- **armadilha não volta pro início da fase** (chão seguro)
- **paredes**: nenhuma fresta parede↔teto, textura válida e câmera fora da pedra nas 3 fases
- **esquiva + esquiva perfeita + tempo lento**, **telegrafia** e **parry**
- **dificuldade obrigatória** + **2/3/5 inimigos de cada tipo por fase** + armadilhas reduzidas no fácil
- **aviso do E** nas alavancas, **frasco quebrando**, **laço puxando o drop**
- **tutorial da fase 1** passo a passo
- rotas da Fase 3, Sentinela (colisão e stun), cálice final, status, cutscenes e vitória

Feito com Three.js r160. `js/three.module.js` está vendorizado, então o jogo roda **offline**.
