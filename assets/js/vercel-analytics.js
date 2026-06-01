(function(){
  const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
  const hostedHttp = (location.protocol === 'http:' || location.protocol === 'https:') && !localHosts.includes(location.hostname);
  if(!hostedHttp)return;
  window.va = window.va || function(){
    (window.vaq = window.vaq || []).push(arguments);
  };
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
})();
