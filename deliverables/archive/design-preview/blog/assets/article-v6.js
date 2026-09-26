(function(){
  'use strict';
  var d=document,$=function(s,r){return (r||d).querySelector(s)},$$=function(s,r){return [].slice.call((r||d).querySelectorAll(s))};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* прогресс, наверх, оглавление, «осталось» — как script.js сайта */
  var prog=$('#scrollProgress'),top=$('#backToTop'),text=$('.bl-text'),left=$('#readLeft');
  var toc=$$('.bl-toc a[href^="#sec-"]').map(function(a){return {a:a,h:d.getElementById(a.hash.slice(1))}}).filter(function(x){return x.h});
  var total=Math.max(1,Math.round(text.innerText.split(/\s+/).length/180));
  function onScroll(){
    var y=scrollY,h=d.documentElement.scrollHeight-innerHeight;prog.style.width=(h>0?y/h*100:0)+'%';
    top.classList.toggle('visible',y>500);
    var act=null;toc.forEach(function(x){if(x.h.offsetTop<=y+120)act=x});toc.forEach(function(x){x.a.classList.toggle('active',x===act)});
    var r=text.getBoundingClientRect(),p=Math.min(1,Math.max(0,-r.top/(r.height-innerHeight)));
    if(left)left.textContent=p>.97?'дочитано':'осталось ~'+Math.max(1,Math.round(total*(1-p)))+' мин';
  }
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);onScroll();
  top.onclick=function(){scrollTo({top:0,behavior:'smooth'})};

  /* мобильное меню — те же id, что на сайте */
  var bg=$('#navBurger'),mm=$('#mobileMenu');
  bg.onclick=function(){var o=!bg.classList.contains('active');bg.classList.toggle('active',o);mm.classList.toggle('open',o);d.body.classList.toggle('menu-open',o);bg.setAttribute('aria-expanded',o)};
  $$('.mobile-link',mm).forEach(function(a){a.addEventListener('click',function(){bg.classList.remove('active');mm.classList.remove('open');d.body.classList.remove('menu-open')})});

  /* запуск, когда блок появился на экране */
  function onView(el,fn){if(!el)return;var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){fn();io.disconnect()}},{threshold:.35});io.observe(el)}

  /* Рис.1 — чат-бот и агент */
  var demo=$('[data-demo]');
  if(demo){
    var scr=$('.bl-screen',demo),note=$('[data-note]',demo),timers=[];
    var S={
      bot:{note:'Бот ведёт клиента по кнопкам. Всё, что за пределами сценария, — «передаю менеджеру», а дальше менеджер делает работу вручную.',
        items:[['u','Здравствуйте, нужно внедрить ИИ для обработки заявок, сколько стоит?'],['b','Здравствуйте! Выберите тему:',['Цены','Сроки','Связаться с менеджером']],['u','Цены'],['b','Стоимость зависит от проекта. Оставьте телефон, менеджер перезвонит.']]},
      agent:{note:'Агент сам проходит шаги в CRM и почте и останавливается там, где нужно решение человека.',
        items:[['l','08:02','новая заявка · форма на сайте','acc'],['l','08:02','тип: покупка · срочность: высокая',''],['l','08:03','клиент найден в CRM · 2 прошлых обращения','ok'],['l','08:03','цены взяты из базы знаний',''],['l','08:04','черновик ответа готов','ok'],['l','08:04','ждёт проверки менеджера','h']]}
    };
    function esc(s){return s.replace(/</g,'&lt;')}
    function play(k){
      timers.forEach(clearTimeout);timers=[];scr.innerHTML='';note.textContent=S[k].note;
      $$('.bl-tabs button',demo).forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===k)});
      S[k].items.forEach(function(it,i){timers.push(setTimeout(function(){
        var el=d.createElement('div');
        if(it[0]==='l'){el.className='bl-log '+it[3];el.innerHTML='<time>'+it[1]+'</time><b>'+esc(it[2])+'</b>'}
        else{el.className='bl-msg '+it[0];el.innerHTML=esc(it[1])+(it[2]?'<div class="opts">'+it[2].map(function(o){return '<i>'+o+'</i>'}).join('')+'</div>':'')}
        scr.appendChild(el);
      },reduce?0:i*650))});
    }
    $$('.bl-tabs button',demo).forEach(function(b){b.onclick=function(){play(b.dataset.tab)}});
    onView(demo,function(){play('bot');if(!reduce)timers.push(setTimeout(function(){if($('.bl-tabs [data-tab=bot]',demo).getAttribute('aria-selected')==='true')play('agent')},5200))});
  }

  /* Рис.2 — цикл */
  var loop=$('[data-loop]');
  if(loop){
    var steps=[
      ['Агент читает задачу и собирает контекст: что за клиент, какая история обращений, что написано в регламенте.','читает: заявку · карточку в CRM · регламент'],
      ['Решает, какие шаги нужны и в каком порядке. Этого ему заранее никто не расписывает.','план: найти клиента → определить тип → подготовить ответ'],
      ['Выполняет шаги через доступные программы: ищет, заполняет, пишет черновики.','инструменты: CRM · почта · таблицы · 1С'],
      ['Сверяет результат с правилами и базой знаний. Не прошло — ещё круг. Не уверен — передаёт человеку.','проверка: цены из прайса? все поля? можно ли отправлять?']
    ];
    var btn=$$('[data-step]',loop),tx=$('[data-loop-text]',loop),tl=$('[data-loop-tools]',loop),bar=$('.bl-loop-track span',loop),cur=0,auto=null;
    function set(i){cur=i;btn.forEach(function(b,j){b.classList.toggle('on',j===i)});tx.textContent=steps[i][0];tl.textContent=steps[i][1];bar.style.transform='translateX('+i*100+'%)'}
    btn.forEach(function(b,i){b.onclick=function(){clearInterval(auto);auto=null;set(i)}});
    set(0);
    onView(loop,function(){if(!reduce)auto=setInterval(function(){set((cur+1)%4)},2600)});
  }

  /* калькулятор */
  var calc=$('[data-calc]');
  if(calc){
    var fmt=function(n){return Math.round(n).toLocaleString('ru-RU')};
    function upd(){
      var v={};$$('[data-i]',calc).forEach(function(i){v[i.dataset.i]=+i.value;$('[data-o="'+i.dataset.i+'"]',calc).textContent=fmt(+i.value)});
      var saved=Math.max(0,v.a-v.b),h=v.n*saved*22/60;
      $('[data-r=h]',calc).textContent=fmt(h);
      $('[data-r=fte]',calc).textContent=(h/168).toLocaleString('ru-RU',{maximumFractionDigits:1});
      $('[data-r=rub]',calc).textContent=fmt(h*v.r);
      $('[data-r=bar]',calc).style.width=Math.min(100,h/(168*3)*100)+'%';
    }
    $$('input',calc).forEach(function(i){i.addEventListener('input',upd)});upd();
  }

  /* столбики */
  var bars=$('[data-bars]');onView(bars,function(){bars.classList.add('in')});

  /* чек-лист */
  var ch=$('[data-check]');
  if(ch){
    var boxes=$$('input',ch),m=$('[data-meter]',ch),vd=$('[data-verdict]',ch);
    var V=['Отметьте пункты — покажем, с чего начать.','Рано для агента: начните с описания процесса и замера времени.','Рано для агента: начните с описания процесса и замера времени.','Почти готово: закройте недостающие пункты — это 1–2 недели подготовки.','Можно начинать пилот на 2–4 недели.','Процесс готов. Можно начинать пилот на 2–4 недели.'];
    function u(){var n=boxes.filter(function(b){return b.checked}).length;m.style.width=n*20+'%';m.style.background=n>=4?'var(--green)':n>=3?'#D97706':'var(--red)';vd.textContent=(n?n+' из 5 — ':'')+V[n]}
    boxes.forEach(function(b){b.addEventListener('change',u)});
  }

  /* копирование промпта */
  $$('.bl-prompt button').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText($('pre',b.closest('.bl-prompt')).innerText).then(function(){b.textContent='скопировано';setTimeout(function(){b.textContent='копировать'},1600)})}});
})();
