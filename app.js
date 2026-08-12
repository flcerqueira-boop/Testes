import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIG ───────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDe_7GdbVfwcVeG19lj_4ZkL0zKZaLP68o",
  authDomain: "fisioplus-cd92b.firebaseapp.com",
  projectId: "fisioplus-cd92b",
  storageBucket: "fisioplus-cd92b.firebasestorage.app",
  messagingSenderId: "137208430197",
  appId: "1:137208430197:web:6be479df7f7bc7fb31023c"
};

const ADMIN_EMAIL = "suporte@ortoflix.com";

// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID = "service_tm0udfi";
const EMAILJS_TEMPLATE_ID = "template_ilgu5zq";
const EMAILJS_PUBLIC_KEY = "Vr9itk38fpBYXI3E4";

async function sendApprovalEmail(userName, userEmail) {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name: userName,
      email: userEmail
    }, EMAILJS_PUBLIC_KEY);
  } catch (e) { console.error("Erro ao enviar e-mail:", e); }
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── STATE ────────────────────────────────────────────────────────────────
let currentUser = null;
let currentUserData = null;
let allExercises = [];
let favorites = new Set();
let selectedForPlan = []; // cada item: { ...exercise, customSets, customFrequency }
let currentPage = "dashboard";
let editingExerciseId = null;
let currentDetailExercise = null;

// ─── HELPERS ──────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }
function el(id) { return document.getElementById(id); }
function showError(id, msg) { const e = el(id); e.textContent = msg; e.classList.remove("hidden"); }
function hideError(id) { el(id)?.classList.add("hidden"); }

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("pt-BR");
}

// ─── AUTH STATE ───────────────────────────────────────────────────────────
const _patientPlanId = new URLSearchParams(window.location.search).get("plan");
if (_patientPlanId) {
  showPatientView(_patientPlanId);
} else {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await loadUserData(user);
    } else {
      currentUser = null;
      currentUserData = null;
      showAuthScreen();
    }
  });
}

async function loadUserData(user) {
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      if (user.email === ADMIN_EMAIL) {
        await setDoc(doc(db, "users", user.uid), {
          name: "Admin", email: user.email,
          role: "admin", status: "approved",
          createdAt: serverTimestamp()
        });
        currentUserData = { name: "Admin", role: "admin", status: "approved" };
      } else {
        showAuthScreen();
        return;
      }
    } else {
      currentUserData = userDoc.data();
    }
    if (currentUserData.status === "pending") { showPendingScreen(false); return; }
    if (currentUserData.status === "rejected") { showPendingScreen(true); return; }
    showApp();
  } catch (e) { console.error(e); showAuthScreen(); }
}

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────
function showAuthScreen() {
  hide("app"); hide("pending-screen"); hide("patient-view");
  show("auth-screen");
}
function showPendingScreen(rejected = false) {
  hide("app"); hide("auth-screen"); hide("patient-view");
  show("pending-screen");
  if (rejected) {
    el("pending-icon").textContent = "❌";
    el("pending-title").textContent = "Cadastro Não Aprovado";
    el("pending-text").textContent = "Infelizmente seu cadastro não foi aprovado. Entre em contato com o administrador para mais informações.";
  } else {
    el("pending-icon").textContent = "⏳";
    el("pending-title").textContent = "Cadastro em Análise";
    el("pending-text").textContent = "Sua solicitação foi recebida! O administrador irá revisar e aprovar seu acesso em breve. Você receberá uma notificação quando seu cadastro for liberado.";
  }
}
function showHub() {
  hide("auth-screen"); hide("pending-screen"); hide("patient-view"); hide("app");
  show("hub-screen");
}

window.enterApp = () => {
  hide("hub-screen");
  show("app");
  navigateTo("dashboard");
  loadFavorites();
}

function showApp() {
  hide("auth-screen"); hide("pending-screen"); hide("patient-view");
  showHub();
  return;
  show("app");
  const roleEl = el("header-role-badge");
  if (currentUserData.role === "admin") {
    // Badge Admin visível só para admin
    roleEl.textContent = "Admin";
    roleEl.className = "badge badge-admin";
    roleEl.classList.remove("hidden");
    // Menu admin
    show("admin-nav");
    show("admin-quick");
    hide("nav-favorites");
    hide("nav-plans");
    hide("nav-ortoflix");
    el("stat-users-card").style.display = "flex";
    hide("stat-favorites-card");
    hide("stat-plans-card");
    el("dashboard-pro-actions").style.display = "none";
    // Bottom nav admin
    el("bottom-nav-admin")?.classList.add("visible");
    el("bottom-nav-pro")?.classList.remove("visible");
    checkPendingBadge();
  } else {
    // Profissional — sem badge de perfil
    roleEl.classList.add("hidden");
    hide("admin-nav");
    hide("admin-quick");
    // Esconder cards de admin
    el("stat-users-card").style.display = "none";
    el("stat-suggestions-card").style.display = "none";
    // Mostrar cards de profissional
    el("stat-exercises-card").style.display = "flex";
    el("stat-plans-card").style.display = "flex";
    el("stat-favorites-card").style.display = "flex";
    // Início Rápido visível
    el("dashboard-pro-actions").style.display = "grid";
    // Bottom nav profissional
    el("bottom-nav-pro")?.classList.add("visible");
    el("bottom-nav-admin")?.classList.remove("visible");
    loadFavorites();
  }
  navigateTo("dashboard");
}

