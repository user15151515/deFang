/* ===============================
   deFang · App (Firestore compat)
   =============================== */

// ---- Firebase (compat) ----
const firebaseConfig = {
  apiKey: "AIzaSyC2wuZ7AfgMyxyV_rJBro81PscHAe0D0Ns",
  authDomain: "defang-9f522.firebaseapp.com",
  projectId: "defang-9f522",
  storageBucket: "defang-9f522.firebasestorage.app",
  messagingSenderId: "633221354524",
  appId: "1:633221354524:web:b034abe2486a0bac88bbd9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
let isAuthed = false;

// Col·lecció segons rules
const PKG_ID = "defang";
const itemsCol = db.collection("packages").doc(PKG_ID).collection("items");

// ---- Utils ----
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const fmtEUR = (n) =>
  (n ?? 0).toLocaleString("ca-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const yyyyMM = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const monthName = (m) => ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"][m-1];
const formatMonth = (ym) => { const [y,m]=ym.split("-").map(Number); return `${monthName(m)} ${y}`; };
const daysInMonth = (y,m) => new Date(y, m, 0).getDate();
function dateInsideActiveMonth(ym){
  const [y,m] = ym.split("-").map(Number);
  const today = new Date();
  const day = (today.getFullYear()===y && (today.getMonth()+1)===m) ? today.getDate() : 1;
  return new Date(y, m-1, Math.min(day, daysInMonth(y,m)));
}
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2200); }
function escapeHtml(s){ return (s||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

// ---- Estat ----
let unsub = { incomeTpl:null, expenseTpl:null, incomeEntries:null, expenseEntries:null };
const state = {
  activeMonth: yyyyMM(new Date()),
  incomeEntries: [],
  expenseEntries: [],
  incomeTpls: [],
  expenseTpls: []
};

// ---- Render ----
function renderTemplates(list, containerEl, type){
  containerEl.innerHTML = "";
  if(!list.length){ containerEl.innerHTML = `<div class="hint">Encara no hi ha plantilles. Crea’n una amb “+ Nova plantilla”.</div>`; return; }
  for(const t of list){
    const el = document.createElement("div");
    el.className = "tpl";
    el.innerHTML = `
      <div class="tpl-head">
        <div class="tpl-thumb">${t.imageUrl ? `<img src="${t.imageUrl}" alt="">` : iconClay()}</div>
        <div>
          <div class="tpl-title">${escapeHtml(t.title)}</div>
          <div class="tpl-price">${fmtEUR(t.defaultPrice)}</div>
        </div>
      </div>
      <div class="tpl-actions">
        <button class="btn icon" data-action="use">Usar</button>
        <button class="btn icon" data-action="del">Eliminar</button>
      </div>`;
    el.querySelector('[data-action="use"]').addEventListener("click",()=>openUseTplDialog(t,type));
    el.querySelector('[data-action="del"]').addEventListener("click",async()=>{
      
      if(confirm("Vols eliminar aquesta plantilla?")){ await itemsCol.doc(t.id).delete(); toast("Plantilla eliminada"); }
    });
    containerEl.appendChild(el);
  }
}

function renderEntries(list, tbodyEl, totalEl, opts = {}) {
  const showPay = !!opts.showPay; // només per ingressos
  tbodyEl.innerHTML = "";
  let total = 0;

  if (!list.length) {
    const colspan = showPay ? 6 : 5;
    tbodyEl.innerHTML = `<tr><td colspan="${colspan}" class="hint">Cap registre aquest mes.</td></tr>`;
    totalEl.textContent = fmtEUR(0);
    return;
  }

  for (const it of list) {
    total += Number(it.price) || 0;

    const dateTxt = toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date));
    const titleTxt = escapeHtml(it.title);
    const priceTxt = fmtEUR(it.price);
    const notesTxt = escapeHtml(it.notes || "");
    const payTxt = showPay
      ? (it.paymentMethod === 'efectiu' ? 'Efectiu'
         : it.paymentMethod === 'targeta' ? 'Targeta'
         : '—')
      : null;

    const cells = [
      `<td>${dateTxt}</td>`,
      `<td>${titleTxt}</td>`,
      `<td>${priceTxt}</td>`,
      ...(showPay ? [`<td>${payTxt}</td>`] : []),
      `<td>${notesTxt}</td>`,
      `<td class="row-actions">
         <button class="btn icon" data-action="edit" title="Editar">${iconEdit()}</button>
         <button class="btn icon" data-action="del" title="Eliminar">${iconTrash()}</button>
       </td>`
    ].join("");

    const tr = document.createElement("tr");
    tr.innerHTML = cells;

    tr.querySelector('[data-action="del"]').addEventListener("click", async () => {
      if (confirm("Vols eliminar aquest registre?")) {
        await itemsCol.doc(it.id).delete();
        toast("Registre eliminat");
      }
    });
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => editEntry(it));
    tbodyEl.appendChild(tr);
  }

  totalEl.textContent = fmtEUR(total);
}

