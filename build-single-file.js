#!/usr/bin/env node
/**
 * build-single-file.js
 * Gera fazendo-historia-standalone.html a partir da versão modular
 * (index.html + style.css + app.js + questoes.json + img/*), embutindo
 * tudo em um único arquivo HTML (CSS e JS inline, imagens em base64,
 * banco de questões inline). Funciona 100% offline, sem precisar de
 * servidor nem de fetch().
 *
 * Uso:
 *   cd fazendo-historia
 *   node build/build-single-file.js
 *
 * Gera: dist/fazendo-historia-standalone.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
}

function imageToDataUri(relPath) {
  const abs = path.join(ROOT, relPath);
  const buf = fs.readFileSync(abs);
  return `data:${mimeFor(relPath)};base64,${buf.toString('base64')}`;
}

function embedImagesInHtmlAttrs(html) {
  // Embute qualquer <img ... src="img/...">
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (match, pre, src, post) => {
    if (!src.startsWith('img/')) return match;
    try {
      return pre + imageToDataUri(src) + post;
    } catch (err) {
      console.warn('Aviso: não foi possível embutir imagem referenciada no HTML:', src);
      return match;
    }
  });
}

function embedImagesInCss(css) {
  // Embute qualquer url('img/...') ou url("img/...") ou url(img/...)
  return css.replace(/url\((['"]?)(img\/[^'")]+)\1\)/g, (match, quote, src) => {
    try {
      return `url(${quote}${imageToDataUri(src)}${quote})`;
    } catch (err) {
      console.warn('Aviso: não foi possível embutir imagem referenciada no CSS:', src);
      return match;
    }
  });
}

function embedImagesInQuestions(questions) {
  return questions.map((q) => {
    if (!q.image) return q;
    try {
      return Object.assign({}, q, { image: imageToDataUri(q.image) });
    } catch (err) {
      console.warn('Aviso: não foi possível embutir imagem da questão', q.num, q.edition, '→', q.image);
      return q;
    }
  });
}

function build() {
  let html = readText('index.html');
  const css = readText('style.css');
  const js = readText('app.js');
  const questions = JSON.parse(readText('questoes.json'));

  // 1. Embute imagens usadas diretamente no HTML (logo etc.)
  html = embedImagesInHtmlAttrs(html);

  // 2. Embute imagens referenciadas no CSS (texture.png de fundo)
  const cssEmbedded = embedImagesInCss(css);

  // 3. Embute imagens das questões (base64) e inline o banco de dados no JS
  const questionsEmbedded = embedImagesInQuestions(questions);
  const jsInline = js.replace(
    "fetch('questoes.json')\n    .then((response) => {\n      if (!response.ok) {\n        throw new Error('Não foi possível carregar o banco de questões (questoes.json).');\n      }\n      return response.json();\n    })\n    .then((questionsBank) => {\n      runApp(questionsBank);\n    })\n    .catch((error) => {\n      console.error(error);\n      document.body.innerHTML =\n        '<div style=\"padding:40px;text-align:center;font-family:sans-serif;color:#8b1e2d;\">' +\n        'Erro ao carregar o banco de questões. Verifique se o arquivo <code>questoes.json</code> ' +\n        'está presente na mesma pasta que este HTML.</div>';\n    });",
    `runApp(${JSON.stringify(questionsEmbedded)});`
  );

  if (jsInline === js) {
    throw new Error(
      'Não foi possível localizar o bloco de fetch(\'questoes.json\') em app.js para substituição. ' +
      'O arquivo app.js pode ter sido alterado — ajuste este script antes de gerar o standalone.'
    );
  }

  // 4. Monta o HTML final: remove os links externos e injeta CSS/JS inline
  let out = html
    .replace(/<link rel="stylesheet" href="style\.css">/, `<style>\n${cssEmbedded}\n</style>`)
    .replace(/<script src="app\.js"><\/script>/, `<script>\n${jsInline}\n</script>`);

  if (!out.includes('<style>') || !out.includes('<script>\n')) {
    throw new Error('Não foi possível injetar CSS ou JS no HTML — verifique as tags <link> e <script> em index.html.');
  }

  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, 'fazendo-historia-standalone.html');
  fs.writeFileSync(outPath, out, 'utf8');

  const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(`OK: ${outPath} (${sizeMB} MB), ${questionsEmbedded.length} questões embutidas.`);
}

build();
