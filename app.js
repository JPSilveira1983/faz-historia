(function () {
  'use strict';

  // Preferência de tema (clara/escura): funciona independente do carregamento
  // do banco de questões, para que os botões já respondam assim que a página abre.
  function effectiveTheme() {
    var chosen = document.documentElement.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateThemeButtons() {
    var current = effectiveTheme();
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === current);
    });
  }

  window.setTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('fh-theme', theme); } catch (e) {}
    updateThemeButtons();
  };

  updateThemeButtons();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeButtons);
  }

  fetch('questoes.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Não foi possível carregar o banco de questões (questoes.json).');
      }
      return response.json();
    })
    .then((questionsBank) => {
      runApp(questionsBank);
    })
    .catch((error) => {
      console.error(error);
      document.body.innerHTML =
        '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#8b1e2d;">' +
        'Erro ao carregar o banco de questões. Verifique se o arquivo <code>questoes.json</code> ' +
        'está presente na mesma pasta que este HTML.</div>';
    });

  function runApp(questionsBank) {
  let questions = [];
  let current = 0;
  let answers = [];
  let revealed = [];
  let finished = false;
  let showingPromo = false;
  let currentCategory = 'all';
  let promoShownAt = new Set();
  let promoCount = 0;

  // Divulgação institucional exibida a cada 10 questões respondidas.
  // Para acrescentar novos anúncios aos poucos, basta adicionar um novo objeto
  // a este vetor: o rodízio entre eles acontece automaticamente.
  const promoSlides = [
    {
      kicker: 'Vestibular UEG',
      question: 'Ainda não sabe em qual curso superior ingressar?',
      title: 'Três motivos para cursar História na UEG',
      reasons: [
        { title: '1. Universidade pública, gratuita e próxima de você', text: 'Com professores qualificados e formação comprometida com sua trajetória.' },
        { title: '2. Qualificação profissional, intelectual e crítica', text: 'Uma formação que faz a diferença na vida e no trabalho.' },
        { title: '3. Um perfil profissional amplo', text: 'Possibilidades de atuação como professor, pesquisador, comunicador e curador em instituições que lidam com a História.' }
      ],
      linkText: 'Inscreva-se no Vestibular da UEG',
      linkUrl: 'https://nucleodeselecao.ueg.br/'
    },
    {
      kicker: 'Curso de História — UEG Iporá',
      question: 'Já pensou em transformar seu interesse por História em profissão?',
      title: 'Um curso pensado para quem ama História',
      reasons: [
        { title: '1. Formação pública e gratuita', text: 'Estrutura da Universidade Estadual de Goiás, sem mensalidade.' },
        { title: '2. Ensino, pesquisa e extensão', text: 'Contato direto com professores e projetos ao longo de toda a graduação.' },
        { title: '3. Inscrição simples', text: 'Acesse o site do Núcleo de Seleção da UEG e confira os próximos processos seletivos.' }
      ],
      linkText: 'Conheça o curso e inscreva-se',
      linkUrl: 'https://nucleodeselecao.ueg.br/'
    }
  ];

  document.getElementById('questions-count').textContent = questionsBank.length;
  // Classificação por categoria: Goiás tem prioridade (categoria própria); o restante
  // segue como História do Brasil ou História Geral, pelo prefixo do campo "tema".
  // Para uma questão entrar em Goiás, use tema começando com "História de Goiás".
  const isGoias = (question) => question.tema.startsWith('História de Goiás');
  const isBrasil = (question) => !isGoias(question) && question.tema.startsWith('História do Brasil');
  const isGeral = (question) => !isGoias(question) && !isBrasil(question);
  document.getElementById('count-brasil').textContent = questionsBank.filter(isBrasil).length + ' questões disponíveis';
  document.getElementById('count-geral').textContent = questionsBank.filter(isGeral).length + ' questões disponíveis';
  document.getElementById('count-goias').textContent = questionsBank.filter(isGoias).length + ' questões disponíveis';

  const splashScreen = document.getElementById('splash-screen');
  const hideSplash = () => splashScreen.classList.add('is-hidden');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hideSplash();
  } else {
    window.setTimeout(hideSplash, 4000);
  }

  function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startSimulado(category = 'all') {
    currentCategory = category;
    const pool = category === 'brasil' ? questionsBank.filter(isBrasil)
      : category === 'goias' ? questionsBank.filter(isGoias)
      : questionsBank.filter(isGeral);
    questions = shuffle(pool);
    current = 0;
    answers = Array(questions.length).fill(null);
    revealed = Array(questions.length).fill(false);
    finished = false;
    showingPromo = false;
    promoShownAt = new Set();
    promoCount = 0;

    document.getElementById('welcome').style.display = 'none';
    document.getElementById('category-choice').style.display = 'none';
    document.getElementById('header').style.display = 'flex';
    document.getElementById('progress-bar').style.display = 'block';
    document.getElementById('dots').style.display = 'flex';
    document.getElementById('question-card').style.display = 'block';
    document.getElementById('nav-bar').style.display = 'flex';
    document.getElementById('results').style.display = 'none';
    document.getElementById('promo-page').style.display = 'none';

    render();
  }

  function showCategories() {
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('category-choice').style.display = 'block';
  }

  function renderDots() {
    const dots = document.getElementById('dots');
    dots.innerHTML = '';
    questions.forEach((q, i) => {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (answers[i] !== null) {
        if (revealed[i]) {
          dot.classList.add(answers[i] === q.correct ? 'correct' : 'wrong');
        } else {
          dot.classList.add('answered');
        }
      } else {
        dot.classList.add('unanswered');
      }
      if (i === current) dot.classList.add('current');
      dot.textContent = i + 1;
      dot.onclick = () => { current = i; render(); };
      dots.appendChild(dot);
    });
  }

  function render() {
    if (finished) return;
    const q = questions[current];
    document.getElementById('question-num').textContent = 'Questão ' + (current + 1) + ' de ' + questions.length + ' · ' + q.edition;

    const imageBlock = q.image
      ? '<div class="label">Texto I</div><img class="question-image" src="' + q.image + '" alt="' + q.imageAlt + '"><div class="source">' + q.imageCredit.replace(/\n/g, '<br>') + '</div>' + (q.hasSecondText ? '<div class="label" style="margin-top:18px;">Texto II</div>' : '')
      : '<div class="label">Texto de apoio</div>';
    document.getElementById('supporting-text').innerHTML =
      imageBlock + q.support.replace(/\n/g, '<br>') + '<div class="source">' + q.source + '</div>';

    document.getElementById('question-text').textContent = q.text;

    const opts = document.getElementById('options');
    opts.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (answers[current] === i) btn.classList.add('selected');
      if (revealed[current]) {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct-ans');
        else if (answers[current] === i) btn.classList.add('wrong-ans');
      }
      btn.innerHTML = '<span class="option-letter">' + String.fromCharCode(65 + i) + '</span><span class="option-text">' + opt.substring(3) + '</span>';
      btn.onclick = () => selectOption(i);
      opts.appendChild(btn);
    });

    const fb = document.getElementById('feedback');
    if (revealed[current]) {
      const isCorrect = answers[current] === q.correct;
      fb.className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
      const selectedLetter = String.fromCharCode(65 + answers[current]);
      const correctLetter = String.fromCharCode(65 + q.correct);
      const hasExplanation = Boolean(q.explanation);
      const bodyText = isCorrect
        ? (hasExplanation ? q.explanation : 'Você identificou corretamente a alternativa ' + correctLetter + '.')
        : 'A alternativa ' + selectedLetter + ' não responde adequadamente ao enunciado. A resposta correta é a alternativa ' + correctLetter + (hasExplanation ? ', porque ' + q.explanation : '.');
      fb.innerHTML = '<div class="feedback-title">' + (isCorrect ? '✓ Resposta correta' : '✗ Resposta incorreta') + '</div><div class="feedback-body">' + bodyText + '</div>';
    } else {
      fb.className = 'feedback';
      fb.style.display = 'none';
    }

    document.getElementById('btn-prev').disabled = current === 0;
    document.getElementById('btn-next').textContent = current === questions.length - 1 ? 'Ver resultado' : 'Próxima questão';

    document.getElementById('progress-bar-fill').style.width = Math.round(((current + 1) / questions.length) * 100) + '%';

    renderDots();
  }

  function selectOption(i) {
    if (revealed[current]) return;
    answers[current] = i;
    revealed[current] = true;
    render();
  }

  function nextQ() {
    const isMilestone = (current + 1) % 10 === 0 && current < questions.length - 1;
    if (isMilestone && !promoShownAt.has(current)) {
      showPromo();
      return;
    }
    if (current < questions.length - 1) {
      current++;
      render();
    } else {
      finish();
    }
  }

  function renderPromo() {
    const slide = promoSlides[promoCount % promoSlides.length];
    document.getElementById('promo-kicker').textContent = slide.kicker;
    document.getElementById('promo-question').textContent = slide.question;
    document.getElementById('promo-title').textContent = slide.title;
    const reasonsEl = document.getElementById('promo-reasons');
    reasonsEl.innerHTML = '';
    slide.reasons.forEach((reason) => {
      const div = document.createElement('div');
      div.className = 'promo-reason';
      div.innerHTML = '<strong>' + reason.title + '</strong>' + reason.text;
      reasonsEl.appendChild(div);
    });
    const link = document.getElementById('promo-link');
    link.textContent = slide.linkText;
    link.href = slide.linkUrl;
  }

  function showPromo() {
    promoShownAt.add(current);
    promoCount++;
    showingPromo = true;
    renderPromo();
    document.getElementById('question-card').style.display = 'none';
    document.getElementById('nav-bar').style.display = 'none';
    document.getElementById('progress-bar').style.display = 'none';
    document.getElementById('dots').style.display = 'none';
    document.getElementById('promo-page').style.display = 'block';
  }

  function continueStudy() {
    showingPromo = false;
    document.getElementById('promo-page').style.display = 'none';
    if (current >= questions.length - 1) {
      finish();
      return;
    }
    current++;
    document.getElementById('question-card').style.display = 'block';
    document.getElementById('nav-bar').style.display = 'flex';
    document.getElementById('progress-bar').style.display = 'block';
    document.getElementById('dots').style.display = 'flex';
    render();
  }

  function prevQ() {
    if (current > 0) {
      current--;
      render();
    }
  }

  function finish() {
    finished = true;
    document.getElementById('question-card').style.display = 'none';
    document.getElementById('nav-bar').style.display = 'none';
    document.getElementById('progress-bar').style.display = 'none';
    document.getElementById('dots').style.display = 'none';
    document.getElementById('header').style.display = 'none';

    const correctCount = answers.filter((a, i) => a === questions[i].correct).length;
    const wrongCount = answers.filter((a, i) => a !== null && a !== questions[i].correct).length;
    const unansweredCount = answers.filter(a => a === null).length;
    const answeredCount = questions.length - unansweredCount;
    const percentage = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);

    document.getElementById('results').style.display = 'block';
    document.getElementById('promo-page').style.display = 'none';
    document.getElementById('score-display').textContent = correctCount + ' acertos';
    document.getElementById('score-label').textContent = 'Respondidas: ' + answeredCount + ' · Acertos: ' + correctCount + ' · Erros: ' + wrongCount + ' · Aproveitamento: ' + percentage + '%';

    const details = document.getElementById('result-details');
    details.innerHTML = '';
    questions.forEach((q, i) => {
      const isCorrect = answers[i] === q.correct;
      const row = document.createElement('div');
      row.className = 'result-row ' + (isCorrect ? 'correct' : 'wrong');
      const userLetter = answers[i] !== null ? String.fromCharCode(65 + answers[i]) : '—';
      const correctLetter = String.fromCharCode(65 + q.correct);
      row.innerHTML =
        '<div class="result-marker ' + (isCorrect ? 'correct' : 'wrong') + '">' + (isCorrect ? '✓' : '✗') + '</div>' +
        '<div class="result-info">' +
          '<div class="q-num">Questão ' + (i + 1) + ' — ' + q.tema + '</div>' +
          '<div class="q-meta">Sua resposta: <b>' + userLetter + '</b> &nbsp;|&nbsp; Gabarito: <b>' + correctLetter + '</b> &nbsp;|&nbsp; Referência original: ' + (q.edition ? q.edition + ' · ' + q.booklet + ' · questão ' + q.num : 'questão ' + q.num) + '</div>' +
        '</div>';
      details.appendChild(row);
    });
  }

  window.restart = function() {
    startSimulado(currentCategory);
  };

  window.backToWelcome = function() {
    document.getElementById('welcome').style.display = 'block';
    document.getElementById('category-choice').style.display = 'none';
    document.getElementById('header').style.display = 'none';
    document.getElementById('progress-bar').style.display = 'none';
    document.getElementById('dots').style.display = 'none';
    document.getElementById('question-card').style.display = 'none';
    document.getElementById('nav-bar').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    document.getElementById('promo-page').style.display = 'none';
  };

  window.prevQ = prevQ;
  window.nextQ = nextQ;
  window.startSimulado = startSimulado;
  window.showCategories = showCategories;
  window.continueStudy = continueStudy;

  window.shareApp = async function() {
    const shareData = {
      title: 'Fazendo História',
      text: 'Estude História para o ENEM e vestibulares com o Fazendo História.',
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (navigator.clipboard && window.location.protocol !== 'file:') {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copiado para compartilhar.');
        return;
      }
      alert('Quando o aplicativo estiver hospedado, copie o endereço da página para compartilhar.');
    } catch (error) {
      if (error.name !== 'AbortError') alert('Não foi possível compartilhar neste dispositivo.');
    }
  };
  }
})();
