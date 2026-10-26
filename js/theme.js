export function initTheme(){
  const saved=localStorage.getItem("maihoc-theme");
  const dark=saved ? saved==="dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  setTheme(!!dark);
  document.querySelector("#theme-toggle").addEventListener("click",()=>setTheme(!document.documentElement.classList.contains("dark")));
}
export function setTheme(dark){
  document.documentElement.classList.toggle("dark",dark);
  document.documentElement.classList.toggle("light",!dark);
  localStorage.setItem("maihoc-theme",dark?"dark":"light");
  const btn=document.querySelector("#theme-toggle");
  if(btn) btn.innerHTML=`${dark?"☀":"☾"} <span class="button-label">${dark?"Light mode":"Dark mode"}</span>`;
}