function renderAllForActiveMonth(){
  const m = state.activeMonth;
  // etiquetes de mes
  $("#monthIncomeText").textContent  = formatMonth(m);
  $("#monthExpenseText").textContent = formatMonth(m);
  $("#monthSummaryText").textContent = formatMonth(m);

  // taules
  const incList = state.incomeEntries.filter(e=>e.monthKey===m);
  const expList = state.expenseEntries.filter(e=>e.monthKey===m);
renderEntries(incList, $("#incomeTableBody"), $("#incomeTotal"), { showPay: true });
  renderEntries(expList, $("#expenseTableBody"), $("#expenseTotal"));

  // resum
  const inc = incList.reduce((s,e)=>s+(Number(e.price)||0),0);
  const exp = expList.reduce((s,e)=>s+(Number(e.price)||0),0);
  $("#sumIncome").textContent  = fmtEUR(inc);
  $("#sumExpense").textContent = fmtEUR(exp);
  document.getElementById("incomeChip").textContent  = fmtEUR(inc);
document.getElementById("expenseChip").textContent = fmtEUR(exp);

  $("#sumBalance").textContent = fmtEUR(inc-exp);
  

  // dates per defecte dins el mes actiu
  const d = dateInsideActiveMonth(m);
  $("#incomeDate").value  = toDateInput(d);
  $("#expenseDate").value = toDateInput(d);

  // header picker en sincronia
  $("#activeMonthPicker").value = m;
  // Actualitza el badge d'any al costat dels botons d'exportació
const yrBadge = document.getElementById("exportYearBadge");
if (yrBadge) {
  const [yr] = m.split("-");
  yrBadge.textContent = `ANY ${yr}`;
}

  const label = document.getElementById("activeMonthLabel");
if (label) label.textContent = formatMonth(m);
}

// ---- Subscripcions ----
function subscribeTemplates(){
  if (unsub.incomeTpl) unsub.incomeTpl();
  if (unsub.expenseTpl) unsub.expenseTpl();

  unsub.incomeTpl = itemsCol.where("kind","==","ingres-template")
    .onSnapshot(s=>{ state.incomeTpls = s.docs.map(d=>({id:d.id,...d.data()})); renderTemplates(state.incomeTpls,$("#incomeTplList"),"ingres"); });

  unsub.expenseTpl = itemsCol.where("kind","==","despesa-template")
    .onSnapshot(s=>{ state.expenseTpls = s.docs.map(d=>({id:d.id,...d.data()})); renderTemplates(state.expenseTpls,$("#expenseTplList"),"despesa"); });
}

function subscribeEntries(){
  if (unsub.incomeEntries) unsub.incomeEntries();
  if (unsub.expenseEntries) unsub.expenseEntries();

  unsub.incomeEntries = itemsCol.where("kind","==","ingres-entry")
    .onSnapshot(s=>{
      state.incomeEntries = s.docs.map(d=>({id:d.id,...d.data()}));
      renderAllForActiveMonth();
    });

  unsub.expenseEntries = itemsCol.where("kind","==","despesa-entry")
    .onSnapshot(s=>{
      state.expenseEntries = s.docs.map(d=>({id:d.id,...d.data()}));
      renderAllForActiveMonth();
    });

  
}

