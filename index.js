
const roleToggle = document.getElementById("roleToggle");
const roleInput = document.getElementById("roleInput");
const credentialFields = document.getElementById("credentialFields");
const anonymousBtn = document.getElementById("anonymousBtn");
const loginForm = document.getElementById("loginForm");
const API_BASE = "http://localhost:3000/api";


// Simple user store helpers (localStorage)
function getUsers(){ try { return JSON.parse(localStorage.getItem('civic_users')||'[]'); } catch(e){ return [] } }
function setUsers(arr){ localStorage.setItem('civic_users', JSON.stringify(arr)); }
async function sha256Hex(str){ const enc=new TextEncoder().encode(str); const buf=await crypto.subtle.digest('SHA-256',enc); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function ensureSeedData(){
  const users = getUsers();
  if(!users.some(u=>u.role==='admin')){
    const id = 'admin-1';
    const identifier = 'admin@city.gov';
    const name = 'Main Admin';
    const passwordHash = await sha256Hex('Admin@123');
    users.push({ id, role:'admin', identifier, name, passwordHash, createdAt: Date.now() });
    setUsers(users);
  }
}
function recordCitizen(identifier){
  if(!identifier) return;
  const users = getUsers();
  if(users.some(u=>u.identifier===identifier)) return;
  users.push({ id: 'cit-'+Math.random().toString(36).slice(2), role:'citizen', identifier, createdAt: Date.now() });
  setUsers(users);
}

roleToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-role]");
  if (!btn) return;

  const role = btn.getAttribute("data-role");
  roleInput.value = role;

  // Set active state visually
  [...roleToggle.querySelectorAll("button")].forEach((b) => {
    b.classList.toggle("active", b === btn);
  });

  // If official, force credentials required & hide anonymous
  if (role === "official") {
    credentialFields.classList.remove("hidden");
    anonymousBtn.classList.add("hidden");
  } else {
    anonymousBtn.classList.remove("hidden");
  }
});

// "Continue as anonymous citizen" – hide credentials visually.
anonymousBtn.addEventListener("click", () => {
  credentialFields.classList.add("hidden");
  const city = document.getElementById("city").value || "";
  try { localStorage.setItem("civic_session", JSON.stringify({ role: "citizen", anonymous: true, city })); } catch(e) {}
  window.location.href = "dashboard.html";
});

// Demo submit handler
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  console.log("Login payload:", payload);
  const chosenRole = roleInput.value || 'citizen';

  // For now, only citizen login is validated against db.json.
  if (chosenRole !== 'citizen') {
    alert('Only citizen login via db.json is implemented.');
    return;
  }

  const email = payload.identifier || '';
  const password = payload.password || '';

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    if (!res.ok) {
      alert('Invalid email or password, or user not registered.');
      return;
    }

    const data = await res.json();
    const user = data.user || {};
    const session = { role: 'citizen', anonymous: false, city: payload.city || '', identifier: user.email || email, name: user.name || '', userId: user.id };

    try { localStorage.setItem('civic_session', JSON.stringify(session)); } catch(e) {}
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error(err);
    alert('Server error. Is json-server running?');
  }
});
