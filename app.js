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

// Usem l'estructura de les RUles: /packages/{pkgId}/items/{itemId}
const PKG_ID = "defang";
const itemsCol = db.collection("packages").doc(PKG_ID).collection("items");

async function ensurePackageDoc() {
  const pkgRef = db.collection("packages").doc(PKG_ID);
  const snap = await pkgRef.get();
  if (!snap.exists) {
    await pkgRef.set({
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      name: "deFang"
    });
  }
}

// ---- Utils ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtEUR = (n) =>
  (n ?? 0).toLocaleString("ca-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const yyyyMM = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const toDateInput = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

// ---- Navegació ----
function setupNav() {
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      $$(".view").forEach(v => v.classList.remove("show"));
      document.getElementById(target).classList.add("show");
    });
  });
}

// ---- Estat (subscripcions en temps real) ----
let unsub = {
  incomeTpl: null,
  expenseTpl: null,
  incomeEntries: null,
  expenseEntries: null
};

const state = {
  monthIncome: yyyyMM(new Date()),
  monthExpense: yyyyMM(new Date()),
  monthSummary: yyyyMM(new Date()),
  incomeEntries: [],
  expenseEntries: [],
  incomeTpls: [],
  expenseTpls: []
};

// ---- Render helpers ----
function renderTemplates(list, containerEl, type /* "ingres" | "despesa" */) {
  containerEl.innerHTML = "";
  if (!list.length) {
    containerEl.innerHTML = `<div class="hint">Encara no hi ha plantilles. Crea’n una amb “+ Nova plantilla”.</div>`;
    return;
  }
  for (const t of list) {
    const el = document.createElement("div");
    el.className = "tpl";
    el.innerHTML = `
      <div class="tpl-head">
        <div class="tpl-thumb">
          ${t.imageUrl ? `<img src="${t.imageUrl}" alt="">` : iconClay()}
        </div>
        <div>
          <div class="tpl-title">${escapeHtml(t.title)}</div>
          <div class="tpl-price">${fmtEUR(t.defaultPrice)}</div>
        </div>
      </div>
      <div class="tpl-actions">
        <button class="btn icon" data-action="use">Usar</button>
        <button class="btn icon" data-action="del">Eliminar</button>
      </div>
    `;
    el.querySelector('[data-action="use"]').addEventListener("click", () => openUseTplDialog(t, type));
    el.querySelector('[data-action="del"]').addEventListener("click", async () => {
      if (confirm("Vols eliminar aquesta plantilla?")) {
        await itemsCol.doc(t.id).delete();
        toast("Plantilla eliminada");
      }
    });
    containerEl.appendChild(el);
  }
}