// ---- Formularis ----
function setupForms(){
  // Mes actiu al header
  
  $("#activeMonthPicker").value = state.activeMonth;
  $("#activeMonthPicker").addEventListener("change",(e)=>{

    state.activeMonth = e.target.value;
    renderAllForActiveMonth();   // <-- tot es recalcula
  });
// millora UI selector de mes (fletxes + etiqueta clicable)
const labelBtn = document.getElementById("activeMonthLabel");
const prevBtn  = document.getElementById("prevMonth");
const nextBtn  = document.getElementById("nextMonth");

function shiftMonth(delta){
  const [y,m] = state.activeMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.activeMonth = yyyyMM(d);
  renderAllForActiveMonth();
}

labelBtn.addEventListener("click", ()=>{
  const inp = document.getElementById("activeMonthPicker");
  if (inp.showPicker) inp.showPicker(); else inp.click();
});
prevBtn.addEventListener("click", ()=>shiftMonth(-1));
nextBtn.addEventListener("click", ()=>shiftMonth(+1));

  // Dates per defecte
  const d = dateInsideActiveMonth(state.activeMonth);
  $("#incomeDate").value  = toDateInput(d);
  $("#expenseDate").value = toDateInput(d);

  const incomePayInput = $("#incomePay"); // <input type="hidden" ...> al formulari
const payChips = $$("#incomePayChips .chip.opt");
if (incomePayInput && payChips.length){
  payChips.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      payChips.forEach(b=>b.classList.remove("selected"));
      btn.classList.add("selected");
      incomePayInput.value = btn.dataset.value; // 'efectiu' | 'targeta'
    });
  });
}

  // Afegir ingrés
  $("#incomeForm").addEventListener("submit", async (ev)=>{
  ev.preventDefault();
  const title = $("#incomeTitle").value.trim();
  const price = Number($("#incomePrice").value || 0);
  const dateStr = $("#incomeDate").value;
  const notes = $("#incomeNotes").value.trim();
  const paymentMethod = $("#incomePay").value || "targeta"; // ✅ AFEGIT

  if (!title || !dateStr) return;
  const date = new Date(dateStr);
  await itemsCol.add({
    kind: "ingres-entry",
    title, price,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    notes,
    paymentMethod, // ✅ AFEGIT
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
    $("#incomeForm").reset();
    $("#incomeDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
    toast("Ingrés desat");
  });

  // Afegir despesa
  $("#expenseForm").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const title = $("#expenseTitle").value.trim();
    const price = Number($("#expensePrice").value||0);
    const dateStr = $("#expenseDate").value;
    const notes = $("#expenseNotes").value.trim();
    if(!title||!dateStr) return;
    const date = new Date(dateStr);
    await itemsCol.add({
      kind:"despesa-entry", title, price,
      date: firebase.firestore.Timestamp.fromDate(date),
      monthKey: yyyyMM(date),
      notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $("#expenseForm").reset();
    $("#expenseDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
    toast("Despesa desada");
  });

  // Nova plantilla
  $("#openIncomeTpl").addEventListener("click",()=>openTplDialog("ingres"));
  $("#openExpenseTpl").addEventListener("click",()=>openTplDialog("despesa"));
// Cancel·lar nova plantilla sense validar
const cancelTplBtn = document.getElementById("cancelTplBtn");
if (cancelTplBtn){
  cancelTplBtn.addEventListener("click", ()=>{
    document.getElementById("tplDialog").close();
  });
}

  // Exportar Excel anual
  $("#exportExcelBtn").addEventListener("click", exportYearExcel);

  document.getElementById("exportPdfBtn").addEventListener("click", exportYearPDF);
async function getLogoDataURL(){
  return new Promise((resolve)=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d").drawImage(img,0,0);
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        // canvas “tainted” → seguim sense logo
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "assets/logo.png";
  });
}


function eur(n){ return (Number(n)||0).toFixed(2).replace('.',',') + " €"; }

async function exportYearPDF(){
  // Any actiu i files de la taula
  const [yearStr] = state.activeMonth.split("-");
  const months = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];
  const rows = months.map((name,i)=>{
    const key = `${yearStr}-${String(i+1).padStart(2,"0")}`;
    const inc = state.incomeEntries.filter(e=>e.monthKey===key).reduce((s,e)=>s+(Number(e.price)||0),0);
    const exp = state.expenseEntries.filter(e=>e.monthKey===key).reduce((s,e)=>s+(Number(e.price)||0),0);
    return [name, eur(inc), eur(exp), eur(inc-exp)];
  });

  // Crea el PDF
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert("jsPDF no carregat. Revisa els <script> de jspdf i autotable."); return; }
  const doc = new jsPDF({ unit:"pt", format:"a4" });

  // Estil i marges
  const brand  = [201,106,74]; // terracota
  const margin = 40;

  // Logo (si està disponible)
  const logo = await getLogoDataURL(); // ja la tens definida a dalt
  const pageW = doc.internal.pageSize.getWidth();
  const logoW = 120, logoH = 44;

  // Logo a dalt a la dreta
  if (logo) doc.addImage(logo, "PNG", pageW - margin - logoW, margin, logoW, logoH);

  // Títol a l'esquerra
  doc.setFont("helvetica","bold");
  doc.setFontSize(18);
  doc.setTextColor(brand[0],brand[1],brand[2]);
  doc.text(`Resum anual ${yearStr}`, margin, margin + 24);

  // KPIs anuals sota el títol
  const incYear = state.incomeEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`)).reduce((s,e)=>s+(Number(e.price)||0),0);
  const expYear = state.expenseEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`)).reduce((s,e)=>s+(Number(e.price)||0),0);
  const balYear = incYear - expYear;

  doc.setFont("helvetica","normal");
  doc.setFontSize(12);
  doc.setTextColor(60);
  const yKPIs = margin + 40;
  doc.text(`Ingressos: ${eur(incYear)}   ·   Despeses: ${eur(expYear)}   ·   Balanç: ${eur(balYear)}`, margin, yKPIs);

  // Taula (comença sota títol i sota logo)
  const startY = Math.max(yKPIs + 16, margin + logoH + 16);
  doc.autoTable({
    head: [["Mes","Ingressos","Despeses","Balanç"]],
    body: rows,
    startY,
    styles: { halign: 'right', font: 'helvetica', fontSize: 11 },
    headStyles: { fillColor: brand, halign:'center', valign:'middle', fontStyle:'bold', textColor: 255 },
    columnStyles: { 0: { halign: 'left' } },
    theme: 'grid',
    margin: { left: margin, right: margin }
  });

  doc.save(`deFang_${yearStr}.pdf`);
  toast("PDF generat");
}