// ─── AUTH TABS ────────────────────────────────────────────────────────────
window.switchAuthTab = (tab) => {
  el("login-form").classList.toggle("hidden", tab !== "login");
  el("register-form").classList.toggle("hidden", tab !== "register");
  document.querySelectorAll(".auth-tab").forEach((t, i) => {
    t.classList.toggle("active", (i === 0 && tab === "login") || (i === 1 && tab === "register"));
  });
};

// ─── LOGIN ────────────────────────────────────────────────────────────────
window.doLogin = async () => {
  hideError("login-error");
  const email = el("login-email").value.trim();
  const password = el("login-password").value;
  if (!email || !password) { showError("login-error", "Preencha todos os campos."); return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const msgs = {
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/invalid-credential": "E-mail ou senha inválidos.",
      "auth/too-many-requests": "Muitas tentativas. Tente mais tarde."
    };
    showError("login-error", msgs[e.code] || "Erro ao entrar.");
  }
};

// ─── REGISTER ────────────────────────────────────────────────────────────
window.doRegister = async () => {
  hideError("register-error");
  hide("register-success");
  const name = el("reg-name").value.trim();
  const crefito = el("reg-crefito").value.trim();
  const email = el("reg-email").value.trim();
  const password = el("reg-password").value;
  if (!name || !email || !password) { showError("register-error", "Preencha todos os campos obrigatórios."); return; }
  if (password.length < 6) { showError("register-error", "Senha mínima de 6 caracteres."); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, crefito, email, role: "professional",
      status: "pending", createdAt: serverTimestamp()
    });
    show("register-success");
    el("register-success").textContent = "Cadastro enviado! Aguarde aprovação do administrador.";
    // Notificar admin via Ntfy
    await sendPushNotification(
      "🏥 Novo cadastro no Fisio+",
      `${name} (${crefito || "sem CREFITO"}) solicitou acesso ao Fisio+. Acesse o app para aprovar.`
    );
  } catch (e) {
    const msgs = {
      "auth/email-already-in-use": "Este e-mail já está cadastrado.",
      "auth/invalid-email": "E-mail inválido."
    };
    showError("register-error", msgs[e.code] || "Erro ao cadastrar.");
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────
window.doLogout = async () => {
  await signOut(auth);
  selectedForPlan = [];
  favorites.clear();
};

// ─── NAVIGATION ──────────────────────────────────────────────────────────
window.navigateTo = (page) => {
  currentPage = page;
  document.querySelectorAll("[id^='page-']").forEach(p => p.classList.add("hidden"));
  show(`page-${page}`);
  // Sidebar (desktop)
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  el(`nav-${page}`)?.classList.add("active");
  // Bottom nav (mobile)
  document.querySelectorAll(".bottom-nav-item").forEach(n => n.classList.remove("active"));
  el(`bnav-${page}`)?.classList.add("active");
  // Admin bottom nav
  el(`bnav-admin-dashboard`)?.classList.remove("active");
  el(`bnav-admin-manage`)?.classList.remove("active");
  el(`bnav-admin-users`)?.classList.remove("active");
  el(`bnav-admin-suggestions`)?.classList.remove("active");
  if (page === "dashboard") el("bnav-admin-dashboard")?.classList.add("active");
  else if (page === "manage-exercises") el("bnav-admin-manage")?.classList.add("active");
  else if (page === "users") el("bnav-admin-users")?.classList.add("active");
  else if (page === "suggestions") el("bnav-admin-suggestions")?.classList.add("active");
  if (page === "dashboard") loadDashboard();
  else if (page === "exercises") loadExercisesPage();
  else if (page === "favorites") loadFavoritesPage();
  else if (page === "plans") loadPlansPage();
  else if (page === "manage-exercises") loadManageExercises();
  else if (page === "users") loadUsers();
  else if (page === "suggestions") loadSuggestions();
};

// ─── DASHBOARD ───────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const exSnap = await getDocs(collection(db, "exercises"));
    el("stat-exercises").textContent = exSnap.size;
    if (currentUserData.role === "admin") {
      const usersSnap = await getDocs(query(collection(db, "users"), where("status", "==", "approved")));
      el("stat-users").textContent = usersSnap.size;
      const sugSnap = await getDocs(query(collection(db, "suggestions"), where("status", "==", "pending")));
      el("stat-suggestions").textContent = sugSnap.size;
      el("stat-suggestions-card").style.display = "flex";
    } else {
      const planSnap = await getDocs(query(collection(db, "plans"), where("createdBy", "==", currentUser.uid)));
      el("stat-plans").textContent = planSnap.size;
      el("stat-favorites").textContent = favorites.size;
    }
  } catch (e) { console.error(e); }
}

