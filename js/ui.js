export const $=(sel,root=document)=>root.querySelector(sel);
export const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
export function escapeHTML(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
export function toast(message,type=""){
  const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;
  $("#toast-region").append(el);setTimeout(()=>el.remove(),3800);
}
export function openDialog(id){const d=$("#"+id);if(d&&!d.open)d.showModal();}
export function closeDialog(id){const d=$("#"+id);if(d?.open)d.close();}
export function pageHeading(title,subtitle="",actions=""){return `<div class="page-heading"><div><div class="breadcrumb"><button data-route="home">Trang chủ</button><span> / </span><span>${escapeHTML(title)}</span></div><h1 class="page-title">${escapeHTML(title)}</h1>${subtitle?`<p>${escapeHTML(subtitle)}</p>`:""}</div>${actions}</div>`;}