function renderEntries(list, tbodyEl, totalEl) {
  tbodyEl.innerHTML = "";
  let total = 0;
  if (!list.length) {
    tbodyEl.innerHTML = `<tr><td colspan="5" class="hint">Cap registre aquest mes.</td></tr>`;
    totalEl.textContent = fmtEUR(0);
    return;
  }
  for (const it of list) {
    total += Number(it.price) || 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date))}</td>
      <td>${escapeHtml(it.title)}</td>
      <td>${fmtEUR(it.price)}</td>
      <td>${escapeHtml(it.notes || "")}</td>
      <td class="row-actions">
        <button class="btn icon" data-action="edit" title="Editar">${iconEdit()}</button>
        <button class="btn icon" data-action="del" title="Eliminar">${iconTrash()}</button>
      </td>
    `;
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

function renderSummary() {
  const month = state.monthSummary;
  const inc = state.incomeEntries.filter(e => e.monthKey === month).reduce((s, e) => s + (Number(e.price) || 0), 0);
  const exp = state.expenseEntries.filter(e => e.monthKey === month).reduce((s, e) => s + (Number(e.price) || 0), 0);
  const bal = inc - exp;
  $("#sumIncome").textContent = fmtEUR(inc);
  $("#sumExpense").textContent = fmtEUR(exp);
  $("#sumBalance").textContent = fmtEUR(bal);
}

// ---- Subscripcions ----
function subscribeTemplates() {
  if (unsub.incomeTpl) unsub.incomeTpl();
  if (unsub.expenseTpl) unsub.expenseTpl();

  unsub.incomeTpl = itemsCol.where("kind", "==", "ingres-template")
    .onSnapshot(snap => {
      state.incomeTpls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTemplates(state.incomeTpls, $("#incomeTplList"), "ingres");
    });

  unsub.expenseTpl = itemsCol.where("kind", "==", "despesa-template")
    .onSnapshot(snap => {
      state.expenseTpls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTemplates(state.expenseTpls, $("#expenseTplList"), "despesa");
    });
}

function subscribeEntries() {
  if (unsub.incomeEntries) unsub.incomeEntries();
  if (unsub.expenseEntries) unsub.expenseEntries();

  // Un sol filtre (kind) per evitar índexs compostos.
  unsub.incomeEntries = itemsCol.where("kind", "==", "ingres-entry")
    .onSnapshot(snap => {
      state.incomeEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const month = state.monthIncome;
      const list = state.incomeEntries.filter(e => e.monthKey === month);
      renderEntries(list, $("#incomeTableBody"), $("#incomeTotal"));
      renderSummary();
    });

  unsub.expenseEntries = itemsCol.where("kind", "==", "despesa-entry")
    .onSnapshot(snap => {
      state.expenseEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const month = state.monthExpense;
      const list = state.expenseEntries.filter(e => e.monthKey === month);
      renderEntries(list, $("#expenseTableBody"), $("#expenseTotal"));
      renderSummary();
    });
}

// ---- Formularis ----
function setupForms() {
  // Dates i mesos per defecte
  $("#incomeDate").value = toDateInput(new Date());
  $("#expenseDate").value = toDateInput(new Date());
  $("#monthIncome").value = state.monthIncome;
  $("#monthExpense").value = state.monthExpense;
  $("#monthSummary").value = state.monthSummary;

  $("#monthIncome").addEventListener("change", (e) => {
    state.monthIncome = e.target.value;
    const list = state.incomeEntries.filter(it => it.monthKey === state.monthIncome);
    renderEntries(list, $("#incomeTableBody"), $("#incomeTotal"));
  });

  $("#monthExpense").addEventListener("change", (e) => {
    state.monthExpense = e.target.value;
    const list = state.expenseEntries.filter(it => it.monthKey === state.monthExpense);
    renderEntries(list, $("#expenseTableBody"), $("#expenseTotal"));
  });

  $("#monthSummary").addEventListener("change", () => renderSummary());

  // Afegir ingrés
  $("#incomeForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const title = $("#incomeTitle").value.trim();
    const price = Number($("#incomePrice").value || 0);
    const dateStr = $("#incomeDate").value;
    const notes = $("#incomeNotes").value.trim();

    if (!title || !dateStr) return;
    const date = new Date(dateStr);
    await itemsCol.add({
      kind: "ingres-entry",
      title, price,
      date: firebase.firestore.Timestamp.fromDate(date),
      monthKey: yyyyMM(date),
      notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $("#incomeForm").reset();
    $("#incomeDate").value = toDateInput(new Date());
    toast("Ingrés desat");
  });

  // Afegir despesa
  $("#expenseForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const title = $("#expenseTitle").value.trim();
    const price = Number($("#expensePrice").value || 0);
    const dateStr = $("#expenseDate").value;
    const notes = $("#expenseNotes").value.trim();

    if (!title || !dateStr) return;
    const date = new Date(dateStr);
    await itemsCol.add({
      kind: "despesa-entry",
      title, price,
      date: firebase.firestore.Timestamp.fromDate(date),
      monthKey: yyyyMM(date),
      notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $("#expenseForm").reset();
    $("#expenseDate").value = toDateInput(new Date());
    toast("Despesa desada");
  });

  // Obrir diàleg nova plantilla
  $("#openIncomeTpl").addEventListener("click", () => openTplDialog("ingres"));
  $("#openExpenseTpl").addEventListener("click", () => openTplDialog("despesa"));
}

// ---- Plantilles ----
function openTplDialog(type) {
  $("#tplDialogTitle").textContent = type === "ingres" ? "Nova plantilla d’ingrés" : "Nova plantilla de despesa";
  $("#tplType").value = type;
  $("#tplTitle").value = "";
  $("#tplPrice").value = "";
  $("#tplImage").value = "";
  $("#tplDialog").showModal();

  $("#saveTplBtn").onclick = async (e) => {
    e.preventDefault();
    await saveTemplate();
  };
}

async function saveTemplate() {
  const type = $("#tplType").value; // ingres | despesa
  const title = $("#tplTitle").value.trim();
  const price = Number($("#tplPrice").value || 0);
  const file = $("#tplImage").files[0];

  if (!title) return;

  let imageUrl = null;
  if (file) {
    const path = `template-images/${Date.now()}_${file.name}`;
    const ref = storage.ref().child(path);
    await ref.put(file);
    imageUrl = await ref.getDownloadURL();
  }

  await itemsCol.add({
    kind: type === "ingres" ? "ingres-template" : "despesa-template",
    title,
    defaultPrice: price,
    imageUrl,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("#tplDialog").close();
  toast("Plantilla desada");
}

let _tplToUse = null;
function openUseTplDialog(tpl, type) {
  _tplToUse = { tpl, type };
  $("#useTplTitle").textContent = `Afegir ${type === "ingres" ? "ingrés" : "despesa"}: ${tpl.title}`;
  $("#useTplPrice").value = (tpl.defaultPrice ?? 0);
  $("#useTplDate").value = toDateInput(new Date());
  $("#useTplDialog").showModal();

  $("#confirmUseTpl").onclick = async (e) => {
    e.preventDefault();
    await confirmUseTpl();
  };
}

async function confirmUseTpl() {
  if (!_tplToUse) return;
  const price = Number($("#useTplPrice").value || 0);
  const date = new Date($("#useTplDate").value);
  const { tpl, type } = _tplToUse;

  await itemsCol.add({
    kind: type === "ingres" ? "ingres-entry" : "despesa-entry",
    title: tpl.title,
    price,
    date: firebase.firestore.Timestamp.fromDate(date),
    monthKey: yyyyMM(date),
    templateId: tpl.id,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("#useTplDialog").close();
  _tplToUse = null;
  toast(`${type === "ingres" ? "Ingrés" : "Despesa"} afegit des de plantilla`);
}

// ---- Editar registre (preu i data bàsic) ----
function editEntry(it) {
  const price = prompt("Nou import (€):", String(it.price ?? 0));
  if (price === null) return;
  const dateStr = prompt("Nova data (YYYY-MM-DD):", toDateInput(it.date.toDate ? it.date.toDate() : new Date(it.date)));
  if (dateStr === null) return;
  const d = new Date(dateStr);
  itemsCol.doc(it.id).update({
    price: Number(price || 0),
    date: firebase.firestore.Timestamp.fromDate(d),
    monthKey: yyyyMM(d)
  }).then(() => toast("Registre actualitzat"));
}

// ---- Helpers visuals ----
function iconTrash(){
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/>
    <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#7a6b63" stroke-width="2"/>
    <path d="M8 10v8m4-8v8m4-8v8" stroke="#7a6b63" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="#7a6b63" stroke-width="2"/>
  </svg>`;
}
function iconEdit(){
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="#7a6b63" stroke-width="2"/>
    <path d="M14 6l4 4" stroke="#7a6b63" stroke-width="2"/>
  </svg>`;
}
function iconClay(){
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 3c4 0 8 1 8 3s-4 3-8 3-8-1-8-3 4-3 8-3z" fill="#e9ccbf"/>
    <path d="M4 6v8c0 2 4 4 8 4s8-2 8-4V6" fill="#f3e2da"/>
    <path d="M4 10c0 2 4 4 8 4s8-2 8-4" stroke="#c96a4a" />
  </svg>`;
}
function escapeHtml(s){
  return (s || "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// ---- Inici ----
async function init(){
  setupNav();
  setupForms();
  await ensurePackageDoc();
  subscribeTemplates();
  subscribeEntries();
  toast("deFang llest ✨");
}
document.addEventListener("DOMContentLoaded", init);