// ─── NTFY PUSH NOTIFICATION ──────────────────────────────────────────────
async function sendPushNotification(title, message) {
  try {
    const fullMessage = `${title}: ${message}`;
    const encoded = encodeURIComponent(fullMessage);
    // Usar beacon API — não tem bloqueio de CORS
    const blob = new Blob([fullMessage], { type: "text/plain" });
    navigator.sendBeacon(`https://ntfy.sh/fisioplus-ortoflix`, blob);
  } catch (e) { console.error("Erro ao enviar notificação:", e); }
}

// ─── BADGE / NOTIFICAÇÕES ────────────────────────────────────────────────
async function checkPendingBadge() {
  if (currentUserData.role !== "admin") return;
  try {
    const snap = await getDocs(query(collection(db, "users"), where("status", "==", "pending")));
    const count = snap.size;
    // Badge no ícone do PWA
    if ("setAppBadge" in navigator) {
      if (count > 0) navigator.setAppBadge(count);
      else navigator.clearAppBadge();
    }
    // Badge bottom nav
    const badgeNav = el("badge-pending");
    if (badgeNav) {
      badgeNav.textContent = count;
      if (count > 0) {
        badgeNav.classList.remove("hidden");
        badgeNav.style.display = "flex";
      } else {
        badgeNav.classList.add("hidden");
      }
    }
    // Badge dashboard usuários
    const badgeDash = el("badge-pending-dash");
    if (badgeDash) {
      badgeDash.textContent = count;
      if (count > 0) {
        badgeDash.classList.remove("hidden");
        badgeDash.style.display = "inline-flex";
      } else {
        badgeDash.classList.add("hidden");
      }
    }

    // Badge sugestões pendentes
    const sugSnap = await getDocs(query(collection(db, "suggestions"), where("status", "==", "pending")));
    const sugCount = sugSnap.size;
    el("stat-suggestions").textContent = sugCount;
    const badgeSug = el("badge-suggestions-icon");
    if (badgeSug) {
      badgeSug.textContent = sugCount;
      if (sugCount > 0) {
        badgeSug.classList.remove("hidden");
        badgeSug.style.display = "flex";
      } else {
        badgeSug.classList.add("hidden");
      }
    }
  } catch (e) { console.error(e); }
}

// ─── LOAD EXERCISES ───────────────────────────────────────────────────────
async function loadExercisesFromDB() {
  const snap = await getDocs(query(collection(db, "exercises"), orderBy("name")));
  allExercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return allExercises;
}

async function loadFavorites() {
  try {
    const favDoc = await getDoc(doc(db, "favorites", currentUser.uid));
    if (favDoc.exists()) favorites = new Set(favDoc.data().exerciseIds || []);
  } catch (e) { console.error(e); }
}

async function saveFavorites() {
  await setDoc(doc(db, "favorites", currentUser.uid), {
    exerciseIds: [...favorites], userId: currentUser.uid
  });
}

// ─── EXERCISES PAGE ──────────────────────────────────────────────────────
async function loadExercisesPage() {
  el("plan-count").textContent = selectedForPlan.length;
  el("exercises-grid").innerHTML = `<div class="loading-center"><div class="spinner"></div><span class="text-muted">Carregando...</span></div>`;
  await loadExercisesFromDB();
  buildTagFilters();
  renderExercisesGrid(allExercises);
}

function buildTagFilters() {
  const allTags = new Set();
  allExercises.forEach(ex => (ex.tags || []).forEach(t => allTags.add(t)));
  const wrap = el("tag-filters");
  wrap.innerHTML = `<span class="filter-tag active" data-tag="all" onclick="selectTag(this,'all')">Todos</span>`;
  [...allTags].sort().forEach(tag => {
    const span = document.createElement("span");
    span.className = "filter-tag";
    span.dataset.tag = tag;
    span.textContent = tag;
    span.onclick = () => selectTag(span, tag);
    wrap.appendChild(span);
  });
}

window.selectTag = (el_tag, tag) => {
  document.querySelectorAll(".filter-tag").forEach(t => t.classList.remove("active"));
  el_tag.classList.add("active");
  filterExercises();
};