// LOGIN
const loginForm = document.getElementById("loginForm");
if (loginForm){
  loginForm.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pass  = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    try{
      await auth.signInWithEmailAndPassword(email, pass);
    }catch(e){
      errEl.textContent = "Credencials incorrectes o usuari inexistent.";
    }
  });
}

// LOGOUT
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn){
  logoutBtn.addEventListener("click", ()=> auth.signOut());
}


}

// ---- Plantilles ----
function openTplDialog(type){
  $("#tplDialogTitle").textContent = type==="ingres" ? "Nova plantilla d’ingrés" : "Nova plantilla de despesa";
  $("#tplType").value = type;
  $("#tplTitle").value = "";
  $("#tplPrice").value = "";
  $("#tplImage").value = "";
  $("#tplDialog").showModal();
  $("#saveTplBtn").onclick = async (e)=>{ e.preventDefault(); await saveTemplate(); };
}

async function saveTemplate(){
  const type  = $("#tplType").value;  // ingres | despesa
  const title = $("#tplTitle").value.trim();
  const price = Number($("#tplPrice").value||0);
  const file  = $("#tplImage").files[0];
  if(!title) return;

  let imageUrl = null;
  if(file){
    const path = `template-images/${Date.now()}_${file.name}`;
    const ref = storage.ref().child(path);
    await ref.put(file);
    imageUrl = await ref.getDownloadURL();
  }

  await itemsCol.add({
    kind: type==="ingres" ? "ingres-template" : "despesa-template",
    title,
    defaultPrice: price,
    imageUrl,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("#tplDialog").close();
  toast("Plantilla desada");
}

let _tplToUse = null;
function openUseTplDialog(tpl,type){
  _tplToUse = { tpl, type };
  $("#useTplTitle").textContent = `Afegir ${type==="ingres"?"ingrés":"despesa"}: ${tpl.title}`;
  $("#useTplPrice").value = (tpl.defaultPrice ?? 0);
  $("#useTplDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
  $("#useTplDialog").showModal();
  $("#confirmUseTpl").onclick = async (e)=>{ e.preventDefault(); await confirmUseTpl(); };
}

async function confirmUseTpl(){
  if(!_tplToUse) return;
  const price = Number($("#useTplPrice").value||0);
  const date  = new Date($("#useTplDate").value);
  const { tpl, type } = _tplToUse;

  await itemsCol.add({
    kind: type==="ingres" ? "ingres-entry" : "despesa-entry",
    title: tpl.title,
    price,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    templateId: tpl.id,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("#useTplDialog").close();
  _tplToUse = null;
  toast(`${type==="ingres"?"Ingrés":"Despesa"} afegit des de plantilla`);
}

// ---- Editar registre ----
function editEntry(it){
  const price = prompt("Nou import (€):", String(it.price ?? 0));
  if(price===null) return;
  const dateStr = prompt("Nova data (YYYY-MM-DD):", toDateInput(it.date.toDate?it.date.toDate():new Date(it.date)));
  if(dateStr===null) return;
  const d = new Date(dateStr);
  itemsCol.doc(it.id).update({
    price: Number(price||0),
    date: firebase.firestore.Timestamp.fromDate(d),
    monthKey: yyyyMM(d)
  }).then(()=>toast("Registre actualitzat"));
}

// ---- Icones ----
function iconTrash(){ return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/><path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#7a6b63" stroke-width="2"/><path d="M8 10v8m4-8v8m4-8v8" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="#7a6b63" stroke-width="2"/></svg>`; }
function iconEdit(){ return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4z" stroke="#7a6b63" stroke-width="2"/><path d="M14 6l4 4" stroke="#7a6b63" stroke-width="2"/></svg>`; }
function iconClay(){ return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3c4 0 8 1 8 3s-4 3-8 3-8-1-8-3 4-3 8-3z" fill="#e9ccbf"/><path d="M4 6v8c0 2 4 4 8 4s8-2 8-4V6" fill="#f3e2da"/><path d="M4 10c0 2 4 4 8 4s8-2 8-4" stroke="#c96a4a"/></svg>`; }

// ---- Excel (any sencer) ----
function exportYearExcel(){
  const [yearStr] = state.activeMonth.split("-");
  const months = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];

  // Resum per mesos
  const rows = months.map((name, i) => {
    const key = `${yearStr}-${String(i+1).padStart(2,"0")}`;
    const inc = state.incomeEntries.filter(e=>e.monthKey===key).reduce((s,e)=>s+(Number(e.price)||0),0);
    const exp = state.expenseEntries.filter(e=>e.monthKey===key).reduce((s,e)=>s+(Number(e.price)||0),0);
    return { "Mes": name, "Ingressos": +(inc.toFixed(2)), "Despeses": +(exp.toFixed(2)), "Balanç": +((inc-exp).toFixed(2)) };
  });

  const wb = XLSX.utils.book_new();
  const wsResum = XLSX.utils.json_to_sheet(rows, { header:["Mes","Ingressos","Despeses","Balanç"] });
  XLSX.utils.book_append_sheet(wb, wsResum, `Resum ${yearStr}`);

  // Detall ingressos
  const incDet = state.incomeEntries
    .filter(e=>e.monthKey.startsWith(`${yearStr}-`))
    .map(e=>({
      "Data": toDateInput(e.date.toDate?e.date.toDate():new Date(e.date)),
      "Títol": e.title,
      "Preu": +(Number(e.price||0).toFixed(2)),
      "Notes": e.notes || ""
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incDet), `Ingressos ${yearStr}`);

  // Detall despeses
  const expDet = state.expenseEntries
    .filter(e=>e.monthKey.startsWith(`${yearStr}-`))
    .map(e=>({
      "Data": toDateInput(e.date.toDate?e.date.toDate():new Date(e.date)),
      "Concepte": e.title,
      "Import": +(Number(e.price||0).toFixed(2)),
      "Notes": e.notes || ""
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expDet), `Despeses ${yearStr}`);

  XLSX.writeFile(wb, `deFang_${yearStr}.xlsx`);
  toast("Excel generat");
}

// ---- Setup bàsic ----
async function ensurePackageDoc(){
  const ref = db.collection("packages").doc(PKG_ID);
  const snap = await ref.get();
  if(!snap.exists){ await ref.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp(), name:"deFang" }); }
}

// ---- Navegació ----
function setupNav(){
  $$(".nav-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      $$(".nav-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      $$(".view").forEach(v=>v.classList.remove("show"));
      document.getElementById(target).classList.add("show");
    });
  });
}

// ---- Inici ----
async function init(){
  
  setupNav();
  setupForms();
  // Oculta la UI principal fins a login
document.querySelector("main.container").style.display = "none";
document.getElementById("loginView").style.display = "grid";

// Escolta canvis d'autenticació
auth.onAuthStateChanged((user)=>{
  isAuthed = !!user;
  if (isAuthed){
    // Mostra app
    document.getElementById("loginView").style.display = "none";
    document.querySelector("main.container").style.display = "block";

    // Inicia subscripcions (un cop logats)
    subscribeTemplates();
    subscribeEntries();
    renderAllForActiveMonth();
    toast(`Benvingut/da, ${user.email}`);
  } else {
    // Des-subscriu si cal
    if (unsub.incomeTpl) unsub.incomeTpl();
    if (unsub.expenseTpl) unsub.expenseTpl();
    if (unsub.incomeEntries) unsub.incomeEntries();
    if (unsub.expenseEntries) unsub.expenseEntries();
    unsub = { incomeTpl:null, expenseTpl:null, incomeEntries:null, expenseEntries:null };

    // Buida estat visible
    state.incomeTpls = []; state.expenseTpls = [];
    state.incomeEntries = []; state.expenseEntries = [];
    renderAllForActiveMonth();

    // Torna al login
    document.querySelector("main.container").style.display = "none";
    document.getElementById("loginView").style.display = "grid";
  }
});


  toast("Dades carregades");
}
document.addEventListener("DOMContentLoaded", init);
