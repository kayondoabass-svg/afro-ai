export function keyoStudioPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#eef0e7">
  <title>KEYO Studio — Local AI, open to inspection</title>
  <meta name="description" content="KEYO Studio is an early developer alpha with our own local JavaScript CPU inference engine. No paid API. No telemetry.">
  <style>
    :root {
      color-scheme: light;
      --paper: #eef0e7;
      --paper-bright: #f7f8f2;
      --ink: #202921;
      --muted: #647067;
      --line: #cbd2c6;
      --forest: #243c31;
      --forest-soft: #345444;
      --lime: #d5ed77;
      --orange: #db633d;
      --mono: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      --sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --serif: Georgia, "Times New Roman", serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font-family: var(--sans);
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    a:focus-visible, button:focus-visible { outline: 3px solid var(--orange); outline-offset: 4px; }
    .wrap { width: min(1120px, calc(100% - 48px)); margin-inline: auto; }
    .topbar { border-bottom: 1px solid var(--line); }
    .nav { display:flex; align-items:center; justify-content:space-between; min-height:76px; gap:24px; }
    .brand { display:inline-flex; align-items:center; gap:11px; text-decoration:none; font-weight:800; letter-spacing:-.055em; font-size:19px; }
    .brand-mark { width:28px; height:28px; display:grid; place-items:center; background:var(--forest); color:var(--lime); border-radius:7px 7px 7px 2px; font:700 15px var(--mono); letter-spacing:-.08em; }
    .nav-links { display:flex; align-items:center; gap:27px; font-size:13px; color:#46544a; }
    .nav-links a { text-decoration:none; }
    .nav-links a:hover, .text-link:hover { text-decoration:underline; text-underline-offset:4px; }
    .home-link { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:700; text-decoration:none; }
    .home-link span { font-size:18px; line-height:1; }
    .hero { padding:76px 0 82px; display:grid; grid-template-columns:minmax(0, 1.05fr) minmax(350px, .95fr); gap:56px; align-items:center; }
    .eyebrow { display:flex; align-items:center; gap:10px; color:#536259; font:700 11px var(--mono); letter-spacing:.12em; text-transform:uppercase; }
    .eyebrow::before { content:""; width:22px; height:2px; background:var(--orange); }
    h1 { margin:22px 0 20px; max-width:700px; font:400 clamp(52px, 7.1vw, 89px)/.97 var(--serif); letter-spacing:-.065em; }
    h1 em { color:var(--forest-soft); font-weight:400; }
    .hero-copy { max-width:550px; color:#4e5b52; font-size:17px; line-height:1.7; }
    .hero-copy strong { color:var(--ink); font-weight:650; }
    .actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:30px; }
    .button { display:inline-flex; min-height:48px; align-items:center; justify-content:center; gap:10px; padding:0 18px; border:1px solid var(--forest); border-radius:5px; background:var(--forest); color:#f4f5ed; font-size:13px; font-weight:750; text-decoration:none; transition:transform .18s ease, opacity .18s ease; }
    .button:hover { transform:translateY(-2px); }
    .button.secondary { background:transparent; color:var(--forest); }
    .button .arrow { font-size:17px; font-weight:400; }
    .alpha-note { margin-top:20px; padding-left:12px; border-left:2px solid var(--orange); color:#5c665d; font-size:12px; line-height:1.6; max-width:470px; }
    .hero-art { position:relative; min-height:390px; padding:24px; background:var(--forest); border-radius:11px 11px 11px 3px; color:#eaf0dc; overflow:hidden; box-shadow:0 22px 45px rgba(36,60,49,.13); }
    .hero-art::before { content:""; position:absolute; width:310px; height:310px; right:-110px; top:-130px; border:1px solid rgba(213,237,119,.28); border-radius:50%; box-shadow:0 0 0 32px rgba(213,237,119,.035),0 0 0 66px rgba(213,237,119,.035); }
    .art-head { position:relative; display:flex; justify-content:space-between; align-items:center; padding-bottom:19px; border-bottom:1px solid rgba(234,240,220,.18); font:11px var(--mono); color:#c1ccb8; }
    .alpha-tag { color:var(--lime); border:1px solid rgba(213,237,119,.5); padding:5px 8px; border-radius:3px; letter-spacing:.08em; text-transform:uppercase; font-size:9px; }
    .diagram { position:relative; min-height:255px; display:flex; align-items:center; justify-content:center; }
    .orbit { position:absolute; width:220px; height:220px; border:1px dashed rgba(213,237,119,.4); border-radius:50%; transform:rotate(-20deg) scaleY(.74); }
    .orbit::after { content:""; position:absolute; inset:22px; border:1px solid rgba(213,237,119,.24); border-radius:50%; }
    .core { position:relative; width:106px; height:106px; display:grid; place-items:center; border:1px solid rgba(213,237,119,.8); background:#2f4c3d; border-radius:50%; color:var(--lime); font:12px var(--mono); text-align:center; line-height:1.6; }
    .node { position:absolute; z-index:1; padding:8px 10px; border:1px solid rgba(234,240,220,.3); border-radius:3px; background:#2b4638; color:#e3e8db; font:10px var(--mono); }
    .node.n1 { top:25px; left:13%; }.node.n2 { top:53px; right:4%; }.node.n3 { bottom:34px; right:14%; }.node.n4 { bottom:24px; left:7%; }
    .art-foot { display:flex; justify-content:space-between; gap:14px; color:#b6c1b4; font:10px var(--mono); letter-spacing:.02em; }
    .art-foot b { color:var(--lime); font-weight:500; }
    .ticker { border-block:1px solid var(--line); background:rgba(247,248,242,.57); }
    .ticker-inner { min-height:60px; display:flex; justify-content:space-between; align-items:center; gap:18px; color:#59665b; font:10px var(--mono); text-transform:uppercase; letter-spacing:.09em; }
    .ticker-inner span { display:flex; align-items:center; gap:9px; }
    .ticker-inner span::before { content:""; width:5px; height:5px; background:var(--orange); border-radius:50%; }
    section { scroll-margin-top:28px; }
    .section { padding:88px 0; border-bottom:1px solid var(--line); }
    .section-head { display:grid; grid-template-columns:.72fr 1.28fr; gap:36px; align-items:start; margin-bottom:38px; }
    .section-kicker { padding-top:9px; color:#718074; font:11px var(--mono); letter-spacing:.1em; text-transform:uppercase; }
    h2 { margin:0; font:400 clamp(34px, 4.4vw, 52px)/1.06 var(--serif); letter-spacing:-.05em; }
    .section-intro { max-width:610px; margin:14px 0 0; color:var(--muted); line-height:1.7; font-size:15px; }
    .split { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .work-card { padding:25px; border:1px solid var(--line); background:var(--paper-bright); border-radius:5px; }
    .work-card h3 { margin:0 0 11px; font-size:16px; letter-spacing:-.02em; }
    .work-card p { margin:0; color:#5d685e; font-size:13px; line-height:1.75; }
    .mini-label { display:inline-block; margin-bottom:18px; color:#758176; font:10px var(--mono); letter-spacing:.09em; text-transform:uppercase; }
    .code-card { background:#1f3028; color:#e9eddf; border-radius:6px; overflow:hidden; }
    .code-top { display:flex; justify-content:space-between; align-items:center; padding:13px 17px; border-bottom:1px solid rgba(233,237,223,.15); color:#c1cbbb; font:10px var(--mono); }
    .copy-button { border:1px solid rgba(233,237,223,.3); background:transparent; color:#ecf0e5; padding:7px 10px; border-radius:3px; font:10px var(--mono); cursor:pointer; }
    .copy-button:hover { background:rgba(255,255,255,.08); }
    pre { margin:0; padding:21px 20px 24px; overflow:auto; font:12px/2 var(--mono); tab-size:2; }
    code .prompt { color:var(--lime); }.code-muted { color:#9baa9b; }
    .code-hint { padding:0 20px 18px; color:#9baa9b; font-size:11px; line-height:1.6; }
    .install-layout { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(240px,.8fr); gap:30px; align-items:start; }
    .install-side { padding:20px 0 0 20px; border-left:2px solid var(--orange); color:#58645a; font-size:13px; line-height:1.8; }
    .install-side strong { display:block; margin-bottom:7px; color:var(--ink); }
    .requirements { display:grid; grid-template-columns:repeat(3, 1fr); gap:1px; margin-top:20px; border:1px solid var(--line); background:var(--line); }
    .requirement { padding:17px; background:var(--paper-bright); }
    .requirement small { display:block; color:#778177; font:10px var(--mono); text-transform:uppercase; letter-spacing:.08em; }
    .requirement b { display:block; margin-top:9px; font-size:13px; }
    .model-box { display:grid; grid-template-columns:1fr .75fr; border:1px solid var(--line); background:var(--paper-bright); border-radius:5px; overflow:hidden; }
    .model-copy { padding:28px; }
    .model-copy h3 { margin:0 0 12px; font:400 25px var(--serif); letter-spacing:-.03em; }
    .model-copy p { color:#5d685e; font-size:13px; line-height:1.75; }
    .file-tree { padding:26px; background:#e5e9de; font:12px/2 var(--mono); color:#33463a; }
    .file-tree .tree-heading { margin-bottom:8px; color:#798479; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
    .file-tree .required { color:#214735; font-weight:700; }
    .file-tree .tree-note { margin-top:12px; color:#778177; font:10px/1.6 var(--sans); }
    .scope-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 44px; border-top:1px solid var(--line); }
    .scope-row { display:grid; grid-template-columns:22px 1fr; gap:12px; padding:19px 0; border-bottom:1px solid var(--line); }
    .scope-icon { color:var(--forest-soft); font:16px var(--mono); }
    .scope-icon.no { color:var(--orange); }
    .scope-row strong { display:block; margin-bottom:5px; font-size:13px; }
    .scope-row p { margin:0; color:#637064; font-size:12px; line-height:1.6; }
    .boundary-note { margin-top:24px; padding:18px 20px; background:#e1e6db; color:#4e5d51; font-size:12px; line-height:1.7; border-radius:4px; }
    .boundary-note strong { color:var(--ink); }
    .release { display:flex; justify-content:space-between; align-items:center; gap:28px; padding:27px; background:var(--lime); border-radius:5px; }
    .release h3 { margin:0 0 7px; font:400 25px var(--serif); letter-spacing:-.03em; }
    .release p { margin:0; color:#4f5c3b; font-size:12px; line-height:1.7; }
    .release .button { flex:none; background:var(--forest); border-color:var(--forest); }
    .footer { padding:34px 0 42px; }
    .footer-inner { display:flex; justify-content:space-between; align-items:center; gap:18px; color:#6b766c; font-size:11px; }
    .footer-links { display:flex; flex-wrap:wrap; gap:20px; }
    .footer a { text-decoration:none; }.footer a:hover { text-decoration:underline; }
    @media (max-width:760px) {
      .wrap { width:min(100% - 36px, 560px); }
      .nav { min-height:66px; }.nav-links { display:none; }
      .hero { grid-template-columns:1fr; padding:54px 0 55px; gap:34px; }
      h1 { font-size:clamp(54px, 15vw, 76px); }
      .hero-copy { font-size:15px; }
      .hero-art { min-height:340px; padding:19px; }
      .diagram { min-height:224px; }.orbit { width:190px; height:190px; }
      .ticker-inner { justify-content:flex-start; overflow:auto; min-height:55px; gap:25px; white-space:nowrap; }
      .section { padding:64px 0; }
      .section-head { grid-template-columns:1fr; gap:10px; margin-bottom:27px; }
      .section-kicker { padding:0; }
      .split, .install-layout, .model-box, .scope-grid { grid-template-columns:1fr; }
      .install-layout { gap:22px; }
      .install-side { padding:2px 0 2px 15px; }
      .requirements { grid-template-columns:1fr; }
      .requirement { display:flex; justify-content:space-between; align-items:center; gap:15px; }
      .requirement b { margin:0; text-align:right; }
      .file-tree { padding:20px; }
      .scope-grid { gap:0; }
      .release { align-items:flex-start; flex-direction:column; padding:22px; }
      .footer-inner { align-items:flex-start; flex-direction:column; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } *, *::before, *::after { transition:none !important; } }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="wrap nav">
      <a class="brand" href="/" aria-label="Afro AI home"><span class="brand-mark" aria-hidden="true">K</span> KEYO Studio</a>
      <nav class="nav-links" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a><a href="#quickstart">Quickstart</a><a href="#scope">Scope</a><a href="#release">Release</a>
      </nav>
      <a class="home-link" href="/"><span aria-hidden="true">←</span> Afro AI home</a>
    </div>
  </header>

  <main>
    <div class="wrap hero">
      <div>
        <div class="eyebrow">An open local AI workshop</div>
        <h1>Run it here.<br><em>See how.</em></h1>
        <p class="hero-copy"><strong>KEYO Studio is a local LLM/SLM runner for developers.</strong> Inspect and own model execution on your machine, powered by our JavaScript CPU inference engine—not a wrapper around Ollama, llama.cpp, or vLLM.</p>
        <div class="actions">
          <a class="button" href="/downloads/keyo-studio/afro-ai-keyo-studio-0.1.0-alpha.1.tgz">Get the source package <span class="arrow" aria-hidden="true">↓</span></a>
          <a class="button secondary" href="/api/keyo-studio/release">Release details <span class="arrow" aria-hidden="true">↗</span></a>
        </div>
        <p class="alpha-note"><strong>Developer alpha 0.1.0-alpha.1.</strong> Ugandan-built by KEYO Technologies. Includes our CPU engine, CLI and desktop workspace source, not a signed cross-platform installer or a production-readiness claim. CLI requires Node.js 20+; desktop development requires Node.js 22.12+ and Electron.</p>
        <a class="text-link" href="/keyo-studio/workspace/">Explore the workspace interface preview →</a>
        <p>Ugandan-built by KEYO Technologies, KEYO Studio aims to contribute to the AI revolution and add value to the development of AI and future superintelligence.</p>
      </div>
      <div class="hero-art" aria-label="Diagram showing a local model folder connected to a JavaScript CPU engine and localhost API">
        <div class="art-head"><span>KEYO / execution path</span><span class="alpha-tag">local · alpha</span></div>
        <div class="diagram" aria-hidden="true">
          <div class="orbit"></div>
          <span class="node n1">model files</span><span class="node n2">your prompt</span>
          <span class="node n3">localhost API</span><span class="node n4">CPU runtime</span>
          <div class="core">KEYO<br>JS ENGINE</div>
        </div>
        <div class="art-foot"><span>execution stays on your machine</span><b>NO TELEMETRY</b></div>
      </div>
    </div>

    <div class="ticker" aria-label="Product properties">
      <div class="wrap ticker-inner"><span>JavaScript CPU inference</span><span>Local model files</span><span>Versioned localhost API</span><span>No paid API</span><span>No telemetry</span></div>
    </div>

    <section class="section" id="how-it-works">
      <div class="wrap">
        <div class="section-head"><div class="section-kicker">01 / What it is</div><div><h2>A runner you can look inside.</h2><p class="section-intro">KEYO loads supported model assets from a folder you provide, runs our transformer engine on your CPU, and exposes a versioned API bound to localhost with authentication. It is a small, inspectable starting point for local AI development.</p></div></div>
        <div class="split">
          <article class="work-card"><span class="mini-label">Execution, not delegation</span><h3>Your model. Your machine.</h3><p>Prompts are processed locally. There are no cloud prompts, automatic model downloads, paid inference APIs, or telemetry. You choose which model folder to provide and can inspect the source package.</p></article>
          <article class="work-card"><span class="mini-label">A real alpha, with edges</span><h3>Early and deliberately scoped.</h3><p>The engine implements basic GPT-Neo, Qwen2 and Llama architectures. One small public Llama checkpoint has produced text locally; other families have mathematical fixture tests, not pretrained certification. Your existing Afro AI model is not yet certified.</p></article>
        </div>
      </div>
    </section>

    <section class="section" id="quickstart">
      <div class="wrap">
        <div class="section-head"><div class="section-kicker">02 / Quickstart</div><div><h2>Bring a supported model folder.</h2><p class="section-intro">Install the package on a Node.js 20+ machine, then point the CLI at model files already on disk. KEYO does not download models for you.</p></div></div>
        <div class="install-layout">
          <div>
            <div class="code-card">
              <div class="code-top"><span>TERMINAL / commands to run locally</span><button class="copy-button" id="copy-commands" type="button" aria-label="Copy command examples">Copy commands</button></div>
              <pre><code><span class="code-muted"># Node.js 20 or newer</span>
<span class="prompt">$</span> npm install -g ./afro-ai-keyo-studio-0.1.0-alpha.1.tgz
<span class="prompt">$</span> keyo inspect /path/to/model
<span class="prompt">$</span> keyo chat /path/to/model --prompt "Hello"
<span class="prompt">$</span> keyo serve /path/to/model</code></pre>
              <div class="code-hint" id="copy-status" aria-live="polite">These are usage examples, not a live terminal. Download the source package first and run commands from your own environment.</div>
            </div>
            <div class="requirements" aria-label="Requirements">
              <div class="requirement"><small>Runtime</small><b>Node.js ≥ 20</b></div>
              <div class="requirement"><small>Execution</small><b>Our CPU engine</b></div>
              <div class="requirement"><small>Model source</small><b>Local folder</b></div>
            </div>
          </div>
          <aside class="install-side"><strong>Model files are not bundled.</strong> Use a model folder containing <code>config.json</code>, <code>tokenizer.json</code>, and <code>model.safetensors</code>. Confirm you have the rights to use your chosen model and its files.</aside>
        </div>
      </div>
    </section>

    <section class="section" id="model-format">
      <div class="wrap">
        <div class="section-head"><div class="section-kicker">03 / Input contract</div><div><h2>Keep the model folder explicit.</h2><p class="section-intro">The alpha expects these files to already exist together in a supported local model directory. Missing files or incompatible model configs can prevent a model from loading.</p></div></div>
        <div class="model-box">
          <div class="model-copy"><h3>What you provide</h3><p>A compatible model directory prepared for the current loader. Single safetensors checkpoint and decoded weights are each limited to 256 MiB; context is limited to 512 tokens. This is not yet a larger-model release. KEYO does not bundle weights, fetch assets in the background, or send prompts to a cloud service.</p></div>
          <div class="file-tree" aria-label="Required local model folder contents"><div class="tree-heading">/path/to/model</div><div>├── <span class="required">config.json</span></div><div>├── <span class="required">tokenizer.json</span></div><div>└── <span class="required">model.safetensors</span></div><p class="tree-note">Required files · local only · not included in the package</p></div>
        </div>
      </div>
    </section>

    <section class="section" id="scope">
      <div class="wrap">
        <div class="section-head"><div class="section-kicker">04 / Scope & boundaries</div><div><h2>Know what this release does—and doesn’t.</h2><p class="section-intro">We’d rather name the edges clearly than imply broad compatibility. The alpha is a focused local execution experiment for developers.</p></div></div>
        <div class="scope-grid">
          <div class="scope-row"><span class="scope-icon" aria-hidden="true">+</span><div><strong>In this alpha</strong><p>Basic GPT-Neo, Qwen2 and Llama execution using our JavaScript CPU engine, with explicitly limited variants and model sizes.</p></div></div>
          <div class="scope-row"><span class="scope-icon no" aria-hidden="true">−</span><div><strong>Not included: GPU</strong><p>GPU acceleration is roadmap work, not a capability of this release.</p></div></div>
          <div class="scope-row"><span class="scope-icon" aria-hidden="true">+</span><div><strong>Local asset loading</strong><p>Safetensors weights and BPE/tokenizer assets from a provided model folder.</p></div></div>
          <div class="scope-row"><span class="scope-icon no" aria-hidden="true">−</span><div><strong>Not included: GGUF or larger models</strong><p>Quantization, sharded checkpoints and large-model certification remain future work.</p></div></div>
          <div class="scope-row"><span class="scope-icon" aria-hidden="true">+</span><div><strong>Authenticated localhost API</strong><p>A versioned API intended for local development and inspection.</p></div></div>
          <div class="scope-row"><span class="scope-icon no" aria-hidden="true">−</span><div><strong>Not included: fine-tuning</strong><p>Training and fine-tuning are not part of this alpha.</p></div></div>
          <div class="scope-row"><span class="scope-icon" aria-hidden="true">+</span><div><strong>No paid API, no telemetry</strong><p>Execution stays local; there is no cloud prompt service or telemetry collection.</p></div></div>
          <div class="scope-row"><span class="scope-icon no" aria-hidden="true">−</span><div><strong>Signed installers still in development</strong><p>The source includes an Electron desktop workspace using our own engine. GPU inference, larger models and verified Windows/macOS installers are not ready.</p></div></div>
        </div>
        <div class="boundary-note"><strong>Alpha caution:</strong> Local execution does not automatically make every workflow secure or production-ready. Review the source, keep the authenticated API on localhost, and evaluate the model and its license before use.</div>
      </div>
    </section>

    <section class="section" id="release">
      <div class="wrap">
        <div class="section-head"><div class="section-kicker">05 / Get the alpha</div><div><h2>Start with the source package.</h2><p class="section-intro">Get version 0.1.0-alpha.1, inspect what you’re installing, and try it with a supported model folder on Node.js 20 or newer.</p></div></div>
        <div class="release">
          <div><h3>KEYO Studio 0.1.0-alpha.1</h3><p>Early developer alpha · Source package · Model weights not included</p></div>
          <div class="actions" style="margin:0">
            <a class="button" href="/downloads/keyo-studio/afro-ai-keyo-studio-0.1.0-alpha.1.tgz">Download source <span class="arrow" aria-hidden="true">↓</span></a>
            <a class="button secondary" href="/api/keyo-studio/release">Release API <span class="arrow" aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
    </section>
  </main>
  <footer class="footer">
    <div class="wrap footer-inner">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">K</span> KEYO Studio</a>
      <div>Open local execution, one alpha at a time.</div>
      <div class="footer-links"><a href="/">Afro AI home</a><a href="/api/keyo-studio/release">Release details</a><a href="/downloads/keyo-studio/afro-ai-keyo-studio-0.1.0-alpha.1.tgz">Source package</a><a href="/downloads/keyo-studio/keyo-studio-github-upload.zip">GitHub upload ZIP</a></div>
    </div>
  </footer>
  <script>
    (function () {
      var button = document.getElementById("copy-commands");
      var status = document.getElementById("copy-status");
      var commands = "npm install -g ./afro-ai-keyo-studio-0.1.0-alpha.1.tgz\\nkeyo inspect /path/to/model\\nkeyo chat /path/to/model --prompt \\"Hello\\"\\nkeyo serve /path/to/model";
      if (!button || !status) return;
      function fallbackCopy() {
        var field = document.createElement("textarea");
        field.value = commands;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.left = "-9999px";
        document.body.appendChild(field);
        field.select();
        var copied = false;
        try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
        document.body.removeChild(field);
        return copied;
      }
      button.addEventListener("click", function () {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(commands).then(function () {
            status.textContent = "Commands copied. Run them in your own terminal after downloading the package.";
            button.textContent = "Copied";
          }).catch(function () {
            var copied = fallbackCopy();
            status.textContent = copied ? "Commands copied. Run them in your own terminal after downloading the package." : "Copy was unavailable. Select the commands above to copy them manually.";
            button.textContent = copied ? "Copied" : "Select to copy";
          });
          return;
        }
        var copied = fallbackCopy();
        status.textContent = copied ? "Commands copied. Run them in your own terminal after downloading the package." : "Copy was unavailable. Select the commands above to copy them manually.";
        button.textContent = copied ? "Copied" : "Select to copy";
      });
    }());
  </script>
</body>
</html>`;
}