window.filterExercises = () => {
  const search = el("search-input").value.toLowerCase();
  const activeTag = document.querySelector(".filter-tag.active")?.dataset.tag || "all";
  const filtered = allExercises.filter(ex => {
    const matchSearch = !search ||
      ex.name.toLowerCase().includes(search) ||
      (ex.description || "").toLowerCase().includes(search) ||
      (ex.tags || []).some(t => t.toLowerCase().includes(search));
    const matchTag = activeTag === "all" || (ex.tags || []).includes(activeTag);
    return matchSearch && matchTag;
  });
  renderExercisesGrid(filtered);
};

function renderExercisesGrid(exercises) {
  const grid = el("exercises-grid");
  if (!exercises.length) {
    grid.innerHTML = `<div class="loading-center" style="grid-column:1/-1;"><p class="text-muted">Nenhum exercício encontrado.</p></div>`;
    return;
  }
  grid.innerHTML = exercises.map(ex => renderExerciseCard(ex)).join("");
}

function renderExerciseCard(ex) {
  const isFav = favorites.has(ex.id);
  const isSelected = selectedForPlan.find(s => s.id === ex.id);
  const imgContent = ex.imageData
    ? `<img src="${ex.imageData}" alt="${ex.name}" />`
    : `<span>🏋️</span>`;
  return `
    <div class="exercise-card ${isSelected ? 'selected' : ''}" id="excard-${ex.id}">
      <div class="exercise-img" onclick="openDetailModal('${ex.id}')">${imgContent}</div>
      <button class="fav-btn" onclick="toggleFavorite(event,'${ex.id}')" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
        ${isFav ? "⭐" : "☆"}
      </button>
      ${isSelected ? `<div class="select-check">✅</div>` : ""}
      <div class="exercise-body" onclick="openDetailModal('${ex.id}')">
        <div class="exercise-name">${ex.name}</div>
        <div class="exercise-desc">${ex.description || ""}</div>
        <div class="tags-wrap">${(ex.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
      <div class="exercise-actions">
        <button class="btn btn-secondary btn-sm w-full" onclick="togglePlanSelect(event,'${ex.id}')">
          ${isSelected ? "✅ Selecionado" : "➕ Adicionar ao Plano"}
        </button>
      </div>
    </div>`;
}

// ─── FAVORITES PAGE ──────────────────────────────────────────────────────
async function loadFavoritesPage() {
  el("favorites-grid").innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  await loadExercisesFromDB();
  const favExercises = allExercises.filter(ex => favorites.has(ex.id));
  const grid = el("favorites-grid");
  if (!favExercises.length) {
    grid.innerHTML = `<div class="loading-center" style="grid-column:1/-1;"><p class="text-muted">Você ainda não tem favoritos.<br>Explore os exercícios e marque com ⭐</p></div>`;
    return;
  }
  grid.innerHTML = favExercises.map(ex => renderExerciseCard(ex)).join("");
}

// ─── TOGGLE FAVORITE ─────────────────────────────────────────────────────
window.toggleFavorite = async (e, exId) => {
  e.stopPropagation();
  if (favorites.has(exId)) favorites.delete(exId);
  else favorites.add(exId);
  await saveFavorites();
  if (currentPage === "exercises") filterExercises();
  else if (currentPage === "favorites") loadFavoritesPage();
};

// ─── PLAN SELECTION ───────────────────────────────────────────────────────
window.togglePlanSelect = (e, exId) => {
  e.stopPropagation();
  const ex = allExercises.find(x => x.id === exId);
  if (!ex) return;
  const idx = selectedForPlan.findIndex(x => x.id === exId);
  if (idx >= 0) selectedForPlan.splice(idx, 1);
  else selectedForPlan.push({ ...ex, customSets: ex.sets || "", customFrequency: ex.frequency || "" });
  el("plan-count").textContent = selectedForPlan.length;
  filterExercises();
  if (el("plan-panel").classList.contains("open")) renderPlanPanel();
};

// ─── PLAN PANEL ───────────────────────────────────────────────────────────
window.openPlanPanel = () => {
  el("plan-panel").classList.add("open");
  el("main").classList.add("plan-open");
  hide("plan-link-result");
  renderPlanPanel();
};
window.closePlanPanel = () => {
  el("plan-panel").classList.remove("open");
  el("main").classList.remove("plan-open");
};

