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
    tallerEntries: [],
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
el.querySelector('[data-action="use"]').addEventListener("click",()=>applyTemplateToForm(t,type));


    el.querySelector('[data-action="del"]').addEventListener("click",async()=>{
      
      if(confirm("Vols eliminar aquesta plantilla?")){ await itemsCol.doc(t.id).delete(); toast("Plantilla eliminada"); }
    });
    containerEl.appendChild(el);
  }
  const stripEl = (type === "ingres") ? $("#incomeTplStrip") : $("#expenseTplStrip");
if (stripEl){
  stripEl.innerHTML = "";
  if (!list.length){
    stripEl.innerHTML = `<div class="hint">Sense plantilles.</div>`;
  } else {
    for (const t of list){
      const pill = document.createElement("button");
      pill.className = "tpl-pill";
      pill.innerHTML = `
        <span class="thumb">${t.imageUrl ? `<img src="${t.imageUrl}" alt="">` : iconClay()}</span>
        <span class="txt">${escapeHtml(t.title)}</span>
        <span class="price">${fmtEUR(t.defaultPrice)}</span>
      `;
      pill.addEventListener("click", ()=> applyTemplateToForm(t, type));
      stripEl.appendChild(pill);
    }
  }
}
}

function renderSales(list, tbodyEl, totalEl){
  tbodyEl.innerHTML = "";
  let total = 0;
  if (!list.length){ tbodyEl.innerHTML = `<tr><td colspan="11" class="hint">Cap venda aquest mes.</td></tr>`; totalEl.textContent = fmtEUR(0); return; }

  for (const it of list){
    const dateTxt = toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date));
    const piece   = escapeHtml(it.piece || it.title || "");
    const clay    = escapeHtml(it.clay || "");
    const design  = escapeHtml(it.design || "");
    const vtype   = (it.saleType==='encarrec'?'Encàrrec': it.saleType==='outlet'?'Outlet':'Stock');
    const price   = Number(it.price)||0;
    const qty     = Number(it.qty)||1;
    const rowTot  = Number(it.total) || (price*qty);
    total += rowTot;
    const payTxt  = it.paymentMethod==='efectiu'?'Efectiu': (it.paymentMethod==='targeta'?'Targeta':'—');
    const notes   = escapeHtml(it.notes||"");

    const tr = document.createElement("tr");
    tr.innerHTML = [
      `<td>${dateTxt}</td>`,
      `<td>${piece}</td>`,
      `<td>${clay}</td>`,
      `<td>${design}</td>`,
      `<td>${vtype}</td>`,
      `<td>${fmtEUR(price)}</td>`,
      `<td>${qty}</td>`,
      `<td>${fmtEUR(rowTot)}</td>`,
      `<td>${payTxt}</td>`,
      `<td>${notes}</td>`,
      `<td class="row-actions">
         <button class="btn icon" data-action="edit" title="Editar">${iconEdit()}</button>
         <button class="btn icon" data-action="del" title="Eliminar">${iconTrash()}</button>
      </td>`
    ].join("");

    tr.querySelector('[data-action="del"]').addEventListener("click", async ()=>{
      if (confirm("Vols eliminar aquest registre?")){ await itemsCol.doc(it.id).delete(); toast("Venda eliminada"); }
    });
    tr.querySelector('[data-action="edit"]').addEventListener("click", ()=> editEntry(it));
    tbodyEl.appendChild(tr);
  }
  totalEl.textContent = fmtEUR(total);
}

function renderExpenses(list, tbodyEl, totalEl){
  tbodyEl.innerHTML = "";
  let total = 0;
  if (!list.length){ tbodyEl.innerHTML = `<tr><td colspan="6" class="hint">Cap despesa aquest mes.</td></tr>`; totalEl.textContent = fmtEUR(0); return; }

  for (const it of list){
    const dateTxt = toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date));
    const title   = escapeHtml(it.title || "");
    const price   = Number(it.price)||0;
    const iva     = Number(it.iva)||0;
    const base    = (price - iva);
    total += price;

    const tr = document.createElement("tr");
    tr.innerHTML = [
      `<td>${dateTxt}</td>`,
      `<td>${title}</td>`,
      `<td>${fmtEUR(price)}</td>`,
      `<td>${fmtEUR(iva)}</td>`,
      `<td>${fmtEUR(base)}</td>`,
      `<td class="row-actions">
         <button class="btn icon" data-action="edit" title="Editar">${iconEdit()}</button>
         <button class="btn icon" data-action="del" title="Eliminar">${iconTrash()}</button>
      </td>`
    ].join("");

    tr.querySelector('[data-action="del"]').addEventListener("click", async ()=>{
      if (confirm("Vols eliminar aquesta despesa?")){ await itemsCol.doc(it.id).delete(); toast("Despesa eliminada"); }
    });
    tr.querySelector('[data-action="edit"]').addEventListener("click", ()=> editEntry(it));
    tbodyEl.appendChild(tr);
  }
  totalEl.textContent = fmtEUR(total);
}

