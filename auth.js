import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

if (!window.__ENV__) {
  throw new Error("env.js not loaded");
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.__ENV__;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --------------------------------------------
// Global Session Guard
// --------------------------------------------
export async function requireAuth() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn("Session error:", error.message);
      await supabase.auth.signOut();
      redirectToLogin();
      return null;
    }

    if (!data.session) {
      redirectToLogin();
      return null;
    }

    return data.session.user;

  } catch (err) {
    console.error("Auth crash:", err);
    await supabase.auth.signOut();
    redirectToLogin();
    return null;
  }
}

// --------------------------------------------
// Auto-handle expired tokens
// --------------------------------------------
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectToLogin();
  }
});

function redirectToLogin() {
  if (!window.location.pathname.includes("login.html")) {
    window.location.href = "login.html";
  }
}