function renderPlanPanel() {
  const list = el("plan-exercises-list");
  if (!selectedForPlan.length) {
    list.innerHTML = `<p class="text-muted" style="font-size:13px;text-align:center;padding:20px 0;">Selecione exercícios na biblioteca.</p>`;
    return;
  }
  list.innerHTML = selectedForPlan.map((ex, i) => `
    <div style="background:var(--surface2);border-radius:8px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:10px;">
        <div style="width:28px;height:28px;background:var(--accent-soft);color:var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:12px;flex-shrink:0;">${i + 1}</div>
        <div style="flex:1;font-size:13px;font-weight:500;line-height:1.3;">${ex.name}</div>
        <button onclick="removePlanItem('${ex.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;flex-shrink:0;">✕</button>
      </div>
      <div style="padding:0 10px 10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Séries/Rep</div>
          <input
            type="text"
            value="${ex.customSets}"
            oninput="updatePlanExField('${ex.id}','customSets',this.value)"
            style="width:100%;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;outline:none;"
            placeholder="${ex.sets || 'Ex: 3x15'}"
          />
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Frequência</div>
          <input
            type="text"
            value="${ex.customFrequency}"
            oninput="updatePlanExField('${ex.id}','customFrequency',this.value)"
            style="width:100%;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;outline:none;"
            placeholder="${ex.frequency || 'Ex: 2x ao dia'}"
          />
        </div>
      </div>
    </div>
  `).join("");
}

window.updatePlanExField = (exId, field, value) => {
  const item = selectedForPlan.find(x => x.id === exId);
  if (item) item[field] = value;
};

window.removePlanItem = (exId) => {
  selectedForPlan = selectedForPlan.filter(x => x.id !== exId);
  el("plan-count").textContent = selectedForPlan.length;
  renderPlanPanel();
  filterExercises();
};

// ─── GENERATE PLAN LINK ───────────────────────────────────────────────────
window.generatePlanLink = async () => {
  const patientName = el("plan-patient-name").value.trim();
  if (!selectedForPlan.length) { alert("Selecione ao menos um exercício."); return; }
  if (!patientName) { alert("Informe o nome do paciente."); return; }
  try {
    const planRef = await addDoc(collection(db, "plans"), {
      patientName,
      exercises: selectedForPlan.map(ex => ({
        id: ex.id,
        customSets: ex.customSets || ex.sets || "",
        customFrequency: ex.customFrequency || ex.frequency || ""
      })),
      // manter retrocompatibilidade
      exerciseIds: selectedForPlan.map(ex => ex.id),
      createdBy: currentUser.uid,
      createdByName: currentUserData.name,
      createdAt: serverTimestamp()
    });
    const link = `${window.location.origin}${window.location.pathname}?plan=${planRef.id}`;
    el("plan-link-input").value = link;
    show("plan-link-result");
  } catch (e) { alert("Erro ao gerar link: " + e.message); }
};

window.copyPlanLink = () => {
  el("plan-link-input").select();
  navigator.clipboard.writeText(el("plan-link-input").value);
  el("plan-link-input").blur();
  alert("Link copiado!");
};

