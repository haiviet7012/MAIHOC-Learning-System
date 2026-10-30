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
  if(btn){
    const icon=dark?"☾":"☀";
    const title=dark?"Giao diện Tối (Nhấn để chuyển sang Sáng)":"Giao diện Sáng (Nhấn để chuyển sang Tối)";
    btn.setAttribute("aria-label",title);
    btn.title=title;
    btn.innerHTML=`<span class="theme-toggle-icon" aria-hidden="true">${icon}</span>`;
  }
}