function renderTallers(list, tbodyEl, totalEl){
  tbodyEl.innerHTML = "";
  let total = 0;
  if (!list.length){ tbodyEl.innerHTML = `<tr><td colspan="6" class="hint">Cap taller aquest mes.</td></tr>`; totalEl.textContent = fmtEUR(0); return; }

  for (const it of list){
    const dateTxt = toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date));
    const ttype   = (it.tallerType||'').replace(/^./,c=>c.toUpperCase());
    const price   = Number(it.price)||0;
    const qty     = Number(it.qty)||1;
    const rowTot  = Number(it.total) || (price*qty);
    total += rowTot;

    const tr = document.createElement("tr");
    tr.innerHTML = [
      `<td>${dateTxt}</td>`,
      `<td>${escapeHtml(ttype)}</td>`,
      `<td>${fmtEUR(price)}</td>`,
      `<td>${qty}</td>`,
      `<td>${fmtEUR(rowTot)}</td>`,
      `<td class="row-actions">
         <button class="btn icon" data-action="edit" title="Editar">${iconEdit()}</button>
         <button class="btn icon" data-action="del" title="Eliminar">${iconTrash()}</button>
      </td>`
    ].join("");

    tr.querySelector('[data-action="del"]').addEventListener("click", async ()=>{
      if (confirm("Vols eliminar aquest taller?")){ await itemsCol.doc(it.id).delete(); toast("Taller eliminat"); }
    });
    tr.querySelector('[data-action="edit"]').addEventListener("click", ()=> editEntry(it));
    tbodyEl.appendChild(tr);
  }
  totalEl.textContent = fmtEUR(total);
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
  $("#monthTallerText") && ($("#monthTallerText").textContent = formatMonth(m)); // ✅

  // filtres
  const vendesList  = state.incomeEntries.filter(e=>e.monthKey===m);
  const despesesList= state.expenseEntries.filter(e=>e.monthKey===m);
  const tallersList = state.tallerEntries .filter(e=>e.monthKey===m); // ✅

  // render taules (VENDES amb nova signatura, DESPESES amb IVA/Base, TALLERS)
  renderSales(vendesList, $("#incomeTableBody"), $("#incomeTotal"));               // ✅
  renderExpenses(despesesList, $("#expenseTableBody"), $("#expenseTotal"));       // ✅
  $("#tallerTableBody") && renderTallers(tallersList, $("#tallerTableBody"), $("#tallerTotal")); // ✅

  // totals
  const vendesTotal  = vendesList.reduce((s,e)=> s + ((Number(e.total)|| (Number(e.price)||0) * (Number(e.qty)||1))), 0); // ✅
  const tallersTotal = tallersList.reduce((s,e)=> s + ((Number(e.total)|| (Number(e.price)||0) * (Number(e.qty)||1))), 0); // ✅
  const despesesTotal= despesesList.reduce((s,e)=> s + (Number(e.price)||0), 0);

  $("#sumIncome").textContent  = fmtEUR(vendesTotal + tallersTotal);
  $("#sumExpense").textContent = fmtEUR(despesesTotal);
  $("#sumBalance").textContent = fmtEUR((vendesTotal + tallersTotal) - despesesTotal);

  document.getElementById("incomeChip").textContent  = fmtEUR(vendesTotal);
  document.getElementById("expenseChip").textContent = fmtEUR(despesesTotal);
  document.getElementById("tallerChip") && (document.getElementById("tallerChip").textContent = fmtEUR(tallersTotal)); // ✅

  // dates per defecte dins el mes actiu
  const d = dateInsideActiveMonth(m);
  $("#incomeDate").value  = toDateInput(d);
  $("#expenseDate").value = toDateInput(d);
  $("#tallerDate") && ($("#tallerDate").value = toDateInput(d)); // ✅

  // header picker + any export
  $("#activeMonthPicker").value = m;
  const yrBadge = document.getElementById("exportYearBadge");
  if (yrBadge) { const [yr] = m.split("-"); yrBadge.textContent = `ANY ${yr}`; }

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

    if (unsub.tallerEntries) unsub.tallerEntries();