// ─── PLANS PAGE ───────────────────────────────────────────────────────────
async function loadPlansPage() {
  const tbody = el("plans-table-body");
  tbody.innerHTML = `<tr><td colspan="5" class="text-center"><div class="spinner" style="margin:20px auto;"></div></td></tr>`;
  try {
    const snap = await getDocs(query(
      collection(db, "plans"),
      where("createdBy", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    ));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">Nenhum plano criado ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const count = (p.exercises || p.exerciseIds || []).length;
      const link = `${window.location.origin}${window.location.pathname}?plan=${d.id}`;
      return `
        <tr>
          <td><strong>${p.patientName}</strong></td>
          <td>${count} exercício(s)</td>
          <td>${formatDate(p.createdAt)}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="copyLink('${link}')">📋 Copiar</button></td>
          <td>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="editPlan('${d.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deletePlan('${d.id}')">🗑</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Erro ao carregar.</td></tr>`; }
}

// ─── EDIT PLAN ────────────────────────────────────────────────────────────
window.editPlan = async (planId) => {
  if (!allExercises.length) await loadExercisesFromDB();
  const planDoc = await getDoc(doc(db, "plans", planId));
  if (!planDoc.exists()) return;
  const plan = planDoc.data();

  el("plan-patient-name").value = plan.patientName || "";

  // Suporte a formato novo (exercises[]) e antigo (exerciseIds[])
  if (plan.exercises && plan.exercises.length) {
    selectedForPlan = plan.exercises.map(pe => {
      const ex = allExercises.find(x => x.id === pe.id);
      return ex ? { ...ex, customSets: pe.customSets || ex.sets || "", customFrequency: pe.customFrequency || ex.frequency || "" } : null;
    }).filter(Boolean);
  } else {
    selectedForPlan = (plan.exerciseIds || []).map(id => {
      const ex = allExercises.find(x => x.id === id);
      return ex ? { ...ex, customSets: ex.sets || "", customFrequency: ex.frequency || "" } : null;
    }).filter(Boolean);
  }

  el("plan-count").textContent = selectedForPlan.length;
  el("plan-panel").classList.add("open");
  el("main").classList.add("plan-open");
  hide("plan-link-result");
  renderPlanPanel();

  const btn = el("plan-panel").querySelector("button.btn-primary");
  btn.textContent = "💾 Salvar Alterações";
  btn.onclick = async () => {
    const patientName = el("plan-patient-name").value.trim();
    if (!selectedForPlan.length) { alert("Selecione ao menos um exercício."); return; }
    if (!patientName) { alert("Informe o nome do paciente."); return; }
    await updateDoc(doc(db, "plans", planId), {
      patientName,
      exercises: selectedForPlan.map(ex => ({
        id: ex.id,
        customSets: ex.customSets || ex.sets || "",
        customFrequency: ex.customFrequency || ex.frequency || ""
      })),
      exerciseIds: selectedForPlan.map(ex => ex.id)
    });
    closePlanPanel();
    btn.textContent = "🔗 Gerar Link para Paciente";
    btn.onclick = () => generatePlanLink();
    selectedForPlan = [];
    el("plan-count").textContent = 0;
    loadPlansPage();
    alert("Plano atualizado com sucesso!");
  };
  navigateTo("exercises");
};

window.copyLink = (link) => { navigator.clipboard.writeText(link); alert("Link copiado!"); };
window.deletePlan = async (id) => {
  if (!confirm("Excluir este plano?")) return;
  await deleteDoc(doc(db, "plans", id));
  loadPlansPage();
};

// ─── DETAIL MODAL ────────────────────────────────────────────────────────
window.openDetailModal = (exId) => {
  const ex = allExercises.find(x => x.id === exId);
  if (!ex) return;
  currentDetailExercise = ex;
  el("detail-modal-title").textContent = ex.name;
  el("detail-desc").textContent = ex.description || "—";
  el("detail-instructions").textContent = ex.instructions || "—";
  el("detail-sets").textContent = ex.sets || "—";
  el("detail-frequency").textContent = ex.frequency || "—";
  const imgWrap = el("detail-img-wrap");
  imgWrap.innerHTML = ex.imageData
    ? `<img src="${ex.imageData}" style="width:100%;max-height:300px;object-fit:cover;border-radius:var(--radius);" />`
    : "";
  el("detail-tags-wrap").innerHTML = (ex.tags || []).map(t => `<span class="tag">${t}</span>`).join(" ");
  const isSelected = selectedForPlan.find(s => s.id === exId);
  const addBtn = el("detail-add-plan-btn");
  addBtn.textContent = isSelected ? "✅ Já no Plano" : "➕ Adicionar ao Plano";
  addBtn.onclick = () => { togglePlanSelect(new Event("click"), exId); closeDetailModal(); };
  show("detail-modal");
};
window.closeDetailModal = () => hide("detail-modal");

// ─── MANAGE EXERCISES (Admin) ─────────────────────────────────────────────
async function loadManageExercises() {
  const tbody = el("manage-exercises-tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="text-center"><div class="spinner" style="margin:20px auto;"></div></td></tr>`;
  await loadExercisesFromDB();
  if (!allExercises.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:32px;">Nenhum exercício cadastrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = allExercises.map(ex => `
    <tr>
      <td>${ex.imageData
        ? `<img src="${ex.imageData}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;" />`
        : `<div style="width:52px;height:52px;background:var(--surface2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">🏋️</div>`}
      </td>
      <td><strong>${ex.name}</strong></td>
      <td><div class="tags-wrap">${(ex.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div></td>
      <td>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="openExerciseModal('${ex.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteExercise('${ex.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join("");
}

// ─── EXERCISE MODAL ───────────────────────────────────────────────────────
window.openExerciseModal = (exId = null) => {
  editingExerciseId = exId;
  el("exercise-modal-title").textContent = exId ? "Editar Exercício" : "Novo Exercício";
  el("exercise-edit-id").value = exId || "";
  ["ex-name","ex-desc","ex-instructions","ex-sets","ex-frequency","ex-tags","ex-img-data"].forEach(id => el(id).value = "");
  el("ex-img-preview").classList.add("hidden");
  el("upload-placeholder").classList.remove("hidden");
  if (exId) {
    const ex = allExercises.find(x => x.id === exId);
    if (ex) {
      el("ex-name").value = ex.name || "";
      el("ex-desc").value = ex.description || "";
      el("ex-instructions").value = ex.instructions || "";
      el("ex-sets").value = ex.sets || "";
      el("ex-frequency").value = ex.frequency || "";
      el("ex-tags").value = (ex.tags || []).join(", ");
      if (ex.imageData) {
        el("ex-img-data").value = ex.imageData;
        el("ex-img-preview").src = ex.imageData;
        el("ex-img-preview").classList.remove("hidden");
        el("upload-placeholder").classList.add("hidden");
      }
    }
  }
  show("exercise-modal");
};
window.closeExerciseModal = () => hide("exercise-modal");

window.previewImage = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert("Imagem muito grande. Use imagens menores que 2MB."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    el("ex-img-data").value = data;
    el("ex-img-preview").src = data;
    el("ex-img-preview").classList.remove("hidden");
    el("upload-placeholder").classList.add("hidden");
  };
  reader.readAsDataURL(file);
};

window.saveExercise = async () => {
  const name = el("ex-name").value.trim();
  if (!name) { alert("Informe o nome do exercício."); return; }
  const data = {
    name,
    description: el("ex-desc").value.trim(),
    instructions: el("ex-instructions").value.trim(),
    sets: el("ex-sets").value.trim(),
    frequency: el("ex-frequency").value.trim(),
    tags: el("ex-tags").value.trim().split(",").map(t => t.trim()).filter(Boolean),
    imageData: el("ex-img-data").value,
    updatedAt: serverTimestamp()
  };
  try {
    if (editingExerciseId) {
      await updateDoc(doc(db, "exercises", editingExerciseId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "exercises"), data);
    }
    closeExerciseModal();
    loadManageExercises();
  } catch (e) { alert("Erro ao salvar: " + e.message); }
};

window.deleteExercise = async (id) => {
  if (!confirm("Excluir este exercício?")) return;
  await deleteDoc(doc(db, "exercises", id));
  loadManageExercises();
};

// ─── USERS (Admin) ────────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = el("users-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="text-center"><div class="spinner" style="margin:20px auto;"></div></td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">Nenhum usuário.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const u = d.data();
      const isAdmin = u.email === ADMIN_EMAIL;
      const statusBadge = isAdmin
        ? `<span class="badge badge-admin">Admin</span>`
        : u.status === "approved"
          ? `<span class="badge badge-approved">✅ Ativo</span>`
          : u.status === "rejected"
            ? `<span class="badge" style="background:rgba(248,81,73,0.15);color:#f85149;">❌ Rejeitado</span>`
            : `<span class="badge badge-pending">⏳ Pendente</span>`;
      const actions = isAdmin ? "—" : u.status === "pending"
        ? `<div style="display:flex;gap:6px;">
            <button class="btn btn-primary btn-sm" onclick="approveUser('${d.id}')">✅ Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="rejectUser('${d.id}', '${u.email}')">❌ Rejeitar</button>
           </div>`
        : u.status === "rejected"
          ? `<button class="btn btn-secondary btn-sm" onclick="approveUser('${d.id}')">✅ Aprovar assim mesmo</button>`
          : `<button class="btn btn-danger btn-sm" onclick="revokeUser('${d.id}')">🚫 Revogar</button>`;
      return `<tr>
        <td><strong>${u.name || "—"}</strong></td>
        <td>${u.email}</td>
        <td>${u.crefito || "—"}</td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("");
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Erro ao carregar.</td></tr>`; }
}

window.approveUser = async (uid) => {
  await updateDoc(doc(db, "users", uid), { status: "approved" });
  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) {
    const u = userDoc.data();
    await sendApprovalEmail(u.name || "Profissional", u.email);
  }
  checkPendingBadge();
  loadUsers();
};
window.rejectUser = async (uid, email) => {
  if (!confirm(`Rejeitar o cadastro de ${email}?`)) return;
  await updateDoc(doc(db, "users", uid), { status: "rejected" });
  checkPendingBadge();
  loadUsers();
};

window.revokeUser = async (uid) => {
  if (!confirm("Revogar acesso deste usuário?")) return;
  await updateDoc(doc(db, "users", uid), { status: "pending" });
  loadUsers();
};

// ─── SUGGESTIONS ──────────────────────────────────────────────────────────
window.openSuggestionModal = () => {
  el("sug-name").value = "";
  el("sug-region").value = "";
  el("sug-details").value = "";
  hide("sug-error");
  hide("sug-success");
  show("suggestion-modal");
};
window.closeSuggestionModal = () => hide("suggestion-modal");

window.submitSuggestion = async () => {
  const name = el("sug-name").value.trim();
  const region = el("sug-region").value.trim();
  const details = el("sug-details").value.trim();
  hide("sug-error"); hide("sug-success");
  if (!name) {
    el("sug-error").textContent = "Informe o nome do exercício.";
    show("sug-error"); return;
  }
  try {
    await addDoc(collection(db, "suggestions"), {
      exerciseName: name, region, details,
      submittedBy: currentUserData.name || currentUser.email,
      submittedByEmail: currentUser.email,
      status: "pending", createdAt: serverTimestamp()
    });
    show("sug-success");
    el("sug-success").textContent = "Sugestão enviada com sucesso! Obrigado 🎉";
    el("sug-name").value = ""; el("sug-region").value = ""; el("sug-details").value = "";
    setTimeout(() => closeSuggestionModal(), 2000);
  } catch (e) {
    el("sug-error").textContent = "Erro ao enviar: " + e.message;
    show("sug-error");
  }
};

async function loadSuggestions() {
  const tbody = el("suggestions-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="text-center"><div class="spinner" style="margin:20px auto;"></div></td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "suggestions"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">Nenhuma sugestão recebida ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const s = d.data();
      const badge = s.status === "done"
        ? `<span class="badge badge-approved">✅ Adicionado</span>`
        : `<span class="badge badge-pending">⏳ Pendente</span>`;
      return `<tr>
        <td><strong>${s.submittedBy || "—"}</strong><br><span style="font-size:12px;color:var(--text-muted);">${s.submittedByEmail || ""}</span></td>
        <td><strong>${s.exerciseName}</strong>${s.region ? `<br><span style="font-size:12px;color:var(--text-muted);">${s.region}</span>` : ""}</td>
        <td style="font-size:13px;color:var(--text-muted);max-width:200px;">${s.details || "—"}</td>
        <td>${formatDate(s.createdAt)}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${badge}
          ${s.status !== "done" ? `<button class="btn btn-primary btn-sm" onclick="markSuggestionDone('${d.id}')">✅</button>` : ""}
          <button class="btn btn-danger btn-sm" onclick="deleteSuggestion('${d.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join("");
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Erro ao carregar.</td></tr>`; }
}

window.markSuggestionDone = async (id) => {
  await updateDoc(doc(db, "suggestions", id), { status: "done" });
  loadSuggestions();
};
window.deleteSuggestion = async (id) => {
  if (!confirm("Excluir esta sugestão?")) return;
  await deleteDoc(doc(db, "suggestions", id));
  loadSuggestions();
};

// ─── PATIENT VIEW ─────────────────────────────────────────────────────────
async function showPatientView(planId) {
  hide("auth-screen"); hide("app"); hide("pending-screen");
  show("patient-view");

  const planDoc = await getDoc(doc(db, "plans", planId));
  if (!planDoc.exists()) {
    el("patient-exercises-list").innerHTML = `<div class="alert alert-danger">Plano não encontrado ou expirado.</div>`;
    return;
  }
  const plan = planDoc.data();
  el("patient-plan-title").textContent = `Plano de Exercícios — ${plan.patientName}`;
  el("patient-plan-subtitle").textContent = `Prescrito por ${plan.createdByName || "seu fisioterapeuta"} • ${formatDate(plan.createdAt)}`;

  // Suporte ao formato novo (exercises[]) e antigo (exerciseIds[])
  const planExercises = plan.exercises && plan.exercises.length
    ? plan.exercises
    : (plan.exerciseIds || []).map(id => ({ id, customSets: "", customFrequency: "" }));

  const exercises = await Promise.all(planExercises.map(async (pe) => {
    const d = await getDoc(doc(db, "exercises", pe.id));
    if (!d.exists()) return null;
    return {
      ...d.data(),
      id: d.id,
      displaySets: pe.customSets || d.data().sets || "",
      displayFrequency: pe.customFrequency || d.data().frequency || ""
    };
  }));

  const container = el("patient-exercises-list");
  container.innerHTML = exercises.filter(Boolean).map((ex, i) => `
    <div class="patient-exercise">
      <div class="patient-exercise-header" onclick="togglePatientExercise('pex-${i}')">
        <div class="patient-exercise-num">${i + 1}</div>
        <div class="patient-exercise-info">
          <div class="patient-exercise-name">${ex.name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${(ex.tags || []).join(" • ")}</div>
        </div>
        <span id="pex-arrow-${i}" style="color:var(--text-muted);font-size:18px;">▼</span>
      </div>
      <div id="pex-${i}" class="patient-exercise-body hidden">
        ${ex.imageData ? `<img src="${ex.imageData}" style="display:block;width:100%;max-width:600px;object-fit:contain;border-radius:10px;margin:16px auto;" />` : ""}
        <div class="mb-4">
          <div class="section-label">Descrição</div>
          <div class="exercise-detail-text">${ex.description || "—"}</div>
        </div>
        <div class="mb-4">
          <div class="section-label">Como Executar</div>
          <div class="exercise-detail-text" style="white-space:pre-line;">${ex.instructions || "—"}</div>
        </div>
        ${ex.displaySets || ex.displayFrequency ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          ${ex.displaySets ? `<div><div class="section-label">Séries / Repetições</div><div class="exercise-detail-text">${ex.displaySets}</div></div>` : ""}
          ${ex.displayFrequency ? `<div><div class="section-label">Frequência</div><div class="exercise-detail-text">${ex.displayFrequency}</div></div>` : ""}
        </div>` : ""}
      </div>
    </div>`).join("");
}

window.togglePatientExercise = (id) => {
  const body = el(id);
  const idx = id.replace("pex-", "");
  const arrow = el(`pex-arrow-${idx}`);
  const isHidden = body.classList.contains("hidden");
  body.classList.toggle("hidden", !isHidden);
  arrow.textContent = isHidden ? "▲" : "▼";
};
