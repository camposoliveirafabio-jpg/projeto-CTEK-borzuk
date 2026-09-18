# ⌛ Caçador de Relíquias: O Relógio de Arquimedes

Jogo de **ação e aventura 3D** estilo Indiana Jones, rodando no navegador com **Three.js**. Sem instalação, sem build.

## 📖 História
1969. Na luta contra **Jürgen Voller** pelo **Relógio de Arquimedes** — que leva quem o portar a qualquer lugar no tempo — o vilão fica com o mostrador e joga Indy para longe de casa: uma caverna no coração da **Amazônia, Brasil**. Atravesse a caverna, junte os fragmentos do mecanismo e tome a **Âncora Temporal**, o artefato que teletransporta para onde você quiser. É a volta para casa... e a última chance de deter Voller.

## ▶ Como jogar
```bash
# opção 1: só abrir (recomendado usar servidor local por causa dos módulos ES)
python3 -m http.server 8000
# abra http://localhost:8000

# opção 2: VS Code Live Server / qualquer servidor estático
```

## 🎮 Controles
- **WASD / Setas** mover • **Mouse** câmera (click captura o mouse)
- **Espaço** pular • **Shift** correr (gasta fôlego)
- **Clique esquerdo / F** chicote (ataca + balança nos anéis dourados)
- **E** interagir (alavancas) • **P/Esc** pausa
- 📱 Mobile: joystick esquerdo + botões ⤒ 🌀 🏃 E

## 🗺 Fases
1. **Despertar na Amazônia** — tutorial, ravina com whip-swing 🌀, 3 fragmentos abrem o portão, cobras + morcegos
2. **Caverna do Tempo** — dardos, espinhos, lava com plataformas móveis, pedrona rolante, 2 alavancas + 4 fragmentos
3. **Âncora Temporal** — lava, plataformas que caem, lâminas pendulares, **chefona Sentinela do Tempo 🗿**, tome a Âncora e **FUJA da pedrona final de volta para 1969!**

## ✨ Sistemas
- Vida, fôlego, iframes, corações, score, timer, save em `localStorage`
- Inimigos com IA (persegue/ataca): cobra, guarda, morcego, golem boss com onda de choque
- Armadilhas: espinhos, dardos, pedras rolantes, lâminas, lava, plataformas móveis/que caem
- Puzzles: fragmentos p/ abrir porta, alavancas, whip à distância
- Áudio 100% procedural via WebAudio (sem arquivos)
- HUD em PT-BR, telas de história, pause, game over, vitória

Feito com Three.js r160 via CDN (`unpkg`). Para offline, baixe o three.module.js para `js/`.