unsub.tallerEntries = itemsCol.where("kind","==","taller-entry")
  .onSnapshot(s=>{
    state.tallerEntries = s.docs.map(d=>({id:d.id,...d.data()}));
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
  // VENDES: total = preu * quantitat
const salePrice = $("#incomePrice");
const saleQty   = $("#saleQty");
const saleTotal = $("#saleTotal");
function recomputeSaleTotal(){
  const p = Number(salePrice?.value||0), q = Number(saleQty?.value||1);
  if (saleTotal) saleTotal.value = fmtEUR(p*q);
}
salePrice?.addEventListener("input", recomputeSaleTotal);
saleQty?.addEventListener("input", recomputeSaleTotal);
recomputeSaleTotal();
// DESPESES: Base = Import - IVA (en directe)
const expImport = $("#expensePrice");
const expIVA    = $("#expenseIVA");
const expBase   = $("#expenseBase");
function recomputeBase(){
  const imp = Number(expImport?.value||0);
  const iva = Number(expIVA?.value||0);
  if (expBase) expBase.value = fmtEUR(Math.max(imp - iva, 0));
}
expImport?.addEventListener("input", recomputeBase);
expIVA?.addEventListener("input", recomputeBase);
recomputeBase();
// TALLERS: Total = preu * quantitat (en directe)
const talPrice = $("#tallerPrice");
const talQty   = $("#tallerQty");
const talTotal = $("#tallerTotal");
function recomputeTallerTotal(){
  const p = Number(talPrice?.value || 0);
  const q = Number(talQty?.value   || 1);
  if (talTotal) talTotal.value = fmtEUR(p * q);
}
talPrice?.addEventListener("input", recomputeTallerTotal);
talQty?.addEventListener("input",  recomputeTallerTotal);
recomputeTallerTotal();



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
// Plegable mòbil: income
const incT = document.getElementById("incomeFormToggle");
const incF = document.getElementById("incomeForm");
if (incT && incF){
  incT.addEventListener("click", ()=>{
    incF.classList.toggle("open");
    incT.classList.toggle("expanded");
  });
}

// Plegable mòbil: expense
const expT = document.getElementById("expenseFormToggle");
const expF = document.getElementById("expenseForm");
if (expT && expF){
  expT.addEventListener("click", ()=>{
    expF.classList.toggle("open");
    expT.classList.toggle("expanded");
  });
}
// Plegable mòbil: tallers
const talT = document.getElementById("tallerFormToggle");
const talF = document.getElementById("tallerForm");
if (talT && talF){
  talT.addEventListener("click", ()=>{
    talF.classList.toggle("open");
    talT.classList.toggle("expanded");
  });
}

function attachSectionToggle(btnId, areaId){
  const btn = document.getElementById(btnId);
  const area= document.getElementById(areaId);
  if (!btn || !area) return;
  btn.addEventListener("click", ()=>{
    const open = !area.classList.contains("open");
    area.classList.toggle("open", open);
    btn.classList.toggle("expanded", open);
  });
}

// Activa els 3 desplegables (vendes/despeses/tallers)
attachSectionToggle("incomeSectionToggle","incomeCollapsible");
attachSectionToggle("expenseSectionToggle","expenseCollapsible");
attachSectionToggle("tallerSectionToggle","tallerCollapsible");

// Per defecte: TANCATS en obrir cada vista
document.getElementById("incomeCollapsible")?.classList.remove("open");
document.getElementById("expenseCollapsible")?.classList.remove("open");
document.getElementById("tallerCollapsible")?.classList.remove("open");
document.getElementById("incomeSectionToggle")?.classList.remove("expanded");
document.getElementById("expenseSectionToggle")?.classList.remove("expanded");
document.getElementById("tallerSectionToggle")?.classList.remove("expanded");


// (opcional) Botó Cancel·lar d’ingrés tanca el formulari al mòbil
document.getElementById("incomeCancelBtn")?.addEventListener("click", ()=>{
  if (window.matchMedia("(max-width:700px)").matches){
    incF?.classList.remove("open");
    incT?.classList.remove("expanded");
  }
});

  // Afegir ingrés
// Afegir ingrés (VENDES)
$("#incomeForm").addEventListener("submit", async (ev)=>{
  ev.preventDefault();

  // LLEGIM CAMPS
  const piece  = $("#salePiece").value.trim();
  const clay   = $("#saleClay").value.trim();
  const design = $("#saleDesign").value.trim();
  const saleType = $("#saleType").value || "stock";

  const price = Number($("#incomePrice").value || 0);  // preu unitari
  const qty   = Number($("#saleQty").value || 1);
  const total = price * qty;

  const dateStr = $("#incomeDate").value;
  if (!dateStr) return;
  const date = new Date(dateStr);

  const paymentMethod = $("#incomePay")?.value || null;
  const notes = $("#incomeNotes").value.trim();

  // GUARDEM (conservem "title" per compatibilitat; usem "piece" com a títol)
  await itemsCol.add({
    kind: "ingres-entry",
    title: piece || "",      // compat amb codi antic
    piece, clay, design, saleType,
    price, qty, total,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    notes,
    paymentMethod,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // RESET + recalcular total del formulari
  $("#incomeForm").reset();
  $("#incomeDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
  // recomputa el total (preu × quant) després del reset
  (function(){
    const salePrice = $("#incomePrice");
    const saleQty   = $("#saleQty");
    const saleTotal = $("#saleTotal");
    const recomputeSaleTotal = ()=>{
      const p = Number(salePrice?.value||0), q = Number(saleQty?.value||1);
      if (saleTotal) saleTotal.value = fmtEUR(p*q);
    };
    salePrice?.addEventListener("input", recomputeSaleTotal, { once:true });
    saleQty?.addEventListener("input", recomputeSaleTotal, { once:true });
    recomputeSaleTotal();
  })();

  toast("Ingrés desat");

  // al mòbil, plega el formulari després de desar
  if (window.matchMedia("(max-width:700px)").matches){
    document.getElementById("incomeForm")?.classList.remove("open");
    document.getElementById("incomeFormToggle")?.classList.remove("expanded");
  }
});

// === Templates: obrir diàleg i enllaçar guardat ===

// Botons "Nova plantilla" de cada secció
$('#openIncomeTpl')?.addEventListener('click', ()=> openTplDialog('ingres'));
$('#openExpenseTpl')?.addEventListener('click',()=> openTplDialog('despesa'));

// Submit del diàleg -> desa plantilla
$('#tplForm')?.addEventListener('submit', saveTemplate);

// Botó "Cancel·lar" del diàleg
$('#cancelTplBtn')?.addEventListener('click', ()=> $('#tplDialog').close());


// Afegir despesa
$("#expenseForm").addEventListener("submit", async (ev)=>{
  ev.preventDefault();

  const title = $("#expenseTitle").value.trim();
  const price = Number($("#expensePrice").value||0);
  const iva   = Number($("#expenseIVA").value||0);
  const base  = Math.max(price - iva, 0);

  const dateStr = $("#expenseDate").value;
  if(!title || !dateStr) return;
  const date = new Date(dateStr);

  const notes = $("#expenseNotes").value.trim();

  await itemsCol.add({
    kind:"despesa-entry",
    title, price, iva, base,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    notes,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("#expenseForm").reset();
  $("#expenseDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
  // recalcula la base (0,00) després del reset
  (function(){
    const expImport = $("#expensePrice");
    const expIVA    = $("#expenseIVA");
    const expBase   = $("#expenseBase");
    const recomputeBase = ()=>{
      const imp = Number(expImport?.value||0);
      const iv  = Number(expIVA?.value||0);
      if (expBase) expBase.value = fmtEUR(Math.max(imp - iv, 0));
    };
    expImport?.addEventListener("input", recomputeBase, { once:true });
    expIVA?.addEventListener("input", recomputeBase, { once:true });
    recomputeBase();
  })();

  toast("Despesa desada");

  // al mòbil, plega el formulari després de desar
  if (window.matchMedia("(max-width:700px)").matches){
    document.getElementById("expenseForm")?.classList.remove("open");
    document.getElementById("expenseFormToggle")?.classList.remove("expanded");
  }
});


  $("#tallerForm")?.addEventListener("submit", async (ev)=>{
  ev.preventDefault();
  const dateStr = $("#tallerDate").value;
  const tallerType = $("#tallerType").value || "setmanal";
  const price = Number($("#tallerPrice").value||0);
  const qty   = Number($("#tallerQty").value||1);
  if (!dateStr) return;
  const date = new Date(dateStr);
  await itemsCol.add({
    kind: "taller-entry",
    tallerType, price, qty, total: price*qty,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  $("#tallerForm").reset();
  $("#tallerDate").value = toDateInput(dateInsideActiveMonth(state.activeMonth));
  toast("Taller desat");

  // Recalcula el total a 0,00 € després del reset
(function(){
  const talPrice = $("#tallerPrice");
  const talQty   = $("#tallerQty");
  const talTotal = $("#tallerTotal");
  const recomputeTallerTotal = ()=>{
    const p = Number(talPrice?.value || 0);
    const q = Number(talQty?.value   || 1);
    if (talTotal) talTotal.value = fmtEUR(p*q);
  };
  talPrice?.addEventListener("input", recomputeTallerTotal, { once:true });
  talQty?.addEventListener("input",  recomputeTallerTotal, { once:true });
  recomputeTallerTotal();
})();

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
  const [yearStr] = state.activeMonth.split("-");
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF){ alert("Falta jsPDF. Revisa els <script> de jspdf i autotable."); return; }
  const doc = new jsPDF({ unit:"pt", format:"a4" });

  const brand  = [201,106,74];
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();

  // Dades
  const months = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];
  const vendes   = state.incomeEntries .filter(e=>e.monthKey.startsWith(`${yearStr}-`));
  const despeses = state.expenseEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`));
  const tallers  = state.tallerEntries  ? state.tallerEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`)) : [];

  const rowOf = (i)=>{
    const key = `${yearStr}-${String(i).padStart(2,"0")}`;
    const v  = vendes  .filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
    const t  = tallers .filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
    const d  = despeses.filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.price)||0), 0);
    const inc = v + t, bal = inc - d;
    return [months[i-1], eur(v), eur(t), eur(inc), eur(d), eur(bal)];
  };

  const rows = [];
  for (let i=1;i<=12;i++) rows.push(rowOf(i));

  // Logo i títol
  const logo = await getLogoDataURL();
  const logoW = 120, logoH = 44;
  if (logo) doc.addImage(logo, "PNG", pageW - margin - logoW, margin, logoW, logoH);

  doc.setFont("helvetica","bold");
  doc.setFontSize(18);
  doc.setTextColor(brand[0],brand[1],brand[2]);
  doc.text(`Resum anual ${yearStr} · deFang`, margin, margin + 24);

  // KPIs any
  const vTot = vendes .reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
  const tTot = tallers.reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
  const dTot = despeses.reduce((s,e)=> s + (Number(e.price)||0), 0);
  const incTot = vTot + tTot, balTot = incTot - dTot;

  doc.setFont("helvetica","normal");
  doc.setFontSize(12);
  doc.setTextColor(60);
  const yKPIs = margin + 40;
  doc.text(`Vendes: ${eur(vTot)}   ·   Tallers: ${eur(tTot)}   ·   Ingressos: ${eur(incTot)}   ·   Despeses: ${eur(dTot)}   ·   Balanç: ${eur(balTot)}`, margin, yKPIs);

  // Taula principal
  const startY = Math.max(yKPIs + 16, margin + logoH + 16);
  doc.autoTable({
    head: [["Mes","Vendes","Tallers","Ingressos","Despeses","Balanç"]],
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
// Obre el diàleg de plantilles i mostra/oculta els camps extres segons el tipus
function openTplDialog(type){
  const dlg    = $('#tplDialog');
  const typeEl = $('#tplType');
  const extra  = $('#tplExtraFields');
  const titleH = $('#tplDialogTitle');

  // reinicia formulari
  $('#tplForm')?.reset();

  // defineix tipus inicial (si ve d'un botó "Nova plantilla de vendes/despeses")
  if (type) typeEl.value = type;

  const applyTypeUI = ()=>{
    const isIngres = (typeEl.value === 'ingres');
    // el contenidor extra té layout .form-grid al CSS
    extra.style.display = isIngres ? 'grid' : 'none';
    titleH.textContent  = isIngres ? 'Nova plantilla de venda' : 'Nova plantilla de despesa';
  };
  applyTypeUI();

  // si canvien el select dins el diàleg
  typeEl.onchange = applyTypeUI;

  // mostra el diàleg
  dlg.showModal();
}
// Desa plantilla (URL o fitxer d'imatge; camps extra opcionals per vendes)
async function saveTemplate(ev){
  ev?.preventDefault?.();

  const typeEl  = $('#tplType');
  const isIngres = (typeEl.value === 'ingres');

  const title = $('#tplTitle').value.trim();               // ⚠️ internament seguim guardant com 'title'
  const price = Number($('#tplPrice').value || 0);

  // Imatge: si hi ha URL, el fem servir; si no, si hi ha fitxer, el pugem a Storage
  const file   = $('#tplImageFile')?.files?.[0] || null;
  if (!imageUrl && file){
    const path = `templates/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
    const ref  = storage.ref().child(path);
    await ref.put(file);
    imageUrl = await ref.getDownloadURL();
  }

  // Camps extra (només per plantilles de vendes; tots opcionals)
  const piece    = $('#tplPiece')?.value.trim()   || '';
  const clay     = $('#tplClay')?.value.trim()    || '';
  const design   = $('#tplDesign')?.value.trim()  || '';
  const saleType = $('#tplSaleType')?.value       || '';

  // Payload base
  const payload = {
    kind: isIngres ? 'ingres-template' : 'despesa-template',
    title,                      // 👈 guardem com 'title' però a la UI diem "Peça"
    defaultPrice: price,
    imageUrl,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  // Adjunta extres si és una plantilla de vendes
  if (isIngres) Object.assign(payload, { piece, clay, design, saleType });

  await itemsCol.add(payload);

  $('#tplForm').reset();
  $('#tplDialog').close();
  toast('Plantilla desada');
}

// Aplica una plantilla al formulari corresponent
function applyTemplateToForm(tpl, type){
  const when = toDateInput(dateInsideActiveMonth(state.activeMonth));

  if (type === 'ingres'){           // VENDES
    goToView('ingressos');

    // obre el desplegable de la secció
    $('#incomeCollapsible')?.classList.add('open');
    $('#incomeSectionToggle')?.classList.add('expanded');

    // data per defecte dins mes actiu
    $('#incomeDate').value = when;

    // camps preomplerts
    $('#salePiece').value   = tpl.piece  || tpl.title || '';
    $('#saleClay').value    = tpl.clay   || '';
    $('#saleDesign').value  = tpl.design || '';
    if (tpl.saleType) $('#saleType').value = tpl.saleType;

    if (typeof tpl.defaultPrice === 'number'){
      $('#incomePrice').value = tpl.defaultPrice;
    }

    // recalcular total automàtic
    const p = Number($('#incomePrice').value || 0);
    const q = Number($('#saleQty').value || 1);
    const saleTotal = $('#saleTotal');
    if (saleTotal) saleTotal.value = fmtEUR(p*q);

    $('#incomeNotes')?.focus();
    toast('Plantilla carregada al formulari de vendes');
  }

  else if (type === 'despesa'){     // DESPESES
    goToView('despeses');

    $('#expenseCollapsible')?.classList.add('open');
    $('#expenseSectionToggle')?.classList.add('expanded');

    $('#expenseDate').value = when;
    $('#expenseCompany').value = tpl.title || '';          // a despeses fem servir 'Empresa/Concepte'
    if (typeof tpl.defaultPrice === 'number'){
      $('#expensePrice').value = tpl.defaultPrice;
    }

    // recalcula base (Import - IVA)
    const recomputeBase = ()=>{
      const imp = Number($('#expensePrice').value || 0);
      const iv  = Number($('#expenseIVA').value   || 0);
      const base= Math.max(imp - iv, 0);
      const out = $('#expenseBase'); if (out) out.value = fmtEUR(base);
    };
    recomputeBase();

    $('#expenseNotes')?.focus();
    toast('Plantilla carregada al formulari de despeses');
  }
}



// ---- Editar registre ----
// ---- Editar registre complet ----
async function editEntry(it){
  // Determina tipus (venda, despesa, taller)
  const kind = it.kind || "";
  const docRef = itemsCol.doc(it.id);

  // Helper per a prompt amb valor per defecte
  const ask = (label, def="")=>{
    const v = prompt(label, def);
    return v===null ? def : v.trim();
  };

  // Data
  const oldDate = it.date?.toDate ? it.date.toDate() : new Date(it.date);
  const newDateStr = ask("Data (YYYY-MM-DD):", toDateInput(oldDate));
  const newDate = new Date(newDateStr);

  // Camps segons tipus
  if (kind === "ingres-entry"){
    const piece  = ask("Peça:", it.piece || it.title || "");
    const clay   = ask("Tipus de fang:", it.clay || "");
    const design = ask("Color / Disseny:", it.design || "");
    const saleType = ask("Tipus de venda (stock / encarrec / outlet):", it.saleType || "stock");
    const price = Number(ask("Preu unitari (€):", it.price ?? 0)) || 0;
    const qty   = Number(ask("Quantitat:", it.qty ?? 1)) || 1;
    const pay   = ask("Mètode (efectiu / targeta):", it.paymentMethod || "targeta");
    const notes = ask("Comentaris:", it.notes || "");
    const total = price * qty;

    await docRef.update({
      piece, clay, design, saleType,
      price, qty, total,
      paymentMethod: pay,
      notes,
      date: firebase.firestore.Timestamp.fromDate(newDate),
      monthKey: yyyyMM(newDate)
    });
    toast("Venda actualitzada");
  }

  else if (kind === "despesa-entry"){
    const title = ask("Empresa / Concepte:", it.title || "");
    const price = Number(ask("Import total (€):", it.price ?? 0)) || 0;
    const iva   = Number(ask("IVA (€):", it.iva ?? 0)) || 0;
    const base  = Math.max(price - iva, 0);
    const notes = ask("Notes:", it.notes || "");

    await docRef.update({
      title, price, iva, base, notes,
      date: firebase.firestore.Timestamp.fromDate(newDate),
      monthKey: yyyyMM(newDate)
    });
    toast("Despesa actualitzada");
  }

  else if (kind === "taller-entry"){
    const ttype = ask("Tipus de taller (setmanal / dissabtes / casal / nens):", it.tallerType || "setmanal");
    const price = Number(ask("Preu (€):", it.price ?? 0)) || 0;
    const qty   = Number(ask("Quantitat:", it.qty ?? 1)) || 1;
    const total = price * qty;

    await docRef.update({
      tallerType: ttype, price, qty, total,
      date: firebase.firestore.Timestamp.fromDate(newDate),
      monthKey: yyyyMM(newDate)
    });
    toast("Taller actualitzat");
  }

  else {
    toast("Tipus de registre desconegut");
  }
}

// ---- Icones ----
function iconTrash(){ return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/><path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#7a6b63" stroke-width="2"/><path d="M8 10v8m4-8v8m4-8v8" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="#7a6b63" stroke-width="2"/></svg>`; }
function iconEdit(){ return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4z" stroke="#7a6b63" stroke-width="2"/><path d="M14 6l4 4" stroke="#7a6b63" stroke-width="2"/></svg>`; }
function iconClay(){ return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3c4 0 8 1 8 3s-4 3-8 3-8-1-8-3 4-3 8-3z" fill="#e9ccbf"/><path d="M4 6v8c0 2 4 4 8 4s8-2 8-4V6" fill="#f3e2da"/><path d="M4 10c0 2 4 4 8 4s8-2 8-4" stroke="#c96a4a"/></svg>`; }

// ---- Excel (any sencer) ----
function exportYearExcel(){
  const [yearStr] = state.activeMonth.split("-");
  if (!window.XLSX){ alert("Falta SheetJS (XLSX). Revisa el <script> de xlsx."); return; }

  // Helpers
  const months = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];
  const ykey = (m)=> `${yearStr}-${String(m).padStart(2,"0")}`;
  const dstr = (ts)=> toDateInput(ts.toDate ? ts.toDate() : new Date(ts));

  // Separa per any
  const vendes   = state.incomeEntries .filter(e=>e.monthKey.startsWith(`${yearStr}-`));
  const despeses = state.expenseEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`));
  const tallers  = state.tallerEntries  ? state.tallerEntries.filter(e=>e.monthKey.startsWith(`${yearStr}-`)) : [];

  // FULL 1: RESUM mensual (Vendes, Tallers, Ingressos=V+T, Despeses, Balanç)
  const resumAOA = [["Mes","Vendes","Tallers","Ingressos","Despeses","Balanç"]];
  for (let i=1;i<=12;i++){
    const key = ykey(i);
    const v  = vendes  .filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
    const t  = tallers .filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.total)|| (Number(e.price)||0)*(Number(e.qty)||1)), 0);
    const d  = despeses.filter(e=>e.monthKey===key).reduce((s,e)=> s + (Number(e.price)||0), 0);
    const inc = v + t;
    resumAOA.push([months[i-1], inc?Number(inc - t):v, t, inc, d, inc - d]); // 2a col és Vendes; "inc?..." per assegurar nombre
    // (nota: "inc?inc - t : v" només per evitar NaN si tot és 0; és equivalent a 'v')
    resumAOA[resumAOA.length-1][1] = v; // fem-ho explícit
  }

  // FULL 2: VENDES detall
  const vendesAOA = [["Data","Peça","Fang","Color/Disseny","Tipus","Preu","Quant.","Total","Mètode","Comentaris","Mes"]];
  vendes.forEach(e=>{
    const price = Number(e.price)||0, qty = Number(e.qty)||1, tot = Number(e.total)|| (price*qty);
    vendesAOA.push([
      dstr(e.date), e.piece||e.title||"", e.clay||"", e.design||"",
      e.saleType||"stock", price, qty, tot,
      e.paymentMethod==="efectiu"?"Efectiu": (e.paymentMethod==="targeta"?"Targeta":""),
      e.notes||"", e.monthKey
    ]);
  });

  // FULL 3: DESPESES detall (amb IVA i Base si existeixen)
  const despesesAOA = [["Data","Empresa/Concepte","Import","IVA","Base","Mes"]];
  despeses.forEach(e=>{
    despesesAOA.push([ dstr(e.date), e.title||"", Number(e.price)||0, Number(e.iva)||0, (e.base!=null?Number(e.base):Math.max((Number(e.price)||0)-(Number(e.iva)||0),0)), e.monthKey ]);
  });

  // FULL 4: TALLERS detall
  const tallersAOA = [["Data","Tipus","Preu","Quant.","Total","Mes"]];
  tallers.forEach(e=>{
    const price = Number(e.price)||0, qty = Number(e.qty)||1, tot = Number(e.total)|| (price*qty);
    tallersAOA.push([ dstr(e.date), e.tallerType||"", price, qty, tot, e.monthKey ]);
  });

  // Llibre i fitxer
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumAOA), "Resum");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendesAOA), "Vendes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despesesAOA), "Despeses");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tallersAOA), "Tallers");
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

function setupMobileMenu(){
  const btn = document.getElementById("menuBtn");
  const panel = document.getElementById("mobileMenu");
  const backdrop = document.getElementById("menuBackdrop");
  if (!btn || !panel || !backdrop) return;

  const navTo = (target) => {
    // usa el teu helper si el tens; sinó, fem clic al botó de la nav clàssica
    const desktopBtn = document.querySelector(`.nav-btn[data-target="${target}"]`);
    if (typeof goToView === 'function') goToView(target);
    else if (desktopBtn) desktopBtn.click();
  };

  const open = () => {
    panel.hidden = false; backdrop.hidden = false;
    btn.setAttribute("aria-expanded","true");
    document.addEventListener("keydown", onKey);
  };
  const close = () => {
    panel.hidden = true; backdrop.hidden = true;
    btn.setAttribute("aria-expanded","false");
    document.removeEventListener("keydown", onKey);
  };
  const toggle = () => panel.hidden ? open() : close();
  const onKey = (e) => { if (e.key === "Escape") close(); };

  btn.addEventListener("click", toggle);
  backdrop.addEventListener("click", close);

  panel.querySelectorAll(".mobile-item").forEach(item=>{
    item.addEventListener("click", ()=>{
      const target = item.getAttribute("data-target");
      navTo(target);
      close();
    });
  });

  // Si canvia la vista per altres motius, tanquem el menú
  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.addEventListener("click", ()=> close());
  });
}

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
function goToView(id){
  const btn = document.querySelector(`.nav-btn[data-target="${id}"]`);
  if (btn) btn.click();
}



// --- també omple la vista "tira" al mòbil ---



// ---- Inici ----
async function init(){
  
  setupNav();
  setupForms();
  setupMobileMenu();

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
