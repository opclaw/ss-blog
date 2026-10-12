// reading.js — прогресс, активный раздел, «осталось N мин», светлый лист, копирование, мобильное меню
(function(){
  var d=document, root=d.documentElement;
  var bar=d.querySelector('.read-progress i'), content=d.querySelector('.article-content');
  var links=[].slice.call(d.querySelectorAll('.article-aside-left a[href^="#"]'));
  var heads=links.map(function(a){return d.querySelector(a.getAttribute('href'))});
  var left=d.querySelector('.js-left');
  var words=content?content.innerText.split(/\s+/).length:0, total=Math.max(1,Math.round(words/180));
  function tick(){
    if(!content)return;
    var r=content.getBoundingClientRect(), p=Math.min(1,Math.max(0,-r.top/(r.height-innerHeight)));
    if(bar)bar.style.width=(p*100)+'%';
    if(left){var m=Math.round(total*(1-p)); left.textContent=p>.97?'дочитано':'осталось ~'+Math.max(1,m)+' мин';}
    var cur=-1; heads.forEach(function(h,i){if(h&&h.getBoundingClientRect().top<140)cur=i});
    links.forEach(function(a,i){a.classList.toggle('active',i===cur)});
  }
  addEventListener('scroll',tick,{passive:true}); tick();

  function label(){d.querySelectorAll('.js-read-label').forEach(function(l){l.textContent=root.dataset.read==='paper'?'тёмная тема':'светлый лист'})}
  d.querySelectorAll('[data-toggle-read]').forEach(function(b){b.addEventListener('click',function(){
    if(root.dataset.read==='paper'){delete root.dataset.read;try{localStorage.removeItem('read')}catch(e){}}
    else{root.dataset.read='paper';try{localStorage.setItem('read','paper')}catch(e){}}
    label();
  })}); label();

  d.querySelectorAll('.prompt button').forEach(function(b){b.addEventListener('click',function(){
    navigator.clipboard.writeText(b.closest('.prompt').querySelector('pre').innerText).then(function(){
      b.textContent='скопировано';setTimeout(function(){b.textContent='копировать'},1600)})
  })});

  var burger=d.querySelector('.nav-burger'), menu=d.querySelector('.mobile-menu');
  if(burger&&menu){burger.addEventListener('click',function(){burger.classList.toggle('active');menu.classList.toggle('open');d.body.classList.toggle('menu-open')});
    menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){burger.classList.remove('active');menu.classList.remove('open');d.body.classList.remove('menu-open')})});}
})();
