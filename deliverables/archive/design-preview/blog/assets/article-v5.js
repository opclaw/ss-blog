(function(){
  var d=document,root=d.documentElement,text=d.querySelector('.bl-text'),bar=d.querySelector('.bl-progress i'),left=d.querySelector('.js-left');
  var links=[].slice.call(d.querySelectorAll('.bl-toc a')),heads=links.map(function(a){return d.getElementById(a.hash.slice(1))});
  var total=text?Math.max(1,Math.round(text.innerText.split(/\s+/).length/180)):1;
  function tick(){
    if(!text)return;var r=text.getBoundingClientRect(),p=Math.min(1,Math.max(0,-r.top/(r.height-innerHeight*.6)));
    bar.style.width=p*100+'%';
    if(left)left.textContent=p>.97?'дочитано':'осталось ~'+Math.max(1,Math.round(total*(1-p)))+' мин';
    var c=-1;heads.forEach(function(h,i){if(h&&h.getBoundingClientRect().top<160)c=i});
    links.forEach(function(a,i){a.classList.toggle('on',i===c)});
  }
  addEventListener('scroll',tick,{passive:true});addEventListener('resize',tick);tick();
  d.querySelectorAll('[data-toggle-read]').forEach(function(b){b.onclick=function(){
    var p=root.dataset.read==='paper';if(p)delete root.dataset.read;else root.dataset.read='paper';
    try{p?localStorage.removeItem('read'):localStorage.setItem('read','paper')}catch(e){}
  }});
  d.querySelectorAll('.bl-prompt button').forEach(function(b){b.onclick=function(){
    navigator.clipboard.writeText(b.closest('.bl-prompt').querySelector('pre').innerText).then(function(){b.textContent='скопировано';setTimeout(function(){b.textContent='копировать'},1600)})
  }});
  var nav=d.querySelector('.bl-nav'),bg=d.querySelector('.bl-burger');
  bg.onclick=function(){var o=nav.classList.toggle('open');bg.setAttribute('aria-expanded',o)};
  nav.querySelectorAll('.bl-menu a').forEach(function(a){a.addEventListener('click',function(){nav.classList.remove('open')})});
})();
