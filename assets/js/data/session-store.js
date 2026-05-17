(function(){
  function getString(key, defaultValue=''){try{const value = window.localStorage.getItem(key); return value == null ? defaultValue : value;}catch{return defaultValue;}}
  function setString(key, value){try{window.localStorage.setItem(key, String(value ?? ''));}catch{} return value;}
  function getJSON(key, defaultValue=null){try{const raw=window.localStorage.getItem(key); return raw ? JSON.parse(raw) : defaultValue;}catch{return defaultValue;}}
  function setJSON(key, value){try{window.localStorage.setItem(key, JSON.stringify(value));}catch{} return value;}
  function remove(key){try{window.localStorage.removeItem(key);}catch{}}
  window.RestogogoSessionStore={getString,setString,getJSON,setJSON,remove};
})();
