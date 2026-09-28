const API_BASE = "http://localhost:3000/api";

const form = document.getElementById("registerForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!name || !email || !password) {
    alert("Please fill all fields");
    return;
  }

  try {
    // Check if email already exists
    const checkRes = await fetch(
      `${API_BASE}/users?email=${encodeURIComponent(email)}`
    );
    const existing = await checkRes.json();
    if (existing.length > 0) {
      alert("User with this email already exists. Please login.");
      return;
    }

    // Create user
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, status: "active" }),
    });

    if (!res.ok) {
      alert("Failed to register. Try again.");
      return;
    }

    window.location.href = "register-success.html";
  } catch (err) {
    console.error(err);
    alert("Server error. Is json-server running?");
  }
});
